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
