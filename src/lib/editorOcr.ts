/**
 * OCR for text that only exists as pixels (scans, photos, text inside images).
 *
 * The page is rendered at ~300 DPI and read by Tesseract at line level. Each
 * recognised line becomes a regular `TextLine`, with everything a natural
 * replacement needs measured from the pixels rather than guessed:
 *  - baseline and skew from Tesseract's baseline fit;
 *  - font size from the ink height above the baseline, normalised by how tall
 *    the same text is in the fallback font (so "mono" and "MONO" agree);
 *  - horizontal scale so the fallback font spans the original width;
 *  - ink and paper colour, and bold from the stroke thickness.
 * Tesseract's paragraphs carry over, with alignment inferred from geometry.
 */

import { createWorker, type Worker } from 'tesseract.js'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { apply, invert, makeViewport, overlapArea, type PageGeom } from './editorGeometry'
import { analyzeRegion, rasterFromCanvas, rgbToHex, strokeWidth, type Raster } from './editorPixels'
import { finishParagraph, lineBox, pageHints, type PageText, type Paragraph, type TextLine } from './editorLayout'
import { cssFontFamily, hasHangulOrCJK } from './editorFonts'
import { pick } from '../i18n'
import editMessages from '../i18n/messages/edit'

const OCR_DPI = 300
const MAX_SIDE_PX = 4200
/**
 * Stroke width / ink height above the baseline beyond which text reads as
 * bold. Measured: Arial 0.10 regular vs 0.15 bold; Malgun Gothic Hangul
 * 0.066 regular vs ~0.11 bold.
 */
const BOLD_RATIO = 0.128
const BOLD_RATIO_HANGUL = 0.092

/** Stroke weight measured per line, consumed by `decideWeights`. */
export const lineWeights = new WeakMap<TextLine, number>()

/**
 * Bold is relative: stroke ratios differ between typefaces (Malgun's Latin
 * is far lighter than Arial's), so a line is bold when it is clearly heavier
 * than the page's body text, or past the absolute bar for its script.
 */
export function decideWeights(lines: TextLine[]) {
  const ws = lines
    .filter((l) => (l.text.match(/[\p{L}\p{N}]/gu) ?? []).length >= 3)
    .map((l) => lineWeights.get(l) ?? 0)
    .filter((w) => w > 0)
    .sort((a, b) => a - b)
  const median = ws.length ? ws[ws.length >> 1] : 0
  const sizes = lines.map((l) => l.fontSize).sort((a, b) => a - b)
  const bodySize = sizes[sizes.length >> 1] ?? 0
  for (const l of lines) {
    const w = lineWeights.get(l) ?? 0
    if ((l.text.match(/[\p{L}\p{N}]/gu) ?? []).length < 3 || !w) {
      l.bold = false
      continue
    }
    const absolute = hangulShare(l.text) >= 0.2 ? BOLD_RATIO_HANGUL : BOLD_RATIO
    // Headings (well above body size) are bold more often than not.
    const factor = l.fontSize >= bodySize * 1.5 ? 1.25 : 1.4
    const relative = median ? Math.max(median * factor, 0.085) : absolute
    l.bold = w > Math.min(absolute, relative)
  }
}

function hangulShare(text: string): number {
  const letters = (text.match(/[\p{L}\p{N}]/gu) ?? []).length
  const hangul = (text.match(/[가-힣]/g) ?? []).length
  return letters ? hangul / letters : 0
}

export const EDITOR_OCR_LANGS: { code: string; label: string }[] = [
  { code: 'kor+eng', label: '한국어 + English' },
  { code: 'eng', label: 'English' },
  { code: 'jpn+eng', label: '日本語 + English' },
  { code: 'chi_sim+eng', label: '简体中文 + English' },
  { code: 'spa+eng', label: 'Español + English' },
  { code: 'fra+eng', label: 'Français + English' },
  { code: 'deu+eng', label: 'Deutsch + English' },
]

/* ---------- Worker (one, reused across pages) ---------- */

let worker: Worker | null = null
let workerLang: string | null = null
let chain: Promise<unknown> = Promise.resolve()

async function getWorker(lang: string): Promise<Worker> {
  if (worker && workerLang === lang) return worker
  if (worker) {
    await worker.terminate().catch(() => {})
    worker = null
  }
  worker = await createWorker(lang, 1)
  await worker.setParameters({ preserve_interword_spaces: '1', user_defined_dpi: String(OCR_DPI) })
  workerLang = lang
  return worker
}

/** Free the OCR worker once queued pages are done (never mid-recognition). */
export function terminateEditorOcr() {
  chain = chain.then(async () => {
    if (worker) await worker.terminate().catch(() => {})
    worker = null
    workerLang = null
  })
}

/* ---------- Rendering ---------- */

export async function renderPageRaster(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  scale: number,
): Promise<{ raster: Raster; canvas: HTMLCanvasElement }> {
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  page.cleanup()
  return { raster: rasterFromCanvas(canvas), canvas }
}

/* ---------- Text metrics in the fallback fonts ---------- */

let measureCtx: CanvasRenderingContext2D | null = null

/** Ink box and advance of `text` in the sans fallback, per unit font size. */
export async function inkMetrics(text: string, korean: boolean) {
  const family = cssFontFamily('sans', korean)
  try {
    await document.fonts.load(`100px ${family.split(',')[0]}`, text)
  } catch {
    /* measured with whatever is available */
  }
  measureCtx ??= document.createElement('canvas').getContext('2d')!
  measureCtx.font = `100px ${family}`
  const m = measureCtx.measureText(text)
  return {
    ascent: m.actualBoundingBoxAscent / 100,
    left: m.actualBoundingBoxLeft / 100,
    inkWidth: (m.actualBoundingBoxLeft + m.actualBoundingBoxRight) / 100,
    advance: m.width / 100,
  }
}

/* ---------- Main ---------- */

interface TessBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

interface TessWord {
  text: string
  confidence: number
  bbox: TessBox
}

interface TessLine {
  text: string
  confidence: number
  bbox: TessBox
  baseline: TessBox
  words?: TessWord[]
}

interface TessBlock {
  paragraphs: { lines: TessLine[] }[]
}

/**
 * Recognise one page. Runs are serialised — Tesseract has one worker and
 * pages queue behind each other.
 */
export function ocrPage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  geom: PageGeom,
  lang: string,
  onStatus?: (status: string) => void,
): Promise<PageText> {
  const run = chain.then(() => ocrPageNow(pdf, pageNumber, geom, lang, onStatus))
  chain = run.catch(() => {})
  return run
}

async function ocrPageNow(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  geom: PageGeom,
  lang: string,
  onStatus?: (status: string) => void,
): Promise<PageText> {
  const m = pick(editMessages).ocr
  onStatus?.(m.loadingEngine)
  const w = await getWorker(lang)

  const base = makeViewport(geom, 1)
  const scale = Math.min(OCR_DPI / 72, MAX_SIDE_PX / Math.max(base.width, base.height))
  const vp = makeViewport(geom, scale)
  const toUser = invert(vp.transform)
  const { raster, canvas } = await renderPageRaster(pdf, pageNumber, scale)

  onStatus?.(m.recognizing)
  const result = await w.recognize(canvas, {}, { blocks: true, text: false })
  let idx = 0
  const nextId = () => `O${pageNumber}-${idx++}`
  const reread = (seg: Segment) => rereadLine(w, raster, seg)
  let groups = await readBlocks(result.data.blocks, raster, scale, toUser, pageNumber, nextId, reread)

  // Light text on solid dark fills (table headers, banners) is classed as a
  // graphic by Tesseract's layout analysis; read each fill on its own.
  const regions = darkRegions(raster)
  if (regions.length) {
    const darkGroups: TextLine[][] = []
    for (const region of regions) {
      const { canvas: crop, dx, dy } = invertedCrop(raster, region)
      await w.setParameters({ tessedit_pageseg_mode: '6' as never })
      let res
      try {
        res = await w.recognize(crop, {}, { blocks: true, text: false })
      } finally {
        await w.setParameters({ tessedit_pageseg_mode: '3' as never })
      }
      const blocks = (res.data.blocks ?? []) as unknown as TessBlock[]
      shiftBlocks(blocks, dx, dy)
      const found = await readBlocks(blocks, raster, scale, toUser, pageNumber, nextId)
      for (const g of found) {
        const keep = g.filter((l) => luminance(l.bg) < 110 && (l.confidence ?? 0) >= 55)
        if (keep.length) darkGroups.push(keep)
      }
    }
    const darkBoxes = darkGroups.flat().map(lineBox)
    groups = groups
      .map((g) =>
        g.filter((l) => {
          const b = lineBox(l)
          return !darkBoxes.some((d) => overlapArea(d, b) > 0.3 * Math.min(b.width * b.height, d.width * d.height))
        }),
      )
      .filter((g) => g.length)
    groups.push(...darkGroups)
  }
  const lines = groups.flat()
  decideWeights(lines)

  const hints = pageHints(lines, geom.view)
  const paragraphs: Paragraph[] = groups.map((g, i) => {
    const id = `OP${pageNumber}-${i}`
    for (const l of g) l.paragraphId = id
    let gap = g[0].fontSize * 1.2
    if (g.length > 1) {
      // Baseline-to-baseline distance, measured across the (possibly skewed) baseline.
      const rad = (g[0].angle * Math.PI) / 180
      const gaps = g.slice(1).map((l, k) => Math.abs((g[k].x - l.x) * -Math.sin(rad) + (g[k].y - l.y) * Math.cos(rad)))
      gap = gaps.reduce((a, b) => a + b, 0) / gaps.length
    }
    return finishParagraph(id, pageNumber, g, gap, hints)
  })

  onStatus?.(m.done)
  return { lines, paragraphs }
}

/* ---------- Tesseract output → lines ---------- */

/** Table rules that Tesseract reads as glyphs. */
const RULE_RE = /^[|│¦｜[\]]+$/

interface Segment {
  text: string
  confidence: number
  bbox: TessBox
}

/**
 * Split a Tesseract line at column gaps and drop table rules read as "|", so
 * a table row becomes one editable line per cell — repainting a cell then
 * never wipes the rules between cells.
 */
function splitLine(tl: TessLine): Segment[] {
  const all = (tl.words ?? []).filter((w) => w.text.trim())
  const words = all.filter((w) => !RULE_RE.test(w.text.trim()))
  const whole = (): Segment[] => {
    const text = tl.text.replace(/[|│¦｜]/g, ' ')
    return text.trim() ? [{ text, confidence: tl.confidence, bbox: tl.bbox }] : []
  }
  if (!words.length) return whole()
  words.sort((a, b) => a.bbox.x0 - b.bbox.x0)
  const heights = words.map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b)
  const h = heights[heights.length >> 1]
  const rules = all.filter((w) => RULE_RE.test(w.text.trim())).map((w) => (w.bbox.x0 + w.bbox.x1) / 2)
  // Cell boundaries: a rule between two words, or a gap no justified line would leave.
  const segments: TessWord[][] = []
  for (const w of words) {
    const cur = segments[segments.length - 1]
    const prev = cur?.[cur.length - 1]
    const ruleBetween = prev && rules.some((x) => x > prev.bbox.x1 && x < w.bbox.x0)
    if (!prev || ruleBetween || w.bbox.x0 - prev.bbox.x1 > h * 1.6) segments.push([w])
    else cur.push(w)
  }
  if (segments.length === 1 && !rules.length) return whole()
  return segments.map((ws) => {
    return {
      text: wordsText(tl.text, ws),
      confidence: ws.reduce((s, w) => s + w.confidence, 0) / ws.length,
      bbox: {
        x0: Math.min(...ws.map((w) => w.bbox.x0)),
        y0: Math.min(...ws.map((w) => w.bbox.y0)),
        x1: Math.max(...ws.map((w) => w.bbox.x1)),
        y1: Math.max(...ws.map((w) => w.bbox.y1)),
      },
    }
  })
}

/** Paragraph groups of measured lines from one recognition pass. */
async function readBlocks(
  blocks: unknown,
  raster: Raster,
  scale: number,
  toUser: ReturnType<typeof invert>,
  page: number,
  nextId: () => string,
  reread?: (seg: Segment) => Promise<{ text: string; confidence: number } | null>,
): Promise<TextLine[][]> {
  const groups: TextLine[][] = []
  for (const block of (blocks ?? []) as TessBlock[]) {
    for (const para of block.paragraphs) {
      const group: TextLine[] = []
      for (const tl of para.lines) {
        if (reread) await refineWords(tl, reread)
        const segs = splitLine(tl)
        const made: TextLine[] = []
        for (const seg of segs) {
          const line = await toTextLine(seg, tl.baseline, raster, scale, toUser, page, nextId)
          if (line) made.push(line)
        }
        // A line split into cells is no longer part of a flowing paragraph.
        if (made.length > 1) made.forEach((l) => groups.push([l]))
        else group.push(...made)
      }
      if (group.length) groups.push(group)
    }
  }
  return groups
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114
}

/**
 * Solid dark fills large enough to hold text: a coarse grid of dark cells,
 * grouped into connected components that are mostly filled (text alone never
 * is — its strokes leave most cells light).
 */
function darkRegions(r: Raster): { left: number; top: number; width: number; height: number }[] {
  const cell = 6
  const gw = Math.ceil(r.width / cell)
  const gh = Math.ceil(r.height / cell)
  const grid = new Uint8Array(gw * gh)
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let sum = 0
      let n = 0
      for (const [dx, dy] of [[1, 1], [4, 1], [1, 4], [4, 4]]) {
        const x = Math.min(r.width - 1, gx * cell + dx)
        const y = Math.min(r.height - 1, gy * cell + dy)
        const i = (y * r.width + x) * 4
        sum += r.data[i] * 0.299 + r.data[i + 1] * 0.587 + r.data[i + 2] * 0.114
        n++
      }
      grid[gy * gw + gx] = sum / n < 100 ? 1 : 0
    }
  }
  const seen = new Uint8Array(gw * gh)
  const out: { left: number; top: number; width: number; height: number }[] = []
  const stack: number[] = []
  for (let start = 0; start < grid.length; start++) {
    if (!grid[start] || seen[start]) continue
    let minX = gw
    let minY = gh
    let maxX = 0
    let maxY = 0
    let count = 0
    stack.push(start)
    seen[start] = 1
    while (stack.length) {
      const k = stack.pop()!
      const x = k % gw
      const y = (k / gw) | 0
      count++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      for (const n of [k - 1, k + 1, k - gw, k + gw]) {
        if (n < 0 || n >= grid.length || seen[n] || !grid[n]) continue
        if ((n === k - 1 && x === 0) || (n === k + 1 && x === gw - 1)) continue
        seen[n] = 1
        stack.push(n)
      }
    }
    const w = (maxX - minX + 1) * cell
    const h = (maxY - minY + 1) * cell
    const fill = count / ((maxX - minX + 1) * (maxY - minY + 1))
    if (fill > 0.55 && w >= 60 && h >= 18 && h <= 900 && w * h < r.width * r.height * 0.5)
      out.push({ left: minX * cell, top: minY * cell, width: Math.min(w, r.width - minX * cell), height: Math.min(h, r.height - minY * cell) })
  }
  return out.slice(0, 24)
}

/**
 * Second look at a doubtful line: crop it, scale it to the height Tesseract
 * reads best, and recognise it as a single line.
 */
async function rereadLine(w: Worker, r: Raster, seg: Segment): Promise<{ text: string; confidence: number } | null> {
  const { x0, y0, x1, y1 } = seg.bbox
  const h = y1 - y0
  const pad = Math.round(h * 0.35)
  const sx = Math.max(0, x0 - pad)
  const sy = Math.max(0, y0 - pad)
  const sw = Math.min(r.width - sx, x1 - x0 + pad * 2)
  const sh = Math.min(r.height - sy, h + pad * 2)
  if (sw < 4 || sh < 4) return null
  const crop = document.createElement('canvas')
  crop.width = sw
  crop.height = sh
  const img = crop.getContext('2d')!.createImageData(sw, sh)
  for (let y = 0; y < sh; y++) {
    const from = ((sy + y) * r.width + sx) * 4
    img.data.set(r.data.subarray(from, from + sw * 4), y * sw * 4)
  }
  crop.getContext('2d')!.putImageData(img, 0, 0)
  const k = Math.max(0.3, Math.min(3, 44 / h))
  const c = document.createElement('canvas')
  c.width = Math.round(sw * k)
  c.height = Math.round(sh * k)
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(crop, 0, 0, c.width, c.height)
  await w.setParameters({ tessedit_pageseg_mode: '7' as never })
  try {
    const res = await w.recognize(c, {}, { text: true, blocks: false })
    return { text: res.data.text.replace(/\s+/g, ' ').trim(), confidence: res.data.confidence }
  } catch {
    return null
  } finally {
    await w.setParameters({ tessedit_pageseg_mode: '3' as never })
  }
}

/** A dark region cut out, inverted and binarised (Otsu) into black-on-white. */
function invertedCrop(r: Raster, region: { left: number; top: number; width: number; height: number }) {
  const pad = 8
  const sx = Math.max(0, region.left - pad)
  const sy = Math.max(0, region.top - pad)
  const sw = Math.min(r.width - sx, region.width + pad * 2)
  const sh = Math.min(r.height - sy, region.height + pad * 2)
  const lum = new Uint8Array(sw * sh)
  const hist = new Uint32Array(256)
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const i = ((sy + y) * r.width + sx + x) * 4
      const v = 255 - Math.round(r.data[i] * 0.299 + r.data[i + 1] * 0.587 + r.data[i + 2] * 0.114)
      lum[y * sw + x] = v
      hist[v]++
    }
  }
  const total = sw * sh
  let sum = 0
  for (let t = 0; t < 256; t++) sum += t * hist[t]
  let sumB = 0
  let wB = 0
  let best = -1
  let threshold = 128
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sumB += t * hist[t]
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2
    if (between > best) {
      best = between
      threshold = t
    }
  }
  const ink = new Uint8Array(lum.length)
  for (let k = 0; k < lum.length; k++) ink[k] = lum[k] > threshold ? 0 : 1
  // Erase table rules (near full-height columns / full-width rows of ink) so
  // the cells read as separate words instead of one garbled run.
  for (let x = 0; x < sw; x++) {
    let n = 0
    for (let y = 0; y < sh; y++) n += ink[y * sw + x]
    if (n > sh * 0.7) for (let y = 0; y < sh; y++) ink[y * sw + x] = 0
  }
  for (let y = 0; y < sh; y++) {
    let n = 0
    for (let x = 0; x < sw; x++) n += ink[y * sw + x]
    if (n > sw * 0.7) ink.fill(0, y * sw, (y + 1) * sw)
  }
  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(sw, sh)
  for (let k = 0; k < lum.length; k++) {
    const v = ink[k] ? 0 : 255
    img.data[k * 4] = img.data[k * 4 + 1] = img.data[k * 4 + 2] = v
    img.data[k * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return { canvas, dx: sx, dy: sy }
}

/** Move recognition results from crop coordinates back into page coordinates. */
function shiftBlocks(blocks: TessBlock[], dx: number, dy: number) {
  const move = (b: TessBox | undefined) => {
    if (!b) return
    b.x0 += dx
    b.x1 += dx
    b.y0 += dy
    b.y1 += dy
  }
  for (const block of blocks)
    for (const p of block.paragraphs)
      for (const l of p.lines) {
        move(l.bbox)
        move(l.baseline)
        l.words?.forEach((w) => move(w.bbox))
      }
}

/**
 * Re-read runs of doubtful words inside an otherwise confident line (a
 * heading Tesseract half-misread, say) and splice in the better reading.
 */
async function refineWords(
  tl: TessLine,
  reread: (seg: Segment) => Promise<{ text: string; confidence: number } | null>,
) {
  if (tl.confidence < 50 || !tl.words?.length) return
  const words = tl.words.filter((w) => w.text.trim()).sort((a, b) => a.bbox.x0 - b.bbox.x0)
  const runs: TessWord[][] = []
  for (const w of words) {
    if (w.confidence >= 70 || RULE_RE.test(w.text.trim())) continue
    const last = runs[runs.length - 1]
    if (last && words.indexOf(last[last.length - 1]) === words.indexOf(w) - 1) last.push(w)
    else runs.push([w])
  }
  if (!runs.length) return
  // Where each word sits in the line text, so a replaced run keeps its spacing.
  const span = new Map<TessWord, [number, number]>()
  let cursor = 0
  for (const w of words) {
    const at = tl.text.indexOf(w.text.trim(), cursor)
    if (at < 0) continue
    span.set(w, [at, at + w.text.trim().length])
    cursor = at + w.text.trim().length
  }
  const original = new Map<TessWord, string>()
  let changed = false
  for (const run of runs) {
    const avg = run.reduce((s, w) => s + w.confidence, 0) / run.length
    const bbox = {
      x0: Math.min(...run.map((w) => w.bbox.x0)),
      y0: Math.min(...run.map((w) => w.bbox.y0)),
      x1: Math.max(...run.map((w) => w.bbox.x1)),
      y1: Math.max(...run.map((w) => w.bbox.y1)),
    }
    const again = await reread({ text: run.map((w) => w.text).join(' '), confidence: avg, bbox })
    if (!again?.text || again.confidence < avg + 5) continue
    const at = words.indexOf(run[0])
    const replacement: TessWord = { text: again.text, confidence: again.confidence, bbox }
    const a = span.get(run[0])
    const b = span.get(run[run.length - 1])
    if (a && b) original.set(replacement, tl.text.slice(a[0], b[1]))
    words.splice(at, run.length, replacement)
    changed = true
  }
  if (!changed) return
  tl.words = words
  tl.text = wordsText(tl.text, words, original)
  tl.confidence = words.reduce((s, w) => s + w.confidence, 0) / words.length
}

/**
 * Text for a run of words, keeping Tesseract's own spacing from the line
 * text where the words can be found in it (Korean syllables often come back
 * as separate "words" that must not be space-separated).
 */
function wordsText(lineText: string, words: TessWord[], originals: Map<TessWord, string> = new Map()): string {
  let out = ''
  let cursor = 0
  let prevEnd = -1
  const heights = words.map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b)
  const h = heights[heights.length >> 1] || 1
  words.forEach((w, k) => {
    const t = w.text.trim()
    const source = originals.get(w) ?? t
    const at = lineText.indexOf(source, cursor)
    let space: boolean
    if (at >= 0 && prevEnd >= 0) space = /\s/.test(lineText.slice(prevEnd, at))
    else space = k > 0 && w.bbox.x0 - words[k - 1].bbox.x1 > h * 0.25
    if (at >= 0) {
      cursor = at + source.length
      prevEnd = cursor
    } else prevEnd = -1
    out += (k && space ? ' ' : '') + t
  })
  return out
}

async function toTextLine(
  seg: Segment,
  b: TessBox,
  raster: Raster,
  scale: number,
  toUser: ReturnType<typeof invert>,
  page: number,
  nextId: () => string,
): Promise<TextLine | null> {
  const text = seg.text.replace(/\s+/g, ' ').trim()
  if (!text) return null
  const meaningful = (text.match(/[\p{L}\p{N}]/gu) ?? []).length
  if (seg.confidence < 45 || (seg.confidence < 65 && meaningful <= 1) || meaningful === 0) return null
  const { x0, y0, x1, y1 } = seg.bbox
  const wPx = x1 - x0
  const hPx = y1 - y0
  if (wPx < 3 || hPx < 4) return null

  const slopeRaw = (b.y1 - b.y0) / Math.max(1, b.x1 - b.x0)
  const slope = Math.abs(slopeRaw) < 0.2 ? slopeRaw : 0
  let baseAt = (x: number) => b.y0 + (x - b.x0) * slope
  // Baseline must sit inside the line's box; otherwise estimate it.
  if (!(baseAt(x0) > y0 + hPx * 0.4 && baseAt(x0) <= y1 + 1)) {
    const est = y0 + hPx * 0.8
    baseAt = () => est
  }

  const box = { left: x0, top: y0, width: wPx, height: hPx }
  const stats = analyzeRegion(raster, box, Math.max(3, hPx * 0.3), 0.7)
  const ink = stats.ink ?? [0, 0, 0]

  const korean = hasHangulOrCJK(text)
  const metrics = await inkMetrics(text, korean)
  const ascentPx = baseAt(x0) - y0
  const ascRatio = metrics.ascent > 0.3 ? metrics.ascent : 0.72
  let sizePx = ascentPx / ascRatio
  if (!(sizePx > 3) || sizePx > hPx * 2.5) sizePx = hPx / 1.0
  // Speckle and stray fragments read as tiny text
  if (sizePx / scale < 5 && (seg.confidence < 80 || meaningful <= 2)) return null
  let hScale = metrics.inkWidth > 0 ? wPx / (metrics.inkWidth * sizePx) : 1
  hScale = hScale > 0.75 && hScale < 1.3 ? Math.round(hScale * 100) / 100 : 1

  const originPx = x0 + metrics.left * sizePx * hScale
  const [ux, uy] = apply(toUser, originPx, baseAt(originPx))
  const [ex, ey] = apply(toUser, originPx + 100, baseAt(originPx + 100))
  let angle = (Math.atan2(ey - uy, ex - ux) * 180) / Math.PI
  angle = Math.abs(angle) < 0.3 ? 0 : Math.round(angle * 10) / 10

  // Weight: stroke thickness relative to the ink height above the baseline
  // (independent of which fallback font the size was normalised against).
  const stroke = strokeWidth(raster, box, stats.bg, ink)
  const descentPx = Math.max(y1 - baseAt(x0), sizePx * 0.12)
  const weight = ascentPx > 0 ? stroke / ascentPx : 0

  const line: TextLine = {
    id: nextId(),
    page,
    text,
    x: ux,
    y: uy,
    angle,
    width: (metrics.advance * sizePx * hScale) / scale,
    fontSize: Math.round((sizePx / scale) * 10) / 10,
    ascent: ascentPx / sizePx,
    descent: -descentPx / sizePx,
    font: null,
    family: 'sans',
    // Settled page-wide in decideWeights.
    bold: false,
    italic: false,
    color: rgbToHex(ink),
    bg: rgbToHex(stats.bg),
    origin: 'ocr',
    removable: false,
    needsCover: true,
    confidence: Math.round(seg.confidence),
    hScale,
    paragraphId: '',
    samples: [],
    fonts: [],
    room: 0,
  }
  lineWeights.set(line, weight)
  return line
}
