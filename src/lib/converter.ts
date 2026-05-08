import { pdfjsLib } from './pdfWorker'

export type ImageFormat = 'png' | 'jpeg' | 'webp'

export interface ConvertOptions {
  dpi: number
  format: ImageFormat
  quality: number // 0..1, only for jpeg/webp
  backgroundColor: string | null // null = transparent (PNG only)
  rotation: 0 | 90 | 180 | 270
  pages: number[] // 1-indexed
  filenamePattern: string // e.g. "{name}_page_{n}"
}

export interface ConvertedPage {
  pageNumber: number
  blob: Blob
  width: number
  height: number
  filename: string
}

const PDF_DEFAULT_DPI = 72

export async function loadPdfDocument(file: File) {
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
  return await loadingTask.promise
}

export async function renderPageToBlob(
  pdf: Awaited<ReturnType<typeof loadPdfDocument>>,
  pageNumber: number,
  options: Pick<
    ConvertOptions,
    'dpi' | 'format' | 'quality' | 'backgroundColor' | 'rotation'
  >,
): Promise<{ blob: Blob; width: number; height: number }> {
  const page = await pdf.getPage(pageNumber)
  const scale = options.dpi / PDF_DEFAULT_DPI
  const viewport = page.getViewport({ scale, rotation: options.rotation })

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d', { alpha: options.backgroundColor === null })

  if (!ctx) throw new Error('Failed to acquire 2D canvas context')

  if (options.backgroundColor) {
    ctx.fillStyle = options.backgroundColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  await page.render({ canvasContext: ctx, viewport }).promise

  const mimeType =
    options.format === 'png'
      ? 'image/png'
      : options.format === 'jpeg'
        ? 'image/jpeg'
        : 'image/webp'

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      mimeType,
      options.format === 'png' ? undefined : options.quality,
    )
  })

  page.cleanup()
  return { blob, width: canvas.width, height: canvas.height }
}

export function buildFilename(
  pattern: string,
  baseName: string,
  pageNumber: number,
  totalPages: number,
  format: ImageFormat,
): string {
  const padLength = String(totalPages).length
  const padded = String(pageNumber).padStart(padLength, '0')
  const name = pattern
    .replace(/\{name\}/g, baseName)
    .replace(/\{n\}/g, padded)
    .replace(/\{N\}/g, String(pageNumber))
    .replace(/\{total\}/g, String(totalPages))
  return `${name}.${format}`
}

export function stripExtension(filename: string): string {
  return filename.replace(/\.[^/.]+$/, '')
}
