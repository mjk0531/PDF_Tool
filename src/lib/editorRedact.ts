/**
 * Removing original text from the content stream.
 *
 * Covering edited text with a white box only works on white paper. Instead,
 * MuPDF's redaction filter deletes exactly the glyphs whose boxes intersect
 * the given bands — text only: images, vector art and the background stay as
 * they were, so new text lands on the untouched original page. Afterwards the
 * page is re-read; any glyph still inside a band (Type 3 fonts, odd content)
 * is reported back so the caller can paint over it instead.
 */

import type { Rect } from './editorGeometry'

let mupdfPromise: Promise<typeof import('mupdf')> | null = null
export const getMupdf = () => (mupdfPromise ??= import('mupdf'))

export interface RemovalResult {
  bytes: Uint8Array
  /** Bands (user space) where glyphs survived, per 0-based page index. */
  leftovers: Map<number, Rect[]>
}

type M6 = [number, number, number, number, number, number]

function transformRect(r: Rect, m: M6): [number, number, number, number] {
  const pts = [
    [r.x, r.y],
    [r.x + r.width, r.y],
    [r.x, r.y + r.height],
    [r.x + r.width, r.y + r.height],
  ].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]])
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

/** A glyph as drawn on the page, in user space. */
export interface GlyphPos {
  c: string
  /** Baseline origin. */
  x: number
  y: number
  /** Advance width along the baseline. */
  w: number
  size: number
  /** Exact fill colour, 0–1 RGB. */
  color: [number, number, number]
}

function toRgb(color: unknown): [number, number, number] {
  const c = Array.isArray(color) ? (color as number[]) : []
  if (c.length === 1) return [c[0], c[0], c[0]]
  if (c.length === 3) return [c[0], c[1], c[2]]
  if (c.length === 4) {
    const k = c[3]
    return [(1 - c[0]) * (1 - k), (1 - c[1]) * (1 - k), (1 - c[2]) * (1 - k)]
  }
  return [0, 0, 0]
}

function invertM(m: M6): M6 {
  const det = m[0] * m[3] - m[1] * m[2]
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det]
}

/**
 * Exact glyph positions (including real space glyphs) of the characters whose
 * baseline origin falls inside each request's box — what lets an edit keep
 * the untouched part of a line exactly as it was.
 */
export async function extractGlyphs(
  bytes: Uint8Array,
  requests: { key: string; pageIndex: number; box: Rect }[],
): Promise<Map<string, GlyphPos[]>> {
  const out = new Map<string, GlyphPos[]>()
  if (!requests.length) return out
  const mupdf = await getMupdf()
  const doc = mupdf.PDFDocument.openDocument(bytes, 'application/pdf') as InstanceType<typeof mupdf.PDFDocument>
  try {
    const pages = [...new Set(requests.map((r) => r.pageIndex))]
    for (const index of pages) {
      const page = doc.loadPage(index)
      try {
        const toUser = invertM(page.getTransform() as M6)
        const glyphs: GlyphPos[] = []
        const stext = page.toStructuredText('preserve-whitespace,inhibit-spaces')
        try {
          stext.walk({
            onChar(c: string, origin: number[], _font: unknown, size: number, quad: number[], color: unknown) {
              const ox = toUser[0] * origin[0] + toUser[2] * origin[1] + toUser[4]
              const oy = toUser[1] * origin[0] + toUser[3] * origin[1] + toUser[5]
              glyphs.push({
                c,
                x: ox,
                y: oy,
                w: Math.hypot(quad[2] - quad[0], quad[3] - quad[1]),
                size,
                color: toRgb(color),
              })
            },
          })
        } finally {
          stext.destroy()
        }
        for (const r of requests.filter((q) => q.pageIndex === index)) {
          const b = r.box
          out.set(
            r.key,
            glyphs
              .filter((g) => g.x >= b.x - 0.5 && g.x <= b.x + b.width + 0.5 && g.y >= b.y && g.y <= b.y + b.height)
              .sort((a, b2) => a.x - b2.x),
          )
        }
      } finally {
        page.destroy()
      }
    }
  } finally {
    doc.destroy()
  }
  return out
}

export async function removeTextInRects(bytes: Uint8Array, bands: Map<number, Rect[]>): Promise<RemovalResult> {
  const mupdf = await getMupdf()
  const doc = mupdf.PDFDocument.openDocument(bytes, 'application/pdf') as InstanceType<typeof mupdf.PDFDocument>
  const leftovers = new Map<number, Rect[]>()
  try {
    for (const [index, rects] of bands) {
      if (!rects.length) continue
      const page = doc.loadPage(index)
      try {
        const m = page.getTransform() as M6
        const deviceRects = rects.map((r) => transformRect(r, m))
        for (const r of deviceRects) {
          const annot = page.createAnnotation('Redact')
          annot.setRect(r)
        }
        page.applyRedactions(
          false,
          mupdf.PDFPage.REDACT_IMAGE_NONE,
          mupdf.PDFPage.REDACT_LINE_ART_NONE,
          mupdf.PDFPage.REDACT_TEXT_REMOVE,
        )

        // Verify: any character whose centre still sits inside a band?
        const survived = new Set<number>()
        const stext = page.toStructuredText()
        try {
          stext.walk({
            onChar(_c: string, _origin: unknown, _font: unknown, _size: number, quad: number[]) {
              const cx = (quad[0] + quad[2] + quad[4] + quad[6]) / 4
              const cy = (quad[1] + quad[3] + quad[5] + quad[7]) / 4
              deviceRects.forEach((r, k) => {
                if (cx >= r[0] && cx <= r[2] && cy >= r[1] && cy <= r[3]) survived.add(k)
              })
            },
          })
        } finally {
          stext.destroy()
        }
        if (survived.size) leftovers.set(index, [...survived].map((k) => rects[k]))
      } finally {
        page.destroy()
      }
    }
    // No garbage collection: object numbers must stay put so font refs
    // resolved before this step still point at the same dictionaries.
    const out = doc.saveToBuffer('').asUint8Array().slice()
    return { bytes: out, leftovers }
  } finally {
    doc.destroy()
  }
}
