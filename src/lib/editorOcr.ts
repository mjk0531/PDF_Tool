/**
 * OCR-driven editing for image-only PDF pages.
 *
 * pdf.js's getTextContent() returns nothing for pages whose content is purely
 * raster (scanned documents, the compressed payroll PDF, etc.) — meaning
 * those pages have no editable hover targets in the editor. This module runs
 * Tesseract.js against the rendered page bitmap, captures each recognized
 * word with its bbox in pixel space, and converts those bboxes back into
 * PDF user-space coordinates so they slot into the same ExistingTextItem
 * surface the regular editor uses.
 */

import { createWorker } from 'tesseract.js'
import type { ExistingTextItem } from '../tools/edit/PageView'
import { loadPdfJs } from './pdfOps'

const OCR_RENDER_DPI = 200 // higher DPI = better accuracy, slower

interface TesseractWord {
  text: string
  confidence: number
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

/**
 * Run OCR on a single page and return text items in PDF user space ready to
 * be slotted into the editor's existing-text map. Pages are 1-indexed.
 */
export async function ocrPageToEditableItems(
  file: File,
  pageNumber: number,
  language: string = 'eng+kor',
  onProgress?: (status: string, fraction: number) => void,
): Promise<{ items: ExistingTextItem[]; pageWidth: number; pageHeight: number }> {
  onProgress?.('Loading OCR engine...', 0.05)

  const pdf = await loadPdfJs(file)
  const page = await pdf.getPage(pageNumber)
  const basePts = page.getViewport({ scale: 1 })
  const scale = OCR_RENDER_DPI / 72
  const viewport = page.getViewport({ scale })

  // Render the page to a canvas at high DPI for OCR
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  page.cleanup()

  onProgress?.('Recognizing text...', 0.2)

  // Lightweight preprocessing — Otsu binarization usually helps for document scans
  applyOtsuBinarize(ctx, canvas.width, canvas.height)

  const worker = await createWorker(language)
  let result
  try {
    result = await worker.recognize(canvas)
  } finally {
    await worker.terminate()
  }

  const data = result.data as {
    words?: TesseractWord[]
  }
  const words = data.words ?? []

  // Map pixel bboxes → PDF user space (origin bottom-left)
  const items: ExistingTextItem[] = []
  let idx = 0
  for (const w of words) {
    const text = (w.text ?? '').trim()
    if (!text) continue
    const widthPx = w.bbox.x1 - w.bbox.x0
    const heightPx = w.bbox.y1 - w.bbox.y0
    if (widthPx < 2 || heightPx < 2) continue

    const xPdf = w.bbox.x0 / scale
    const wPdf = widthPx / scale
    const hPdf = heightPx / scale
    // Tesseract gives y from top of the bitmap; the baseline is roughly at
    // the bottom of the bbox in PDF user space (flipped).
    const baselineYPdf = basePts.height - w.bbox.y1 / scale + hPdf * 0.2
    // Font size in points ≈ bbox height in points. Slight reduction to feel
    // visually balanced once the new text is overlaid.
    const fontSize = hPdf * 0.85

    items.push({
      id: `ocr-${pageNumber}-${idx}`,
      text,
      x: xPdf,
      y: baselineYPdf,
      width: wPdf,
      height: hPdf,
      fontSize,
    })
    idx += 1
  }

  onProgress?.('Done', 1)

  return { items, pageWidth: basePts.width, pageHeight: basePts.height }
}

/* ---------- Otsu binarization (same algorithm as the standalone OCR tool) ---------- */

function applyOtsuBinarize(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const img = ctx.getImageData(0, 0, width, height)
  const d = img.data

  // First convert to grayscale in-place
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    d[i] = d[i + 1] = d[i + 2] = g
  }

  // Otsu threshold
  const total = width * height
  const hist = new Uint32Array(256)
  for (let i = 0; i < d.length; i += 4) hist[d[i] | 0]++

  let sum = 0
  for (let t = 0; t < 256; t++) sum += t * hist[t]

  let sumB = 0
  let wB = 0
  let maxVar = -1
  let threshold = 127
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const diff = mB - mF
    const between = wB * wF * diff * diff
    if (between > maxVar) {
      maxVar = between
      threshold = t
    }
  }

  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] >= threshold ? 255 : 0
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
}
