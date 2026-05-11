import {
  PDFDocument,
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRawStream,
  StandardFonts,
  rgb,
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
  stripMetadata: boolean // remove XMP, thumbnails, vendor data, embedded files
}

export interface SmartCompressResult {
  bytes: Uint8Array
  imagesFound: number
  imagesReplaced: number
  imagesSkipped: number
  imagesFormats: { jpeg: number; flate: number; other: number }
  metadataStripped: boolean
  originalSize: number
  outputSize: number
}

/**
 * Compress only the embedded raster images in the PDF.
 * Text, fonts, vectors, and overall structure are preserved.
 *
 * Handles:
 *   - JPEG (`/DCTDecode`) images — decoded via browser, re-encoded at chosen quality
 *   - PNG-style (`/FlateDecode`) images with predictor 1 or PNG predictor 15 (the
 *     two near-universal cases), DeviceRGB/DeviceGray, 8 bits per component
 *   - Optional document-level metadata/thumbnail/attachment stripping
 *
 * Skipped:
 *   - Images with /SMask or /Mask (transparency would be lost)
 *   - Indexed, CMYK, or ICC-based color spaces
 *   - CCITTFax / JBIG2 / JPEG2000 streams
 */
export async function compressPdfSmart(
  file: File,
  options: SmartCompressOptions,
  onProgress?: (current: number, total: number, status: string) => void,
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
    if (dict.get(PDFName.of('SMask')) !== undefined) continue
    if (dict.get(PDFName.of('Mask')) !== undefined) continue
    candidates.push({ ref, stream: obj })
  }

  const imagesFound = candidates.length
  let imagesReplaced = 0
  let imagesSkipped = 0
  const imagesFormats = { jpeg: 0, flate: 0, other: 0 }

  for (let i = 0; i < candidates.length; i++) {
    const { ref, stream } = candidates[i]
    onProgress?.(i, imagesFound, `Recompressing image ${i + 1} of ${imagesFound}...`)
    try {
      const replacement = await tryRecompressImage(stream, options, imagesFormats)
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
  }

  let metadataStripped = false
  if (options.stripMetadata) {
    metadataStripped = stripDocumentJunk(pdf)
  }

  onProgress?.(imagesFound, imagesFound, 'Saving...')
  const bytes = await pdf.save({ useObjectStreams: true })
  return {
    bytes,
    imagesFound,
    imagesReplaced,
    imagesSkipped,
    imagesFormats,
    metadataStripped,
    originalSize,
    outputSize: bytes.byteLength,
  }
}

async function tryRecompressImage(
  stream: PDFRawStream,
  options: SmartCompressOptions,
  formats: { jpeg: number; flate: number; other: number },
): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
  const dict = stream.dict
  const filter = dict.get(PDFName.of('Filter'))

  const filterIsJpeg =
    filter === PDFName.of('DCTDecode') ||
    (filter instanceof PDFArray &&
      filter.size() > 0 &&
      filter.get(filter.size() - 1) === PDFName.of('DCTDecode'))
  const filterIsFlate =
    filter === PDFName.of('FlateDecode') ||
    (filter instanceof PDFArray &&
      filter.size() > 0 &&
      filter.get(filter.size() - 1) === PDFName.of('FlateDecode'))

  let imageData: ImageData | null = null

  if (filterIsJpeg) {
    formats.jpeg += 1
    imageData = await decodeJpegToImageData(stream)
  } else if (filterIsFlate) {
    formats.flate += 1
    imageData = await decodeFlateImageToImageData(stream)
  } else {
    formats.other += 1
    return null
  }

  if (!imageData) return null

  let targetW = imageData.width
  let targetH = imageData.height
  if (
    options.maxImagePx > 0 &&
    (imageData.width > options.maxImagePx || imageData.height > options.maxImagePx)
  ) {
    const scale = Math.min(
      options.maxImagePx / imageData.width,
      options.maxImagePx / imageData.height,
    )
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
    // Need to scale: render imageData to a source canvas first
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

  if (options.onlyShrink && newBytes.byteLength >= stream.contents.byteLength) {
    return null
  }
  return { bytes: newBytes, width: targetW, height: targetH }
}

async function decodeJpegToImageData(stream: PDFRawStream): Promise<ImageData | null> {
  const orig = stream.contents
  const buffer = new ArrayBuffer(orig.byteLength)
  new Uint8Array(buffer).set(orig)
  const blob = new Blob([buffer], { type: 'image/jpeg' })
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    return null
  }
  const c = document.createElement('canvas')
  c.width = bitmap.width
  c.height = bitmap.height
  const ctx = c.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close?.()
  return ctx.getImageData(0, 0, c.width, c.height)
}

async function decodeFlateImageToImageData(stream: PDFRawStream): Promise<ImageData | null> {
  const dict = stream.dict
  const width = (dict.get(PDFName.of('Width')) as PDFNumber | undefined)?.asNumber()
  const height = (dict.get(PDFName.of('Height')) as PDFNumber | undefined)?.asNumber()
  if (!width || !height) return null

  const bpc = (dict.get(PDFName.of('BitsPerComponent')) as PDFNumber | undefined)?.asNumber() ?? 8
  if (bpc !== 8) return null // unsupported

  // Determine channel count from ColorSpace
  const cs = dict.get(PDFName.of('ColorSpace'))
  let channels = 0
  if (cs === PDFName.of('DeviceRGB')) channels = 3
  else if (cs === PDFName.of('DeviceGray')) channels = 1
  else return null // Indexed/CMYK/ICCBased not handled here

  // Decompress
  const comp = stream.contents
  const compBuf = new ArrayBuffer(comp.byteLength)
  new Uint8Array(compBuf).set(comp)
  let decompressed: Uint8Array
  try {
    const decompressedBuf = await new Response(
      new Blob([compBuf]).stream().pipeThrough(new DecompressionStream('deflate')),
    ).arrayBuffer()
    decompressed = new Uint8Array(decompressedBuf)
  } catch {
    return null
  }

  // Predictor handling
  let predictor = 1
  let columns = width
  const dpRaw = dict.get(PDFName.of('DecodeParms'))
  if (dpRaw instanceof PDFDict) {
    const p = dpRaw.get(PDFName.of('Predictor'))
    if (p instanceof PDFNumber) predictor = p.asNumber()
    const cols = dpRaw.get(PDFName.of('Columns'))
    if (cols instanceof PDFNumber) columns = cols.asNumber()
  }

  let pixels: Uint8Array
  if (predictor === 1) {
    pixels = decompressed
  } else if (predictor >= 10 && predictor <= 15) {
    // PNG predictors: per-row filter byte
    pixels = reversePngPredictor(decompressed, columns, height, channels)
    if (!pixels) return null
  } else {
    return null // TIFF predictor (2) and others not supported
  }

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

function reversePngPredictor(
  raw: Uint8Array,
  width: number,
  height: number,
  channels: number,
): Uint8Array {
  // Each row: 1 filter byte + (width * channels) data bytes
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
        case 0: // None
          break
        case 1: // Sub
          val = (val + left) & 0xff
          break
        case 2: // Up
          val = (val + above) & 0xff
          break
        case 3: // Average
          val = (val + Math.floor((left + above) / 2)) & 0xff
          break
        case 4: {
          // Paeth
          const p = left + above - upperLeft
          const pa = Math.abs(p - left)
          const pb = Math.abs(p - above)
          const pc = Math.abs(p - upperLeft)
          const pred = pa <= pb && pa <= pc ? left : pb <= pc ? above : upperLeft
          val = (val + pred) & 0xff
          break
        }
        default:
          // Unknown filter; treat as None
          break
      }
      outRow[x] = val
    }
    prevRow = outRow
  }
  return out
}

function stripDocumentJunk(pdf: PDFDocument): boolean {
  let touched = false
  const catalog = pdf.catalog
  for (const key of ['Metadata', 'PieceInfo', 'StructTreeRoot', 'MarkInfo', 'OutputIntents']) {
    if (catalog.get(PDFName.of(key)) !== undefined) {
      catalog.delete(PDFName.of(key))
      touched = true
    }
  }
  // Drop file attachments via /Names /EmbeddedFiles
  const names = catalog.get(PDFName.of('Names'))
  if (names instanceof PDFDict) {
    if (names.get(PDFName.of('EmbeddedFiles')) !== undefined) {
      names.delete(PDFName.of('EmbeddedFiles'))
      touched = true
    }
  }
  // Per-page: drop thumbnails and vendor PieceInfo
  for (const page of pdf.getPages()) {
    const node = page.node
    for (const key of ['Thumb', 'PieceInfo', 'Metadata']) {
      if (node.get(PDFName.of(key)) !== undefined) {
        node.delete(PDFName.of(key))
        touched = true
      }
    }
  }
  return touched
}

export const SMART_COMPRESS_PRESET: SmartCompressOptions = {
  imageQuality: 0.65,
  maxImagePx: 1280,
  onlyShrink: true,
  stripMetadata: true,
}

/* ---------- Hybrid compression (rasterize + invisible text overlay) ---------- */

export interface HybridCompressOptions {
  dpi: number // page rendering DPI (e.g. 144 = good screen quality)
  imageQuality: number // JPEG quality 0..1 for rendered pages
}

export interface HybridCompressResult {
  bytes: Uint8Array
  originalSize: number
  outputSize: number
  pages: number
  textItemsOverlaid: number
  textItemsSkipped: number
}

/**
 * Rasterize each page to a JPEG and reassemble into a new PDF, with the
 * original text drawn behind the image so the document remains selectable.
 *
 * This is how commercial tools achieve big shrinkage on PDFs whose bulk is
 * embedded fonts (typical of CJK / multilingual docs). The new PDF embeds
 * one common Latin font (Helvetica) and one JPEG per page. CJK characters
 * that Helvetica cannot encode are silently skipped — they remain visible
 * in the page image, just not selectable.
 *
 * Trade-off: visual fidelity caps at the chosen DPI. Pure-text PDFs may end
 * up *larger* than the original since you're replacing efficient text with
 * a raster image, so this mode is meant for the fallback path when smart
 * compression didn't move the needle.
 */
export async function compressPdfHybrid(
  file: File,
  options: HybridCompressOptions,
  onProgress?: (current: number, total: number, status: string) => void,
): Promise<HybridCompressResult> {
  const originalSize = file.size
  const srcPdfJs = await loadPdfJs(file)
  const outPdf = await PDFDocument.create()
  const helvetica = await outPdf.embedFont(StandardFonts.Helvetica)

  const totalPages = srcPdfJs.numPages
  let textItemsOverlaid = 0
  let textItemsSkipped = 0

  for (let i = 1; i <= totalPages; i++) {
    onProgress?.(i - 1, totalPages, `Rendering page ${i} of ${totalPages}...`)

    const page = await srcPdfJs.getPage(i)
    const viewportPt = page.getViewport({ scale: 1 })
    const pageW = viewportPt.width
    const pageH = viewportPt.height

    // Render at chosen DPI
    const renderScale = options.dpi / 72
    const renderViewport = page.getViewport({ scale: renderScale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(renderViewport.width)
    canvas.height = Math.ceil(renderViewport.height)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport: renderViewport }).promise

    // Encode rendered page as JPEG
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
    const jpgImage = await outPdf.embedJpg(jpgBuf)

    // Pull text content for overlay
    const textContent = await page.getTextContent()

    const newPage = outPdf.addPage([pageW, pageH])

    // Draw the original text FIRST (will end up behind the image in z-order)
    // The text is in the document but visually covered by the JPEG that we'll
    // paint on top — PDF readers can still select/copy/search it.
    for (const raw of textContent.items as Array<{ str: string; transform: number[] }>) {
      if (!raw.str || !raw.str.trim()) continue
      const x = raw.transform[4]
      const y = raw.transform[5]
      const fontSize = Math.abs(raw.transform[3]) || 10

      try {
        newPage.drawText(raw.str, {
          x,
          y,
          size: fontSize,
          font: helvetica,
          color: rgb(0, 0, 0),
        })
        textItemsOverlaid += 1
      } catch {
        // Helvetica (WinAnsi) cannot encode the character (e.g., CJK).
        // We skip the text overlay for these items; the chars remain visible
        // in the rendered image, just not selectable.
        textItemsSkipped += 1
      }
    }

    // Now draw the rendered page image full-bleed, covering the text behind it
    newPage.drawImage(jpgImage, { x: 0, y: 0, width: pageW, height: pageH })

    page.cleanup()
    onProgress?.(i, totalPages, `Page ${i} of ${totalPages} done`)
  }

  onProgress?.(totalPages, totalPages, 'Saving...')
  const bytes = await outPdf.save({ useObjectStreams: true })
  return {
    bytes,
    originalSize,
    outputSize: bytes.byteLength,
    pages: totalPages,
    textItemsOverlaid,
    textItemsSkipped,
  }
}

export const HYBRID_COMPRESS_PRESET: HybridCompressOptions = {
  dpi: 144,
  imageQuality: 0.65,
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
