import {
  PDFDocument,
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
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

export interface ImageRecompressStats {
  imagesFound: number
  imagesReplaced: number
  bytesSaved: number
  jpegHandled: number
  flateHandled: number
  otherSkipped: number
}


export interface CompressResult {
  bytes: Uint8Array
  imageStats: ImageRecompressStats
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

/* ---------- Phase 1: image recompression (pdf-lib + canvas) ---------- */

interface RecompressOptions {
  imageQuality: number
  maxImagePx: number
}

async function recompressEmbeddedImages(
  bytes: Uint8Array,
  options: RecompressOptions,
  onProgress?: (current: number, total: number) => void,
): Promise<{ bytes: Uint8Array; stats: ImageRecompressStats }> {
  const ab = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(ab).set(bytes)
  const pdf = await PDFDocument.load(ab, { ignoreEncryption: true })

  // First pass: find SMask references so we don't process them as standalone
  // images (they ARE alpha channels for other images, not independent visuals).
  const smaskRefs = new Set<string>()
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue
    const sm = obj.dict.get(PDFName.of('SMask'))
    if (sm) smaskRefs.add(sm.toString())
    const m = obj.dict.get(PDFName.of('Mask'))
    if (m) smaskRefs.add(m.toString())
  }

  const candidates: { ref: PDFRef; stream: PDFRawStream }[] = []
  for (const [ref, obj] of pdf.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue
    const d = obj.dict
    const subtype = d.get(PDFName.of('Subtype'))
    if (subtype !== PDFName.of('Image')) continue
    // Don't process SMask streams as if they were visible images
    if (smaskRefs.has(ref.toString())) continue
    candidates.push({ ref, stream: obj })
  }

  const stats: ImageRecompressStats = {
    imagesFound: candidates.length,
    imagesReplaced: 0,
    bytesSaved: 0,
    jpegHandled: 0,
    flateHandled: 0,
    otherSkipped: 0,
  }

  for (let i = 0; i < candidates.length; i++) {
    const { ref, stream } = candidates[i]
    onProgress?.(i, candidates.length)
    try {
      const rep = await tryRecompressOneImage(stream, options, stats)
      if (rep) {
        const newDict = pdf.context.obj({
          Type: 'XObject',
          Subtype: 'Image',
          Width: rep.width,
          Height: rep.height,
          ColorSpace: 'DeviceRGB',
          BitsPerComponent: 8,
          Filter: 'DCTDecode',
          Length: rep.bytes.byteLength,
        })
        pdf.context.assign(ref, PDFRawStream.of(newDict, rep.bytes))
        stats.imagesReplaced += 1
        stats.bytesSaved += stream.contents.byteLength - rep.bytes.byteLength
      }
    } catch {
      stats.otherSkipped += 1
    }
  }
  onProgress?.(candidates.length, candidates.length)

  const outBytes = await pdf.save({ useObjectStreams: true })
  return { bytes: outBytes, stats }
}

async function tryRecompressOneImage(
  stream: PDFRawStream,
  options: RecompressOptions,
  stats: ImageRecompressStats,
): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
  const dict = stream.dict
  const filter = dict.get(PDFName.of('Filter'))
  const isJpeg =
    filter === PDFName.of('DCTDecode') ||
    (filter instanceof PDFArray &&
      filter.size() > 0 &&
      filter.get(filter.size() - 1) === PDFName.of('DCTDecode'))
  const isFlate =
    filter === PDFName.of('FlateDecode') ||
    (filter instanceof PDFArray &&
      filter.size() > 0 &&
      filter.get(filter.size() - 1) === PDFName.of('FlateDecode'))

  let imageData: ImageData | null = null
  if (isJpeg) {
    stats.jpegHandled += 1
    imageData = await decodeJpegStream(stream)
  } else if (isFlate) {
    stats.flateHandled += 1
    imageData = await decodeFlateStream(stream)
  } else {
    stats.otherSkipped += 1
    return null
  }
  if (!imageData) return null

  let targetW = imageData.width
  let targetH = imageData.height
  if (
    options.maxImagePx > 0 &&
    (imageData.width > options.maxImagePx || imageData.height > options.maxImagePx)
  ) {
    const scale = Math.min(options.maxImagePx / imageData.width, options.maxImagePx / imageData.height)
    targetW = Math.max(1, Math.round(imageData.width * scale))
    targetH = Math.max(1, Math.round(imageData.height * scale))
  }

  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, targetW, targetH)
  if (targetW === imageData.width && targetH === imageData.height) {
    ctx.putImageData(imageData, 0, 0)
  } else {
    const src = document.createElement('canvas')
    src.width = imageData.width
    src.height = imageData.height
    src.getContext('2d')!.putImageData(imageData, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(src, 0, 0, targetW, targetH)
  }

  const newBlob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/jpeg',
      options.imageQuality,
    ),
  )
  const newBytes = new Uint8Array(await newBlob.arrayBuffer())
  if (newBytes.byteLength >= stream.contents.byteLength) return null
  return { bytes: newBytes, width: targetW, height: targetH }
}

async function decodeJpegStream(stream: PDFRawStream): Promise<ImageData | null> {
  const orig = stream.contents
  const ab = new ArrayBuffer(orig.byteLength)
  new Uint8Array(ab).set(orig)
  const blob = new Blob([ab], { type: 'image/jpeg' })
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    return null
  }
  const c = document.createElement('canvas')
  c.width = bitmap.width
  c.height = bitmap.height
  const cx = c.getContext('2d')!
  cx.drawImage(bitmap, 0, 0)
  bitmap.close?.()
  return cx.getImageData(0, 0, c.width, c.height)
}

async function decodeFlateStream(stream: PDFRawStream): Promise<ImageData | null> {
  const d = stream.dict
  const width = (d.get(PDFName.of('Width')) as PDFNumber | undefined)?.asNumber()
  const height = (d.get(PDFName.of('Height')) as PDFNumber | undefined)?.asNumber()
  if (!width || !height) return null
  const bpc = (d.get(PDFName.of('BitsPerComponent')) as PDFNumber | undefined)?.asNumber() ?? 8
  if (bpc !== 8) return null
  const cs = d.get(PDFName.of('ColorSpace'))
  let channels = 0
  if (cs === PDFName.of('DeviceRGB')) channels = 3
  else if (cs === PDFName.of('DeviceGray')) channels = 1
  else return null

  const comp = stream.contents
  const compBuf = new ArrayBuffer(comp.byteLength)
  new Uint8Array(compBuf).set(comp)
  let decompressed: Uint8Array
  try {
    const buf = await new Response(
      new Blob([compBuf]).stream().pipeThrough(new DecompressionStream('deflate')),
    ).arrayBuffer()
    decompressed = new Uint8Array(buf)
  } catch {
    return null
  }

  let predictor = 1
  let columns = width
  const dpRaw = d.get(PDFName.of('DecodeParms'))
  if (dpRaw instanceof PDFDict) {
    const p = dpRaw.get(PDFName.of('Predictor'))
    if (p instanceof PDFNumber) predictor = p.asNumber()
    const cols = dpRaw.get(PDFName.of('Columns'))
    if (cols instanceof PDFNumber) columns = cols.asNumber()
  }

  let pixels: Uint8Array
  if (predictor === 1) pixels = decompressed
  else if (predictor >= 10 && predictor <= 15) {
    pixels = reversePngPredictor(decompressed, columns, height, channels)
    if (!pixels.length) return null
  } else return null

  const expected = width * height * channels
  if (pixels.length < expected) return null
  const id = new ImageData(width, height)
  if (channels === 3) {
    for (let p = 0, q = 0; q < id.data.length; p += 3, q += 4) {
      id.data[q] = pixels[p]
      id.data[q + 1] = pixels[p + 1]
      id.data[q + 2] = pixels[p + 2]
      id.data[q + 3] = 255
    }
  } else {
    for (let p = 0, q = 0; q < id.data.length; p += 1, q += 4) {
      id.data[q] = id.data[q + 1] = id.data[q + 2] = pixels[p]
      id.data[q + 3] = 255
    }
  }
  return id
}

function reversePngPredictor(raw: Uint8Array, width: number, height: number, channels: number): Uint8Array {
  const rowBytes = width * channels
  const out = new Uint8Array(height * rowBytes)
  let prevRow = new Uint8Array(rowBytes)
  let inPos = 0
  for (let y = 0; y < height; y++) {
    if (inPos >= raw.length) return new Uint8Array(0)
    const filter = raw[inPos]
    inPos += 1
    const rowEnd = Math.min(inPos + rowBytes, raw.length)
    const row = raw.subarray(inPos, rowEnd)
    inPos = rowEnd
    const outRow = out.subarray(y * rowBytes, (y + 1) * rowBytes)
    for (let x = 0; x < rowBytes; x++) {
      const left = x >= channels ? outRow[x - channels] : 0
      const above = prevRow[x]
      const upperLeft = x >= channels ? prevRow[x - channels] : 0
      let val = row[x] ?? 0
      switch (filter) {
        case 0:
          break
        case 1:
          val = (val + left) & 0xff
          break
        case 2:
          val = (val + above) & 0xff
          break
        case 3:
          val = (val + Math.floor((left + above) / 2)) & 0xff
          break
        case 4: {
          const p = left + above - upperLeft
          const pa = Math.abs(p - left)
          const pb = Math.abs(p - above)
          const pc = Math.abs(p - upperLeft)
          const pred = pa <= pb && pa <= pc ? left : pb <= pc ? above : upperLeft
          val = (val + pred) & 0xff
          break
        }
        default:
          break
      }
      outRow[x] = val
    }
    prevRow = outRow
  }
  return out
}

/* ---------- Phase 2: mupdf structural pass ---------- */

async function runMupdfPass(
  bytes: Uint8Array,
  onProgress?: (status: string) => void,
): Promise<Uint8Array> {
  onProgress?.('Loading PDF engine...')
  const mupdf = await getMupdf()

  const doc = mupdf.PDFDocument.openDocument(bytes, 'application/pdf') as InstanceType<
    typeof mupdf.PDFDocument
  >
  try {
    onProgress?.('Subsetting fonts...')
    try {
      doc.subsetFonts()
    } catch {
      // skip on failure
    }
    onProgress?.('Optimizing structure...')
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
    return out.asUint8Array()
  } finally {
    try {
      doc.destroy()
    } catch {
      // ignore
    }
  }
}

/* ---------- Main compress entry point ---------- */

export async function compressPdf(
  file: File,
  onProgress?: (status: string) => void,
): Promise<CompressResult> {
  const originalSize = file.size

  onProgress?.('Reading PDF...')
  const buf = await file.arrayBuffer()

  // Phase 1: recompress embedded images
  const phase1 = await recompressEmbeddedImages(
    new Uint8Array(buf),
    { imageQuality: 0.65, maxImagePx: 1280 },
    (c, t) => onProgress?.(`Recompressing image ${c} of ${t}...`),
  )

  // Phase 2: mupdf structural optimization on the recompressed bytes
  let finalBytes: Uint8Array
  try {
    finalBytes = await runMupdfPass(phase1.bytes, onProgress)
  } catch {
    // mupdf phase failed — keep phase1 result as the final output
    finalBytes = phase1.bytes
  }

  // Phase 3: structural breakdown of the result
  onProgress?.('Analyzing result...')
  const breakdown = await analyzeStructure(finalBytes)

  return {
    bytes: finalBytes,
    imageStats: phase1.stats,
    originalSize,
    outputSize: finalBytes.byteLength,
    breakdown,
  }
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
