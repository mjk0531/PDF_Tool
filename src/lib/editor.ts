/**
 * PDF editor — overlay model and export pipeline.
 *
 * Annotations are described in PDF user space (origin bottom-left, points).
 * The editor UI converts mouse coordinates (display space, top-left origin)
 * to PDF space using the page's display scale.
 *
 * "Edit existing text" is the standard online-tool trick: whiteout the
 * original glyphs by drawing a white rectangle on top of them, then draw the
 * new text on top of that. The original text data still exists in the PDF
 * but is visually covered. Same approach SmallPDF / iLovePDF use.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { PDFFont, PDFImage } from 'pdf-lib'

/* ---------- Annotation types ---------- */

export type AnnotationKind = 'text' | 'image' | 'whiteout'

export interface BaseAnnotation {
  id: string
  page: number // 1-indexed
}

export interface TextAnnotation extends BaseAnnotation {
  kind: 'text'
  x: number // PDF points, from left
  y: number // PDF points, from bottom (baseline of the text)
  text: string
  fontSize: number // points
  color: string // hex like "#000000"
}

export interface ImageAnnotation extends BaseAnnotation {
  kind: 'image'
  x: number
  y: number
  width: number
  height: number
  dataUrl: string // 'data:image/png;base64,...' or 'data:image/jpeg;base64,...'
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

/** Hex color "#rrggbb" → pdf-lib rgb(0..1, 0..1, 0..1). */
function hexToRgb(hex: string) {
  const clean = hex.replace('#', '')
  const n = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16)
  return rgb(((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255)
}

/**
 * Check whether Helvetica (WinAnsi encoded) can render a string.
 * pdf-lib will throw on unsupported codepoints, so we pre-flight every text
 * annotation and report unrenderable items back to the UI.
 */
export function isHelveticaSafe(text: string): boolean {
  // WinAnsi covers Latin-1 + a handful of extras. Everything outside the
  // basic Latin + Latin-1 supplement range is risky.
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c > 0x017f) return false // beyond Latin Extended-A
  }
  return true
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
  const helvetica = await pdf.embedFont(StandardFonts.Helvetica)
  const pages = pdf.getPages()

  // Group annotations by page so we apply each page's edits in one pass.
  const byPage = new Map<number, Annotation[]>()
  for (const ann of annotations) {
    const arr = byPage.get(ann.page) ?? []
    arr.push(ann)
    byPage.set(ann.page, arr)
  }

  // Image data URL → embedded image cache (one embed per unique source).
  const imageCache = new Map<string, PDFImage>()

  for (const [pageNumber, anns] of byPage) {
    const page = pages[pageNumber - 1]
    if (!page) continue
    // Whiteouts first (so they sit under any overlay text/images),
    // then images, then text on top.
    const ordered: Annotation[] = [
      ...anns.filter((a) => a.kind === 'whiteout'),
      ...anns.filter((a) => a.kind === 'image'),
      ...anns.filter((a) => a.kind === 'text'),
    ]
    for (const ann of ordered) {
      try {
        await applyAnnotation(pdf, page, ann, helvetica, imageCache, warnings)
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
  helvetica: PDFFont,
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

  // Text
  if (!isHelveticaSafe(ann.text)) {
    warnings.push(
      `Skipped text "${ann.text.slice(0, 24)}…": Helvetica can't encode it. ` +
        `Phase 2 will add a font with broader script coverage.`,
    )
    return
  }
  page.drawText(ann.text, {
    x: ann.x,
    y: ann.y,
    size: ann.fontSize,
    font: helvetica,
    color: hexToRgb(ann.color),
  })
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
