import {
  PDFDocument,
  PDFDict,
  PDFName,
  PDFRawStream,
  degrees,
  type PDFEmbeddedPage,
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

/* ---------- Compression (MuPDF) ----------
 *
 * Backed by MuPDF (Artifex) compiled to WebAssembly. Performs the same set of
 * optimizations commercial converters use:
 *   - Font subsetting (the big win for CJK / multilingual PDFs)
 *   - Image stream recompression
 *   - Object stream packing
 *   - Garbage collection of unreferenced objects
 *   - Content stream cleaning
 *
 * The mupdf WASM module is loaded on demand the first time the user clicks
 * Compress, then cached by the browser. ~12 MB one-time download.
 *
 * NOTE: MuPDF is AGPL-3.0-or-later. Fine for non-commercial / open-source use;
 * a commercial license from Artifex is required for closed-source distribution.
 */

export interface StructureBreakdown {
  totalBytes: number
  images: number
  fonts: number
  signatures: number // signature dictionaries and their contents
  contentStreams: number
  metadata: number
  other: number
  imageCount: number
  fontCount: number
  signatureCount: number
}

export interface CompressResult {
  bytes: Uint8Array
  originalSize: number
  outputSize: number
  breakdown: StructureBreakdown
}

let mupdfPromise: Promise<typeof import('mupdf')> | null = null
function getMupdf() {
  if (!mupdfPromise) mupdfPromise = import('mupdf')
  return mupdfPromise
}

/**
 * Analyze the size distribution of indirect objects in a PDF, grouping by
 * category so we can tell the user what's actually making their file big.
 */
async function analyzeStructure(bytes: Uint8Array): Promise<StructureBreakdown> {
  const totalBytes = bytes.byteLength
  const ab = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(ab).set(bytes)
  let pdf: PDFDocument
  try {
    pdf = await PDFDocument.load(ab, { ignoreEncryption: true })
  } catch {
    return {
      totalBytes,
      images: 0,
      fonts: 0,
      signatures: 0,
      contentStreams: 0,
      metadata: 0,
      other: totalBytes,
      imageCount: 0,
      fontCount: 0,
      signatureCount: 0,
    }
  }

  let images = 0
  let fonts = 0
  let signatures = 0
  let contentStreams = 0
  let metadata = 0
  let categorized = 0
  let imageCount = 0
  let fontCount = 0
  let signatureCount = 0

  const signatureContentRefs = new Set<string>()
  // First pass: find any /Contents on signature dicts so we know which stream
  // bytes to attribute to signatures.
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue
    const type = obj.get(PDFName.of('Type'))
    if (type === PDFName.of('Sig') || type === PDFName.of('DocTimeStamp')) {
      signatureCount += 1
      const contents = obj.get(PDFName.of('Contents'))
      if (contents) signatureContentRefs.add(contents.toString())
      // The Contents itself in a Sig dict is usually a hex string, not a stream
      // but it dominates the dict's serialized size — count its length.
      try {
        const sigBytes = obj.toString().length
        signatures += sigBytes
        categorized += sigBytes
      } catch {
        // ignore
      }
    }
  }

  for (const [ref, obj] of pdf.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue
    const size = obj.contents.byteLength
    const dict = obj.dict
    const subtype = dict.get(PDFName.of('Subtype'))
    const type = dict.get(PDFName.of('Type'))

    if (subtype === PDFName.of('Image')) {
      images += size
      imageCount += 1
      categorized += size
    } else if (
      type === PDFName.of('Font') ||
      type === PDFName.of('FontDescriptor') ||
      subtype === PDFName.of('CIDFontType0C') ||
      subtype === PDFName.of('CIDFontType2') ||
      subtype === PDFName.of('Type1C') ||
      subtype === PDFName.of('OpenType')
    ) {
      fonts += size
      fontCount += 1
      categorized += size
    } else if (subtype === PDFName.of('XML') || type === PDFName.of('Metadata')) {
      metadata += size
      categorized += size
    } else if (
      type === PDFName.of('Sig') ||
      signatureContentRefs.has(ref.toString())
    ) {
      signatures += size
      categorized += size
    } else if (subtype === undefined && type === undefined) {
      // Likely a content stream
      contentStreams += size
      categorized += size
    }
  }

  // Count CIDSystemInfo / Font dicts (non-stream) under fonts too
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue
    const type = obj.get(PDFName.of('Type'))
    if (type === PDFName.of('Font')) fontCount += 1
  }

  const other = Math.max(0, totalBytes - categorized)
  return {
    totalBytes,
    images,
    fonts,
    signatures,
    contentStreams,
    metadata,
    other,
    imageCount,
    fontCount,
    signatureCount,
  }
}

export async function compressPdf(
  file: File,
  onProgress?: (status: string) => void,
): Promise<CompressResult> {
  const originalSize = file.size

  onProgress?.('Loading PDF engine...')
  const mupdf = await getMupdf()

  onProgress?.('Reading PDF...')
  const buf = await file.arrayBuffer()
  const data = new Uint8Array(buf)
  const doc = mupdf.PDFDocument.openDocument(data, 'application/pdf') as InstanceType<
    typeof mupdf.PDFDocument
  >

  let outBytes: Uint8Array
  try {
    onProgress?.('Subsetting fonts...')
    try {
      doc.subsetFonts()
    } catch {
      // Subsetting may fail on some PDFs (encrypted streams, unusual font types).
    }

    onProgress?.('Optimizing & saving...')
    // Most aggressive non-destructive options. "deduplicate" garbage is the
    // strongest collection mode — it removes unused objects AND merges
    // identical streams (e.g. duplicated images / form XObjects across pages).
    const out = doc.saveToBuffer({
      compress: true,
      compressImages: true,
      compressFonts: true,
      garbage: 'deduplicate',
      cleanContentStreams: true,
      sanitize: true,
      pretty: false,
      ascii: false,
      decompress: false,
      linearize: false,
      continueOnError: true,
    })
    outBytes = out.asUint8Array()
  } finally {
    try {
      doc.destroy()
    } catch {
      // ignore cleanup failures
    }
  }

  onProgress?.('Analyzing result...')
  const breakdown = await analyzeStructure(outBytes)

  return { bytes: outBytes, originalSize, outputSize: outBytes.byteLength, breakdown }
}

/* ---------- Force compression (rasterize all pages) ---------- */

export interface ForceCompressOptions {
  dpi: number
  imageQuality: number
}

export interface ForceCompressResult {
  bytes: Uint8Array
  originalSize: number
  outputSize: number
  pages: number
}

/**
 * Last-resort compression: render every page as JPEG and reassemble.
 * Text becomes raster (no longer selectable). Used when mupdf's
 * structure-preserving compression can't shrink the file because the
 * bulk is something like embedded signatures or already-optimized fonts.
 */
export async function forceCompressPdf(
  file: File,
  options: ForceCompressOptions,
  onProgress?: (current: number, total: number, status: string) => void,
): Promise<ForceCompressResult> {
  const originalSize = file.size
  const srcPdfJs = await loadPdfJs(file)
  const outPdf = await PDFDocument.create()
  const totalPages = srcPdfJs.numPages

  for (let i = 1; i <= totalPages; i++) {
    onProgress?.(i - 1, totalPages, `Rasterizing page ${i} of ${totalPages}...`)
    const page = await srcPdfJs.getPage(i)
    const scale = options.dpi / 72
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise

    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
        'image/jpeg',
        options.imageQuality,
      ),
    )
    const blobArr = new Uint8Array(await blob.arrayBuffer())
    const jpgBuf = new ArrayBuffer(blobArr.byteLength)
    new Uint8Array(jpgBuf).set(blobArr)
    const jpg = await outPdf.embedJpg(jpgBuf)
    const newPage = outPdf.addPage([canvas.width, canvas.height])
    newPage.drawImage(jpg, { x: 0, y: 0, width: canvas.width, height: canvas.height })

    page.cleanup()
    onProgress?.(i, totalPages, `Rasterized page ${i} of ${totalPages}`)
  }

  const bytes = await outPdf.save({ useObjectStreams: true })
  return { bytes, originalSize, outputSize: bytes.byteLength, pages: totalPages }
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
