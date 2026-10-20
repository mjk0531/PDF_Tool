/**
 * Pixel analysis for natural-looking edits.
 *
 * Everything here works on a rendered page raster (device pixels, top-left
 * origin). It answers three questions about a region:
 *  - what colour is the background around it, and how uniform is it?
 *  - what colour is the ink (the glyphs) inside it?
 *  - what would the region look like with the ink gone? (`inpaint`)
 *
 * The inpainting is a Coons patch: the four borders just outside the region
 * are sampled, cleaned of stray ink, smoothed, and blended across the
 * interior, with grain matching the surrounding paper added back so the patch
 * doesn't look like a flat sticker on a scanned page.
 */

import type { Box } from './editorGeometry'

export interface Raster {
  data: Uint8ClampedArray
  width: number
  height: number
}

export type RGB = [number, number, number]

export interface RegionStats {
  /** Median colour of the ring around the region. */
  bg: RGB
  /** 75th-percentile distance of ring pixels from `bg` — 0 for a flat fill. */
  bgSpread: number
  /** Core colour of the glyphs, or null when the region holds no ink. */
  ink: RGB | null
  /** Share of the region's pixels that are ink. */
  inkRatio: number
}

export function rgbToHex([r, g, b]: RGB): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

export function hexToRgbTuple(hex: string): RGB {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const n = parseInt(full, 16) || 0
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

function dist(a: RGB, r: number, g: number, b: number): number {
  const dr = a[0] - r
  const dg = a[1] - g
  const db = a[2] - b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function chroma([r, g, b]: RGB): number {
  return Math.max(r, g, b) - Math.min(r, g, b)
}

/** Anti-aliasing leaves black glyph cores a shade off black — snap those (but keep #222-style greys). */
export function snapInk(c: RGB): RGB {
  if (Math.max(...c) < 22 && chroma(c) < 10) return [0, 0, 0]
  return c
}

/** Paper that rasterises as near-white is white. */
export function snapBg(c: RGB): RGB {
  if (Math.min(...c) > 246 && chroma(c) < 6) return [255, 255, 255]
  return c
}

function medianOf(values: number[]): number {
  if (values.length === 0) return 0
  const s = values.slice().sort((a, b) => a - b)
  return s[s.length >> 1]
}

function clampBox(r: Raster, b: Box) {
  const x0 = Math.max(0, Math.floor(b.left))
  const y0 = Math.max(0, Math.floor(b.top))
  const x1 = Math.min(r.width, Math.ceil(b.left + b.width))
  const y1 = Math.min(r.height, Math.ceil(b.top + b.height))
  return { x0, y0, x1, y1 }
}

/** Colours of the ring of width `pad` around `box` (sub-sampled when large). */
function ringSamples(r: Raster, box: Box, pad: number): RGB[] {
  const inner = clampBox(r, box)
  const outer = clampBox(r, {
    left: box.left - pad,
    top: box.top - pad,
    width: box.width + pad * 2,
    height: box.height + pad * 2,
  })
  const area = (outer.x1 - outer.x0) * (outer.y1 - outer.y0)
  const step = Math.max(1, Math.floor(Math.sqrt(area / 12000)))
  const out: RGB[] = []
  for (let y = outer.y0; y < outer.y1; y += step) {
    const insideRow = y >= inner.y0 && y < inner.y1
    for (let x = outer.x0; x < outer.x1; x += step) {
      if (insideRow && x >= inner.x0 && x < inner.x1) continue
      const i = (y * r.width + x) * 4
      out.push([r.data[i], r.data[i + 1], r.data[i + 2]])
    }
  }
  return out
}

/**
 * `coreCut` picks which ink pixels define the text colour: 0.82 = the darkest
 * cores (crisp vector text); lower values average in the soft edges, which
 * suits blurred scans — crisp new text in core colour looks heavier there.
 */
export function analyzeRegion(r: Raster, box: Box, pad: number, coreCut = 0.82): RegionStats {
  const ring = ringSamples(r, box, Math.max(2, pad))
  const bg: RGB =
    ring.length > 0
      ? [medianOf(ring.map((c) => c[0])), medianOf(ring.map((c) => c[1])), medianOf(ring.map((c) => c[2]))]
      : [255, 255, 255]
  const ringDist = ring.map((c) => dist(bg, c[0], c[1], c[2])).sort((a, b) => a - b)
  const bgSpread = ringDist.length ? ringDist[Math.floor(ringDist.length * 0.75)] : 0

  const { x0, y0, x1, y1 } = clampBox(r, box)
  const n = Math.max(0, (x1 - x0) * (y1 - y0))
  if (n === 0) return { bg: snapBg(bg), bgSpread, ink: null, inkRatio: 0 }

  const area = n
  const step = Math.max(1, Math.floor(Math.sqrt(area / 40000)))
  const ds: number[] = []
  const px: number[] = []
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * r.width + x) * 4
      ds.push(dist(bg, r.data[i], r.data[i + 1], r.data[i + 2]))
      px.push(i)
    }
  }
  const sorted = ds.slice().sort((a, b) => a - b)
  const maxD = sorted[Math.floor(sorted.length * 0.985)] ?? 0
  const threshold = Math.max(36, bgSpread * 2.5, maxD * 0.45)
  if (maxD < threshold) return { bg: snapBg(bg), bgSpread, ink: null, inkRatio: 0 }

  let inkCount = 0
  const core: RGB[] = []
  for (let k = 0; k < ds.length; k++) {
    if (ds[k] > threshold) inkCount++
    if (ds[k] >= maxD * coreCut) {
      const i = px[k]
      core.push([r.data[i], r.data[i + 1], r.data[i + 2]])
    }
  }
  const ink: RGB | null = core.length
    ? [medianOf(core.map((c) => c[0])), medianOf(core.map((c) => c[1])), medianOf(core.map((c) => c[2]))]
    : null
  return {
    bg: snapBg(bg),
    bgSpread,
    ink: ink ? snapInk(ink) : null,
    inkRatio: inkCount / ds.length,
  }
}

/**
 * Average stroke thickness of the ink inside `box`, in pixels. A stroke of
 * width w and length L has area w·L and about 2·L of ink/paper edges, so
 * w ≈ 2·area / edges — independent of script and of stroke direction.
 */
export function strokeWidth(r: Raster, box: Box, bg: RGB, ink: RGB): number {
  const { x0, y0, x1, y1 } = clampBox(r, box)
  const W = x1 - x0
  const H = y1 - y0
  if (W < 2 || H < 2) return 0
  const cut = dist(bg, ink[0], ink[1], ink[2]) * 0.5
  const mask = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = ((y + y0) * r.width + (x + x0)) * 4
      mask[y * W + x] = dist(bg, r.data[i], r.data[i + 1], r.data[i + 2]) > cut ? 1 : 0
    }
  }
  let area = 0
  let edges = 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = mask[y * W + x]
      area += v
      if (x + 1 < W && v !== mask[y * W + x + 1]) edges++
      if (y + 1 < H && v !== mask[(y + 1) * W + x]) edges++
    }
  }
  return edges > 0 ? (2 * area) / edges : 0
}

/* ---------- Inpainting ---------- */

function gaussian(): number {
  // Box–Muller
  const u = 1 - Math.random()
  const v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/**
 * Sample one border line (a row or column just outside the patch), averaging
 * a 3-pixel-thick strip, replacing ink-like samples by interpolating across
 * them, then smoothing. Returns `count` RGB triples.
 */
function sampleBorder(
  r: Raster,
  count: number,
  at: (k: number, t: number) => [number, number],
  bg: RGB,
  inkCut: number,
): { values: Float32Array; residual: number[] } {
  const raw = new Float32Array(count * 3)
  const valid = new Uint8Array(count)
  for (let k = 0; k < count; k++) {
    let sr = 0
    let sg = 0
    let sb = 0
    let m = 0
    for (let t = 0; t < 3; t++) {
      const [x, y] = at(k, t)
      if (x < 0 || y < 0 || x >= r.width || y >= r.height) continue
      const i = (Math.floor(y) * r.width + Math.floor(x)) * 4
      sr += r.data[i]
      sg += r.data[i + 1]
      sb += r.data[i + 2]
      m++
    }
    if (m === 0) continue
    sr /= m
    sg /= m
    sb /= m
    if (dist(bg, sr, sg, sb) <= inkCut) {
      raw[k * 3] = sr
      raw[k * 3 + 1] = sg
      raw[k * 3 + 2] = sb
      valid[k] = 1
    }
  }
  // Fill invalid runs by linear interpolation between valid neighbours.
  let prev = -1
  for (let k = 0; k < count; k++) {
    if (!valid[k]) continue
    for (let j = prev + 1; j < k; j++) {
      const t = prev >= 0 ? (j - prev) / (k - prev) : 1
      for (let ch = 0; ch < 3; ch++) {
        const a = prev >= 0 ? raw[prev * 3 + ch] : raw[k * 3 + ch]
        raw[j * 3 + ch] = a + (raw[k * 3 + ch] - a) * t
      }
    }
    prev = k
  }
  for (let j = prev + 1; j < count; j++) {
    for (let ch = 0; ch < 3; ch++) raw[j * 3 + ch] = prev >= 0 ? raw[prev * 3 + ch] : bg[ch]
  }
  // Smooth with a moving average so grain doesn't streak across the patch.
  const radius = Math.max(2, Math.round(count / 40))
  const out = new Float32Array(count * 3)
  const residual: number[] = []
  for (let k = 0; k < count; k++) {
    for (let ch = 0; ch < 3; ch++) {
      let s = 0
      let m = 0
      for (let j = Math.max(0, k - radius); j <= Math.min(count - 1, k + radius); j++) {
        s += raw[j * 3 + ch]
        m++
      }
      out[k * 3 + ch] = s / m
    }
    if (valid[k]) residual.push(raw[k * 3] - out[k * 3])
  }
  return { values: out, residual }
}

export interface Patch {
  /** PNG data URL of the reconstructed background. */
  dataUrl: string
  /** True when the surroundings are flat enough that a solid fill is as good. */
  uniform: boolean
  /** Mean colour, for the solid-fill fallback. */
  color: string
}

/** Reconstruct the background under `box` from its surroundings. */
export function inpaint(r: Raster, box: Box, stats: RegionStats): Patch {
  const W = Math.max(1, Math.round(box.width))
  const H = Math.max(1, Math.round(box.height))
  const x0 = Math.round(box.left)
  const y0 = Math.round(box.top)
  const inkCut = Math.max(28, stats.bgSpread * 3)
  const bg = stats.bg

  const top = sampleBorder(r, W, (k, t) => [x0 + k, y0 - 1 - t], bg, inkCut)
  const bottom = sampleBorder(r, W, (k, t) => [x0 + k, y0 + H + t], bg, inkCut)
  const left = sampleBorder(r, H, (k, t) => [x0 - 1 - t, y0 + k], bg, inkCut)
  const right = sampleBorder(r, H, (k, t) => [x0 + W + t, y0 + k], bg, inkCut)

  const residual = [...top.residual, ...bottom.residual, ...left.residual, ...right.residual]
  const sigma = Math.min(9, Math.sqrt(residual.reduce((s, v) => s + v * v, 0) / Math.max(1, residual.length)))

  const T = top.values
  const B = bottom.values
  const L = left.values
  const R = right.values
  const corner = (a: Float32Array, ai: number, b: Float32Array, bi: number, ch: number) =>
    (a[ai * 3 + ch] + b[bi * 3 + ch]) / 2

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(W, H)
  let sumR = 0
  let sumG = 0
  let sumB = 0
  for (let j = 0; j < H; j++) {
    const v = (j + 0.5) / H
    for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / W
      const grain = sigma > 0.8 ? gaussian() * sigma : 0
      const o = (j * W + i) * 4
      for (let ch = 0; ch < 3; ch++) {
        const tl = corner(T, 0, L, 0, ch)
        const tr = corner(T, W - 1, R, 0, ch)
        const bl = corner(B, 0, L, H - 1, ch)
        const br = corner(B, W - 1, R, H - 1, ch)
        const val =
          (1 - v) * T[i * 3 + ch] +
          v * B[i * 3 + ch] +
          (1 - u) * L[j * 3 + ch] +
          u * R[j * 3 + ch] -
          ((1 - u) * (1 - v) * tl + u * (1 - v) * tr + (1 - u) * v * bl + u * v * br)
        img.data[o + ch] = val + grain
      }
      img.data[o + 3] = 255
      sumR += img.data[o]
      sumG += img.data[o + 1]
      sumB += img.data[o + 2]
    }
  }
  ctx.putImageData(img, 0, 0)

  const n = W * H
  // Flat surroundings: a vector fill is crisper and smaller than a bitmap.
  const borderRange = Math.max(
    ...[T, B, L, R].map((arr) => {
      let lo = 255
      let hi = 0
      for (let k = 0; k < arr.length; k += 3) {
        const lum = arr[k] * 0.3 + arr[k + 1] * 0.59 + arr[k + 2] * 0.11
        if (lum < lo) lo = lum
        if (lum > hi) hi = lum
      }
      return hi - lo
    }),
  )
  const uniform = sigma < 2.5 && borderRange < 6 && stats.bgSpread < 8
  const mean: RGB = [sumR / n, sumG / n, sumB / n]
  return {
    dataUrl: uniform ? '' : canvas.toDataURL('image/png'),
    uniform,
    color: rgbToHex(uniform ? stats.bg : snapBg(mean)),
  }
}

/* ---------- Raster sources ---------- */

export function rasterFromCanvas(canvas: HTMLCanvasElement): Raster {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return { data: img.data, width: img.width, height: img.height }
}
