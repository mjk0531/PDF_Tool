/**
 * Coordinate helpers for the editor.
 *
 * Everything the editor stores lives in PDF user space (points, origin
 * bottom-left, before /Rotate). The screen, rasters and Tesseract all work in
 * "device" space (pixels, origin top-left, after /Rotate). A viewport matrix
 * maps one to the other, exactly the way pdf.js builds its PageViewport, so
 * pages with a /Rotate or a CropBox that doesn't start at 0,0 line up.
 */

/** [a, b, c, d, e, f] maps (x, y) → (a·x + c·y + e, b·x + d·y + f). */
export type Matrix = [number, number, number, number, number, number]

/** Axis-aligned rectangle in user space; (x, y) is the bottom-left corner. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Axis-aligned box in device space; (left, top) is the top-left corner. */
export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export interface PageGeom {
  /** pdf.js `page.view`: the visible box [x1, y1, x2, y2] in user space. */
  view: [number, number, number, number]
  /** Page /Rotate, normalised to 0 / 90 / 180 / 270. */
  rotate: number
}

export interface Viewport {
  transform: Matrix
  width: number
  height: number
}

/** Same construction as pdf.js `PageViewport` (no offset, no flip override). */
export function makeViewport(geom: PageGeom, scale: number): Viewport {
  const [x1, y1, x2, y2] = geom.view
  const centerX = (x2 + x1) / 2
  const centerY = (y2 + y1) / 2
  let rotation = geom.rotate % 360
  if (rotation < 0) rotation += 360
  let a: number, b: number, c: number, d: number
  switch (rotation) {
    case 180:
      ;[a, b, c, d] = [-1, 0, 0, 1]
      break
    case 90:
      ;[a, b, c, d] = [0, 1, 1, 0]
      break
    case 270:
      ;[a, b, c, d] = [0, -1, -1, 0]
      break
    default:
      ;[a, b, c, d] = [1, 0, 0, -1]
  }
  let offsetX: number, offsetY: number, width: number, height: number
  if (a === 0) {
    offsetX = Math.abs(centerY - y1) * scale
    offsetY = Math.abs(centerX - x1) * scale
    width = (y2 - y1) * scale
    height = (x2 - x1) * scale
  } else {
    offsetX = Math.abs(centerX - x1) * scale
    offsetY = Math.abs(centerY - y1) * scale
    width = (x2 - x1) * scale
    height = (y2 - y1) * scale
  }
  return {
    transform: [
      a * scale,
      b * scale,
      c * scale,
      d * scale,
      offsetX - a * scale * centerX - c * scale * centerY,
      offsetY - b * scale * centerX - d * scale * centerY,
    ],
    width,
    height,
  }
}

export function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}

export function invert(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2]
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ]
}

/** Bounding box of a user-space rect in device space. */
export function rectToBox(m: Matrix, r: Rect): Box {
  const pts = [
    apply(m, r.x, r.y),
    apply(m, r.x + r.width, r.y),
    apply(m, r.x, r.y + r.height),
    apply(m, r.x + r.width, r.y + r.height),
  ]
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top }
}

/** Bounding rect in user space of a device-space box. */
export function boxToRect(m: Matrix, b: Box): Rect {
  const inv = invert(m)
  const pts = [
    apply(inv, b.left, b.top),
    apply(inv, b.left + b.width, b.top),
    apply(inv, b.left, b.top + b.height),
    apply(inv, b.left + b.width, b.top + b.height),
  ]
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

/**
 * Where a run of text starting at user-space (x, y) with baseline angle
 * `angleDeg` lands on screen: the device origin plus the CSS rotation (in
 * degrees, clockwise, as `transform: rotate()` expects).
 */
export function textFrame(m: Matrix, x: number, y: number, angleDeg: number) {
  const [left, top] = apply(m, x, y)
  const rad = (angleDeg * Math.PI) / 180
  const dx = m[0] * Math.cos(rad) + m[2] * Math.sin(rad)
  const dy = m[1] * Math.cos(rad) + m[3] * Math.sin(rad)
  return { left, top, rotation: (Math.atan2(dy, dx) * 180) / Math.PI }
}

/**
 * Corners of a box drawn along a text baseline: starts at (x, y), runs
 * `length` along the baseline and spans `bottom`..`top` across it (both
 * measured from the baseline, upwards positive).
 */
export function bandRect(
  x: number,
  y: number,
  angleDeg: number,
  length: number,
  bottom: number,
  top: number,
): Rect {
  const rad = (angleDeg * Math.PI) / 180
  const ux = Math.cos(rad)
  const uy = Math.sin(rad)
  const nx = -uy
  const ny = ux
  const pts: [number, number][] = [
    [x + nx * bottom, y + ny * bottom],
    [x + ux * length + nx * bottom, y + uy * length + ny * bottom],
    [x + nx * top, y + ny * top],
    [x + ux * length + nx * top, y + uy * length + ny * top],
  ]
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const rx = Math.min(...xs)
  const ry = Math.min(...ys)
  return { x: rx, y: ry, width: Math.max(...xs) - rx, height: Math.max(...ys) - ry }
}

export function unionRect(rects: Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x))
  const y = Math.min(...rects.map((r) => r.y))
  const x2 = Math.max(...rects.map((r) => r.x + r.width))
  const y2 = Math.max(...rects.map((r) => r.y + r.height))
  return { x, y, width: x2 - x, height: y2 - y }
}

export function expandRect(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, width: r.width + by * 2, height: r.height + by * 2 }
}

/** Area of the overlap between two rects (0 when disjoint). */
export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/** Stable string key for a rect, rounded to 1/10 pt. */
export function rectKey(page: number, r: Rect): string {
  const f = (n: number) => Math.round(n * 10)
  return `${page}:${f(r.x)}:${f(r.y)}:${f(r.width)}:${f(r.height)}`
}
