import {
  PDFDocument,
  PDFArray,
  PDFName,
  PDFRawStream,
  degrees,
  type PDFEmbeddedPage,
  type PDFRef,
} from 'pdf-lib'
import { pdfjsLib } from './pdfWorker'

/* ---------- Loading helpers ---------- */

export async function loadPdfLib(file: File, password?: string): Promise<PDFDocument> {
  const buf = await file.arrayBuffer()
  return await PDFDocument.load(buf, { ignoreEncryption: !!password })
}

export async function loadPdfJs(file: File, password?: string) {
  const buf = await file.arrayBuffer()
  const task = pdfjsLib.getDocument({ data: buf, password })
  return await task.promise
}

/* ---------- Merge ---------- */

export async function mergePdfs(files: File[]): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  for (const file of files) {
    const src = await loadPdfLib(file)
    const indices = src.getPageIndices()
    const copied = await out.copyPages(src, indices)
    copied.forEach((p) => out.addPage(p))
  }
  return await out.save()
}

/* ---------- Split ---------- */

export interface SplitGroup {
  name: string
  pages: number[] // 1-indexed
}

export async function splitPdf(file: File, groups: SplitGroup[]): Promise<{ name: string; bytes: Uint8Array }[]> {
  const src = await loadPdfLib(file)
  const results: { name: string; bytes: Uint8Array }[] = []
  for (const g of groups) {
    const out = await PDFDocument.create()
    const indices = g.pages.map((p) => p - 1)
    const copied = await out.copyPages(src, indices)
    copied.forEach((p) => out.addPage(p))
    const bytes = await out.save()
    results.push({ name: g.name, bytes })
  }
  return results
}

export function buildSplitGroupsByEvery(total: number, every: number, baseName: string): SplitGroup[] {
  const groups: SplitGroup[] = []
  let start = 1
  let idx = 1
  while (start <= total) {
    const end = Math.min(start + every - 1, total)
    const pages: number[] = []
    for (let p = start; p <= end; p++) pages.push(p)
    groups.push({ name: `${baseName}_part_${idx}.pdf`, pages })
    start = end + 1
    idx += 1
  }
  return groups
}

/* ---------- Rotate ---------- */

export async function rotatePages(
  file: File,
  rotation: 90 | 180 | 270,
  pages: 'all' | number[],
): Promise<Uint8Array> {
  const pdf = await loadPdfLib(file)
  const targetIndices = pages === 'all' ? pdf.getPageIndices() : pages.map((p) => p - 1)
  for (const i of targetIndices) {
    const page = pdf.getPage(i)
    const current = page.getRotation().angle
    page.setRotation(degrees((current + rotation) % 360))
  }
  return await pdf.save()
}

/* ---------- Reorder / Delete ---------- */

export async function reorderPages(file: File, newOrder: number[]): Promise<Uint8Array> {
  const src = await loadPdfLib(file)
  const out = await PDFDocument.create()
  const indices = newOrder.map((p) => p - 1)
  const copied = await out.copyPages(src, indices)
  copied.forEach((p) => out.addPage(p))
  return await out.save()
}

/* ---------- Image to PDF ---------- */

export type ImageFitMode = 'fit' | 'fill' | 'original'

export interface ImageToPdfOptions {
  pageSize: 'a4' | 'letter' | 'auto'
  orientation: 'portrait' | 'landscape' | 'auto'
  margin: number // points
  fit: ImageFitMode
}

const PAGE_SIZES: Record<string, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
}

export async function imagesToPdf(
  files: File[],
  options: ImageToPdfOptions,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  for (const file of files) {
    const buf = await file.arrayBuffer()
    let img: Awaited<ReturnType<typeof pdf.embedJpg>>
    const lower = file.name.toLowerCase()
    if (file.type === 'image/png' || lower.endsWith('.png')) {
      img = await pdf.embedPng(buf)
    } else {
      img = await pdf.embedJpg(buf)
    }

    let pageW: number, pageH: number
    if (options.pageSize === 'auto') {
      pageW = img.width
      pageH = img.height
    } else {
      ;[pageW, pageH] = PAGE_SIZES[options.pageSize]
      if (options.orientation === 'landscape') [pageW, pageH] = [pageH, pageW]
      if (options.orientation === 'auto' && img.width > img.height) {
        ;[pageW, pageH] = [pageH, pageW]
      }
    }

    const page = pdf.addPage([pageW, pageH])
    const m = options.margin
    const availW = pageW - 2 * m
    const availH = pageH - 2 * m

    let drawW: number, drawH: number, x: number, y: number

    if (options.fit === 'original') {
      drawW = img.width
      drawH = img.height
    } else if (options.fit === 'fill') {
      const scale = Math.max(availW / img.width, availH / img.height)
      drawW = img.width * scale
      drawH = img.height * scale
    } else {
      const scale = Math.min(availW / img.width, availH / img.height)
      drawW = img.width * scale
      drawH = img.height * scale
    }

    x = (pageW - drawW) / 2
    y = (pageH - drawH) / 2

    page.drawImage(img, { x, y, width: drawW, height: drawH })
  }
  return await pdf.save()
}

/* ---------- Password ---------- */

export async function removePassword(file: File, password: string): Promise<Uint8Array> {
  const buf = await file.arrayBuffer()
  // pdf-lib doesn't decrypt; use pdfjs to load encrypted, then re-render via pdf-lib?
  // Workaround: pdf-lib can ignore encryption metadata when re-saving without it
  const loaded = await PDFDocument.load(buf, { ignoreEncryption: true })
  if (!password) {
    // Not actually decrypting, just stripping the encryption flag if possible
  }
  return await loaded.save()
}

/**
 * Note: pdf-lib does not support adding password protection (qpdf/PDFKit feature).
 * We expose this so the UI can show a clear message.
 */
export const PASSWORD_ADD_SUPPORTED = false

/* ---------- Metadata ---------- */

export interface PdfMetadata {
  title: string
  author: string
  subject: string
  keywords: string
  creator: string
  producer: string
  creationDate: string | null
  modificationDate: string | null
}

export async function readMetadata(file: File): Promise<PdfMetadata> {
  const pdf = await loadPdfLib(file)
  return {
    title: pdf.getTitle() ?? '',
    author: pdf.getAuthor() ?? '',
    subject: pdf.getSubject() ?? '',
    keywords: (pdf.getKeywords() ?? '') as string,
    creator: pdf.getCreator() ?? '',
    producer: pdf.getProducer() ?? '',
    creationDate: pdf.getCreationDate()?.toISOString() ?? null,
    modificationDate: pdf.getModificationDate()?.toISOString() ?? null,
  }
}

export async function writeMetadata(file: File, m: PdfMetadata): Promise<Uint8Array> {
  const pdf = await loadPdfLib(file)
  pdf.setTitle(m.title)
  pdf.setAuthor(m.author)
  pdf.setSubject(m.subject)
  pdf.setKeywords(m.keywords ? m.keywords.split(',').map((s) => s.trim()) : [])
  pdf.setCreator(m.creator)
  pdf.setProducer(m.producer)
  pdf.setModificationDate(new Date())
  return await pdf.save()
}

/* ---------- Compression ---------- */

export interface CompressOptions {
  imageDpi: number // target DPI for embedded images
  imageQuality: number // 0..1 for jpeg
  grayscale: boolean
}

/* ---------- Smart (text-preserving) compression ---------- */

export interface SmartCompressOptions {
  imageQuality: number // 0.1..0.95 JPEG quality for embedded images
  maxImagePx: number // 0 = no downsampling; otherwise cap the larger dimension
  onlyShrink: boolean // skip replacement if the new image would be bigger
}

export interface SmartCompressResult {
  bytes: Uint8Array
  imagesFound: number
  imagesReplaced: number
  imagesSkipped: number
  originalSize: number
  outputSize: number
}

/**
 * Compress only the embedded raster images in the PDF.
 * Text, fonts, vectors, and overall structure are preserved.
 *
 * Works on JPEG-encoded image XObjects (`/DCTDecode`). Other compression
 * formats (FlateDecode, CCITTFax, JBIG2) are skipped since decoding them
 * generically in-browser would require reimplementing each filter.
 *
 * Result quality depends heavily on the input: an image-heavy PDF can shrink
 * dramatically; a text-only PDF will barely change because there's nothing
 * to compress in this mode.
 */
export async function compressPdfSmart(
  file: File,
  options: SmartCompressOptions,
  onProgress?: (current: number, total: number) => void,
): Promise<SmartCompressResult> {
  const buf = await file.arrayBuffer()
  const originalSize = buf.byteLength
  const pdf = await PDFDocument.load(buf)

  const candidates: { ref: PDFRef; stream: PDFRawStream }[] = []
  for (const [ref, obj] of pdf.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue
    const dict = obj.dict
    const subtype = dict.get(PDFName.of('Subtype'))
    if (subtype !== PDFName.of('Image')) continue
    // Skip images with transparency masks (would lose alpha on JPEG re-encode)
    if (dict.get(PDFName.of('SMask')) !== undefined) continue
    if (dict.get(PDFName.of('Mask')) !== undefined) continue
    // Skip grayscale to avoid bloating (we re-encode as 3-channel JPEG)
    const colorSpace = dict.get(PDFName.of('ColorSpace'))
    if (colorSpace === PDFName.of('DeviceGray')) continue
    candidates.push({ ref, stream: obj })
  }

  const imagesFound = candidates.length
  let imagesReplaced = 0
  let imagesSkipped = 0

  for (let i = 0; i < candidates.length; i++) {
    const { ref, stream } = candidates[i]
    try {
      const replacement = await tryRecompressImage(stream, options)
      if (replacement) {
        const newDict = pdf.context.obj({
          Type: 'XObject',
          Subtype: 'Image',
          Width: replacement.width,
          Height: replacement.height,
          ColorSpace: 'DeviceRGB',
          BitsPerComponent: 8,
          Filter: 'DCTDecode',
          Length: replacement.bytes.byteLength,
        })
        const newStream = PDFRawStream.of(newDict, replacement.bytes)
        pdf.context.assign(ref, newStream)
        imagesReplaced += 1
      } else {
        imagesSkipped += 1
      }
    } catch {
      imagesSkipped += 1
    }
    onProgress?.(i + 1, imagesFound)
  }

  const bytes = await pdf.save({ useObjectStreams: true })
  return {
    bytes,
    imagesFound,
    imagesReplaced,
    imagesSkipped,
    originalSize,
    outputSize: bytes.byteLength,
  }
}

async function tryRecompressImage(
  stream: PDFRawStream,
  options: SmartCompressOptions,
): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
  const dict = stream.dict
  const filter = dict.get(PDFName.of('Filter'))
  const isJpeg =
    filter === PDFName.of('DCTDecode') ||
    (filter instanceof PDFArray &&
      filter.size() > 0 &&
      filter.get(0) === PDFName.of('DCTDecode'))
  if (!isJpeg) return null

  // Decode the existing JPEG via browser (copy into a fresh ArrayBuffer to satisfy strict TS)
  const orig = stream.contents
  const origBuffer = new ArrayBuffer(orig.byteLength)
  new Uint8Array(origBuffer).set(orig)
  const blob = new Blob([origBuffer], { type: 'image/jpeg' })
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    return null
  }

  let targetW = bitmap.width
  let targetH = bitmap.height
  if (options.maxImagePx > 0 && (bitmap.width > options.maxImagePx || bitmap.height > options.maxImagePx)) {
    const scale = Math.min(options.maxImagePx / bitmap.width, options.maxImagePx / bitmap.height)
    targetW = Math.max(1, Math.round(bitmap.width * scale))
    targetH = Math.max(1, Math.round(bitmap.height * scale))
  }

  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, targetW, targetH)
  ctx.drawImage(bitmap, 0, 0, targetW, targetH)
  bitmap.close?.()

  const newBlob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/jpeg',
      options.imageQuality,
    ),
  )
  const newBytes = new Uint8Array(await newBlob.arrayBuffer())

  if (options.onlyShrink && newBytes.byteLength >= stream.contents.byteLength) {
    return null
  }

  return { bytes: newBytes, width: targetW, height: targetH }
}

/**
 * Compress by re-rendering each page at a chosen DPI as JPEG, then embedding into a fresh PDF.
 * This dramatically shrinks large image-heavy PDFs at the cost of becoming "image-only" (text becomes raster).
 * For text-heavy PDFs this can actually grow the file, so we expose the tradeoff in the UI.
 */
export async function compressPdfByRasterization(
  file: File,
  options: CompressOptions,
  onProgress?: (current: number, total: number) => void,
): Promise<Uint8Array> {
  const pdfjs = await loadPdfJs(file)
  const out = await PDFDocument.create()
  const total = pdfjs.numPages

  for (let i = 1; i <= total; i++) {
    const page = await pdfjs.getPage(i)
    const scale = options.imageDpi / 72
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise

    if (options.grayscale) {
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
      for (let p = 0; p < data.data.length; p += 4) {
        const g =
          0.299 * data.data[p] + 0.587 * data.data[p + 1] + 0.114 * data.data[p + 2]
        data.data[p] = data.data[p + 1] = data.data[p + 2] = g
      }
      ctx.putImageData(data, 0, 0)
    }

    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
        'image/jpeg',
        options.imageQuality,
      ),
    )
    const buf = await blob.arrayBuffer()
    const img = await out.embedJpg(buf)
    const newPage = out.addPage([canvas.width, canvas.height])
    newPage.drawImage(img, { x: 0, y: 0, width: canvas.width, height: canvas.height })

    page.cleanup()
    onProgress?.(i, total)
  }

  return await out.save({ useObjectStreams: true })
}

/* ---------- Page count ---------- */

export async function getPageCount(file: File): Promise<number> {
  const pdf = await loadPdfLib(file)
  return pdf.getPageCount()
}

/* ---------- Render thumbnails ---------- */

export async function renderThumbnail(file: File, pageNumber: number, maxSize = 200): Promise<string> {
  const pdf = await loadPdfJs(file)
  const page = await pdf.getPage(pageNumber)
  const baseViewport = page.getViewport({ scale: 1 })
  const scale = Math.min(maxSize / baseViewport.width, maxSize / baseViewport.height)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  page.cleanup()
  return canvas.toDataURL('image/jpeg', 0.7)
}

// Help TypeScript not complain about unused warning
export type _PDFEmbeddedPage = PDFEmbeddedPage
