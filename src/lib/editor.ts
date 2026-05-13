/**
 * PDF editor — annotation model and export pipeline.
 *
 * Annotations are described in PDF user space (origin bottom-left, points).
 * The editor UI converts mouse coordinates (display space, top-left origin)
 * to PDF space using the page's display scale.
 *
 * "Edit existing text" uses the standard online-tool trick: whiteout the
 * original glyphs by drawing a white rectangle on top of them, then draw the
 * new text on top of that. The original text data still exists in the PDF
 * but is visually covered.
 *
 * Text rendering uses Pretendard (Korean + Latin + partial CJK) as the
 * universal font, with Helvetica as a fallback for the rare codepoints
 * Pretendard doesn't cover. Multi-line text is word-wrapped to the
 * annotation's width.
 */

import { PDFDocument, rgb } from 'pdf-lib'
import type { PDFImage } from 'pdf-lib'
import { embedEditorFonts, segmentTextByFont, wrapTextToWidth, type EditorFontSet } from './editorFonts'

/* ---------- Annotation types ---------- */

export type AnnotationKind = 'text' | 'image' | 'whiteout'

export interface BaseAnnotation {
  id: string
  page: number // 1-indexed
}

export interface TextAnnotation extends BaseAnnotation {
  kind: 'text'
  x: number // PDF points, left edge of the first line
  y: number // PDF points, baseline of the first line
  width: number // points; lines wrap to this width
  text: string
  fontSize: number
  color: string // hex "#rrggbb"
}

export interface ImageAnnotation extends BaseAnnotation {
  kind: 'image'
  x: number
  y: number
  width: number
  height: number
  dataUrl: string
}

export interface WhiteoutAnnotation extends BaseAnnotation {
  kind: 'whiteout'
  x: number
  y: number
  width: number
  height: number
}

export type Annotation = TextAnnotation | ImageAnnotation | WhiteoutAnnotation

/* ---------- Helpers ---------- */

export function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '')
  const n = parseInt(
    clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean,
    16,
  )
  return rgb(((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255)
}

/* ---------- Export pipeline ---------- */

export interface ExportResult {
  bytes: Uint8Array
  warnings: string[]
}

export async function exportEditedPdf(
  source: File,
  annotations: Annotation[],
): Promise<ExportResult> {
  const warnings: string[] = []
  const buf = await source.arrayBuffer()
  const pdf = await PDFDocument.load(buf, { ignoreEncryption: true })

  // Load fonts only if there's at least one text annotation
  const needsFonts = annotations.some((a) => a.kind === 'text')
  const fonts = needsFonts ? await embedEditorFonts(pdf) : null

  const pages = pdf.getPages()
  const byPage = new Map<number, Annotation[]>()
  for (const ann of annotations) {
    const arr = byPage.get(ann.page) ?? []
    arr.push(ann)
    byPage.set(ann.page, arr)
  }

  // One PDFImage embed per unique data URL (same image across pages reused)
  const imageCache = new Map<string, PDFImage>()

  for (const [pageNumber, anns] of byPage) {
    const page = pages[pageNumber - 1]
    if (!page) continue
    // z-order: whiteouts first (under), then images, then text (top)
    const ordered: Annotation[] = [
      ...anns.filter((a) => a.kind === 'whiteout'),
      ...anns.filter((a) => a.kind === 'image'),
      ...anns.filter((a) => a.kind === 'text'),
    ]
    for (const ann of ordered) {
      try {
        await applyAnnotation(pdf, page, ann, fonts, imageCache, warnings)
      } catch (e) {
        warnings.push(`Failed to render annotation: ${(e as Error).message}`)
      }
    }
  }

  return { bytes: await pdf.save(), warnings }
}

async function applyAnnotation(
  pdf: PDFDocument,
  page: ReturnType<PDFDocument['getPages']>[number],
  ann: Annotation,
  fonts: EditorFontSet | null,
  imageCache: Map<string, PDFImage>,
  warnings: string[],
): Promise<void> {
  if (ann.kind === 'whiteout') {
    page.drawRectangle({
      x: ann.x,
      y: ann.y,
      width: ann.width,
      height: ann.height,
      color: rgb(1, 1, 1),
      borderWidth: 0,
    })
    return
  }

  if (ann.kind === 'image') {
    let img = imageCache.get(ann.dataUrl)
    if (!img) {
      const bytes = dataUrlToBytes(ann.dataUrl)
      img = ann.dataUrl.startsWith('data:image/png')
        ? await pdf.embedPng(bytes)
        : await pdf.embedJpg(bytes)
      imageCache.set(ann.dataUrl, img)
    }
    page.drawImage(img, {
      x: ann.x,
      y: ann.y,
      width: ann.width,
      height: ann.height,
    })
    return
  }

  if (!fonts) return
  drawText(page, ann, fonts, warnings)
}

/**
 * Draw a text annotation: word-wrap to its width, then for each line, draw
 * each font-coherent run side-by-side along the baseline.
 */
function drawText(
  page: ReturnType<PDFDocument['getPages']>[number],
  ann: TextAnnotation,
  fonts: EditorFontSet,
  warnings: string[],
): void {
  const color = hexToRgb(ann.color)
  const lineHeight = ann.fontSize * 1.2
  const lines = wrapTextToWidth(ann.text, fonts, ann.fontSize, Math.max(20, ann.width))

  // Each subsequent line shifts down by lineHeight
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const runs = lines[lineIdx]
    let cursorX = ann.x
    const baselineY = ann.y - lineIdx * lineHeight
    for (const run of runs) {
      try {
        page.drawText(run.text, {
          x: cursorX,
          y: baselineY,
          size: ann.fontSize,
          font: run.font,
          color,
        })
        cursorX += run.font.widthOfTextAtSize(run.text, ann.fontSize)
      } catch (e) {
        // pdf-lib threw — codepoint not encodable by this run's font.
        // Skip the offending run but continue with the rest of the line.
        warnings.push(
          `Skipped a segment in "${run.text.slice(0, 12)}…": ${(e as Error).message}`,
        )
      }
    }
    void segmentTextByFont
  }
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const commaAt = dataUrl.indexOf(',')
  if (commaAt < 0) throw new Error('Invalid data URL')
  const b64 = dataUrl.slice(commaAt + 1)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
