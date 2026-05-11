/**
 * PDF compression.
 *
 * The default `compressPdf` runs a two-phase pipeline:
 *   Phase 1 — image recompression (pdf-lib + canvas)
 *      Re-encode every embedded raster (JPEG / FlateDecode-PNG) as smaller
 *      JPEGs, optionally downsampled. Text, fonts, and vectors are untouched.
 *   Phase 2 — MuPDF structural pass (lazy-loaded WASM)
 *      Subset fonts, garbage-collect with deduplication, clean & sanitize
 *      content streams, repack object streams.
 *
 * For files where phase 1 + 2 still can't shrink things meaningfully (e.g.
 * already-optimal PDFs dominated by signature data), `forceCompressPdf`
 * rasterizes every page to JPEG and rebuilds — destroys selectable text but
 * always produces a smaller file.
 *
 * After compression we walk the output's indirect objects with pdf-lib and
 * report a size breakdown so the UI can tell the user where the bytes are.
 *
 * MuPDF is AGPL-3.0-or-later. Fine for open-source / personal use; commercial
 * closed-source distribution requires a license from Artifex.
 */

import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  type PDFRef,
} from 'pdf-lib'
import { loadPdfJs } from './pdfOps'

/* ---------- Tunables ---------- */

const SMART_DEFAULTS = {
  imageQuality: 0.65, // JPEG quality for re-encoded images
  maxImagePx: 1280, // cap on largest image dimension; 0 = no cap
} as const

const FORCE_DEFAULTS: ForceCompressOptions = {
  dpi: 120,
  imageQuality: 0.6,
}

/* ---------- Types ---------- */

export interface ImageRecompressStats {
  imagesFound: number
  imagesReplaced: number
  bytesSaved: number
  jpegHandled: number
  flateHandled: number
  otherSkipped: number
}

export interface StructureBreakdown {
  totalBytes: number
  images: number
  imageCount: number
  fonts: number
  fontCount: number
  signatures: number
  signatureCount: number
  contentStreams: number
  metadata: number
  other: number
}

export interface CompressResult {
  bytes: Uint8Array
  originalSize: number
  outputSize: number
  imageStats: ImageRecompressStats
  breakdown: StructureBreakdown
}

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

export type ProgressFn = (status: string) => void
export type ProgressFnDetailed = (current: number, total: number, status: string) => void

/* ---------- MuPDF lazy loader ----------
 * Imported on first use so the ~12 MB WASM only downloads when the user
 * actually clicks Compress. Browser caches it for subsequent runs.
 */

let mupdfPromise: Promise<typeof import('mupdf')> | null = null
const getMupdf = () => (mupdfPromise ??= import('mupdf'))

/* ---------- Public API ---------- */

export async function compressPdf(file: File, onProgress?: ProgressFn): Promise<CompressResult> {
  const originalSize = file.size

  onProgress?.('Reading PDF...')
  const inputBytes = new Uint8Array(await file.arrayBuffer())

  const phase1 = await recompressEmbeddedImages(
    inputBytes,
    SMART_DEFAULTS,
    (current, total) => onProgress?.(`Recompressing image ${current} of ${total}...`),
  )

  let finalBytes: Uint8Array
  try {
    finalBytes = await runMupdfPass(phase1.bytes, onProgress)
  } catch {
    // mupdf failed — fall back to the phase-1 result so users still get something
    finalBytes = phase1.bytes
  }

  onProgress?.('Analyzing result...')
  const breakdown = await analyzeStructure(finalBytes)

  return {
    bytes: finalBytes,
    originalSize,
    outputSize: finalBytes.byteLength,
    imageStats: phase1.stats,
    breakdown,
  }
}

export async function forceCompressPdf(
  file: File,
  options: ForceCompressOptions = FORCE_DEFAULTS,
  onProgress?: ProgressFnDetailed,
): Promise<ForceCompressResult> {
  const originalSize = file.size
  const src = await loadPdfJs(file)
  const out = await PDFDocument.create()
  const totalPages = src.numPages

  for (let i = 1; i <= totalPages; i++) {
    onProgress?.(i - 1, totalPages, `Rasterizing page ${i} of ${totalPages}...`)

    const page = await src.getPage(i)
    const viewport = page.getViewport({ scale: options.dpi / 72 })
    const canvas = makeCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise

    const jpgBuf = await canvasToJpegArrayBuffer(canvas, options.imageQuality)
    const jpg = await out.embedJpg(jpgBuf)
    const newPage = out.addPage([canvas.width, canvas.height])
    newPage.drawImage(jpg, { x: 0, y: 0, width: canvas.width, height: canvas.height })

    page.cleanup()
    onProgress?.(i, totalPages, `Rasterized page ${i} of ${totalPages}`)
  }

  const bytes = await out.save({ useObjectStreams: true })
  return { bytes, originalSize, outputSize: bytes.byteLength, pages: totalPages }
}

/* ===========================================================
 * Phase 1 — Image recompression
 * =========================================================== */

interface RecompressOptions {
  imageQuality: number
  maxImagePx: number
}

async function recompressEmbeddedImages(
  bytes: Uint8Array,
  options: RecompressOptions,
  onProgress?: (current: number, total: number) => void,
): Promise<{ bytes: Uint8Array; stats: ImageRecompressStats }> {
  const pdf = await PDFDocument.load(copyBuffer(bytes), { ignoreEncryption: true })

  // First pass: collect refs that are *referenced* as an SMask/Mask by some
  // other image. Those refs are alpha-channel companion streams, not visuals
  // — we must not re-encode them as standalone JPEGs.
  const alphaCompanionRefs = new Set<string>()
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue
    const sm = obj.dict.get(PDFName.of('SMask'))
    if (sm) alphaCompanionRefs.add(sm.toString())
    const m = obj.dict.get(PDFName.of('Mask'))
    if (m) alphaCompanionRefs.add(m.toString())
  }

  const candidates: { ref: PDFRef; stream: PDFRawStream }[] = []
  for (const [ref, obj] of pdf.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue
    if (obj.dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue
    if (alphaCompanionRefs.has(ref.toString())) continue
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
      const rep = await recompressOneImage(stream, options, stats)
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

  return { bytes: await pdf.save({ useObjectStreams: true }), stats }
}

async function recompressOneImage(
  stream: PDFRawStream,
  options: RecompressOptions,
  stats: ImageRecompressStats,
): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
  const filterKind = imageFilterKind(stream.dict)

  let pixels: ImageData | null = null
  if (filterKind === 'jpeg') {
    stats.jpegHandled += 1
    pixels = await decodeJpegImage(stream)
  } else if (filterKind === 'flate') {
    stats.flateHandled += 1
    pixels = await decodeFlateImage(stream)
  } else {
    stats.otherSkipped += 1
    return null
  }
  if (!pixels) return null

  const [targetW, targetH] = clampDimensions(pixels.width, pixels.height, options.maxImagePx)
  const canvas = drawPixelsScaled(pixels, targetW, targetH)
  const newBytes = new Uint8Array(await canvasToJpegArrayBuffer(canvas, options.imageQuality))

  // Only replace if we actually saved bytes
  if (newBytes.byteLength >= stream.contents.byteLength) return null
  return { bytes: newBytes, width: targetW, height: targetH }
}

function imageFilterKind(dict: PDFDict): 'jpeg' | 'flate' | 'other' {
  const filter = dict.get(PDFName.of('Filter'))
  const last =
    filter instanceof PDFArray && filter.size() > 0 ? filter.get(filter.size() - 1) : filter
  if (last === PDFName.of('DCTDecode')) return 'jpeg'
  if (last === PDFName.of('FlateDecode')) return 'flate'
  return 'other'
}

async function decodeJpegImage(stream: PDFRawStream): Promise<ImageData | null> {
  const blob = new Blob([copyBuffer(stream.contents)], { type: 'image/jpeg' })
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    return null
  }
  const canvas = makeCanvas(bitmap.width, bitmap.height)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
  bitmap.close?.()
  return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
}

async function decodeFlateImage(stream: PDFRawStream): Promise<ImageData | null> {
  const d = stream.dict
  const width = numberOf(d, 'Width')
  const height = numberOf(d, 'Height')
  if (!width || !height) return null

  const bpc = numberOf(d, 'BitsPerComponent') ?? 8
  if (bpc !== 8) return null

  const cs = d.get(PDFName.of('ColorSpace'))
  let channels = 0
  if (cs === PDFName.of('DeviceRGB')) channels = 3
  else if (cs === PDFName.of('DeviceGray')) channels = 1
  else return null

  let raw: Uint8Array
  try {
    const buf = await new Response(
      new Blob([copyBuffer(stream.contents)]).stream().pipeThrough(new DecompressionStream('deflate')),
    ).arrayBuffer()
    raw = new Uint8Array(buf)
  } catch {
    return null
  }

  let predictor = 1
  let columns = width
  const dp = d.get(PDFName.of('DecodeParms'))
  if (dp instanceof PDFDict) {
    predictor = numberOf(dp, 'Predictor') ?? 1
    columns = numberOf(dp, 'Columns') ?? width
  }

  let pixels: Uint8Array
  if (predictor === 1) {
    pixels = raw
  } else if (predictor >= 10 && predictor <= 15) {
    pixels = reversePngPredictor(raw, columns, height, channels)
    if (!pixels.length) return null
  } else {
    return null
  }

  if (pixels.length < width * height * channels) return null

  const out = new ImageData(width, height)
  if (channels === 3) {
    for (let p = 0, q = 0; q < out.data.length; p += 3, q += 4) {
      out.data[q] = pixels[p]
      out.data[q + 1] = pixels[p + 1]
      out.data[q + 2] = pixels[p + 2]
      out.data[q + 3] = 255
    }
  } else {
    for (let p = 0, q = 0; q < out.data.length; p += 1, q += 4) {
      const v = pixels[p]
      out.data[q] = out.data[q + 1] = out.data[q + 2] = v
      out.data[q + 3] = 255
    }
  }
  return out
}

/** Reverse the per-row PNG predictor filter (types 0-4). */
function reversePngPredictor(
  raw: Uint8Array,
  width: number,
  height: number,
  channels: number,
): Uint8Array {
  const rowBytes = width * channels
  const out = new Uint8Array(height * rowBytes)
  let prevRow = new Uint8Array(rowBytes)
  let inPos = 0

  for (let y = 0; y < height; y++) {
    if (inPos >= raw.length) return new Uint8Array(0)
    const filter = raw[inPos++]
    const rowEnd = Math.min(inPos + rowBytes, raw.length)
    const row = raw.subarray(inPos, rowEnd)
    inPos = rowEnd
    const outRow = out.subarray(y * rowBytes, (y + 1) * rowBytes)

    for (let x = 0; x < rowBytes; x++) {
      const left = x >= channels ? outRow[x - channels] : 0
      const above = prevRow[x]
      const upperLeft = x >= channels ? prevRow[x - channels] : 0
      const cur = row[x] ?? 0
      let val = cur
      switch (filter) {
        case 1: // Sub
          val = (cur + left) & 0xff
          break
        case 2: // Up
          val = (cur + above) & 0xff
          break
        case 3: // Average
          val = (cur + Math.floor((left + above) / 2)) & 0xff
          break
        case 4: {
          // Paeth
          const p = left + above - upperLeft
          const pa = Math.abs(p - left)
          const pb = Math.abs(p - above)
          const pc = Math.abs(p - upperLeft)
          const pred = pa <= pb && pa <= pc ? left : pb <= pc ? above : upperLeft
          val = (cur + pred) & 0xff
          break
        }
        // 0 (None) and unknown filters: leave val = cur
      }
      outRow[x] = val
    }
    prevRow = outRow
  }
  return out
}

/* ===========================================================
 * Phase 2 — MuPDF structural pass
 * =========================================================== */

async function runMupdfPass(bytes: Uint8Array, onProgress?: ProgressFn): Promise<Uint8Array> {
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
      // Some PDFs have encrypted streams or unusual fonts that trip subsetFonts.
      // Carry on with the structural save.
    }

    onProgress?.('Optimizing structure...')
    const buf = doc.saveToBuffer({
      compress: true,
      compressImages: true,
      compressFonts: true,
      // Strongest GC mode — removes unreferenced objects AND merges identical
      // streams (sweeps up the alpha companions we orphaned in phase 1).
      garbage: 'deduplicate',
      cleanContentStreams: true,
      sanitize: true,
      decompress: false,
      pretty: false,
      ascii: false,
      linearize: false,
      continueOnError: true,
    })
    return buf.asUint8Array()
  } finally {
    try {
      doc.destroy()
    } catch {
      // ignore
    }
  }
}

/* ===========================================================
 * Phase 3 — Structural analysis (for the breakdown UI)
 * =========================================================== */

async function analyzeStructure(bytes: Uint8Array): Promise<StructureBreakdown> {
  const totalBytes = bytes.byteLength
  let pdf: PDFDocument
  try {
    pdf = await PDFDocument.load(copyBuffer(bytes), { ignoreEncryption: true })
  } catch {
    return emptyBreakdown(totalBytes)
  }

  // Pre-pass: which stream refs are referenced as Sig /Contents? (They're
  // raw cryptographic data, not images/fonts/text.)
  const signatureContentRefs = new Set<string>()
  let signatureCount = 0
  let signatureDictBytes = 0
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue
    const type = obj.get(PDFName.of('Type'))
    if (type !== PDFName.of('Sig') && type !== PDFName.of('DocTimeStamp')) continue
    signatureCount += 1
    const contents = obj.get(PDFName.of('Contents'))
    if (contents) signatureContentRefs.add(contents.toString())
    // /Contents in a Sig dict is usually a huge hex string — count the dict's
    // serialized length so the breakdown captures it.
    try {
      signatureDictBytes += obj.toString().length
    } catch {
      // ignore
    }
  }

  let images = 0
  let imageCount = 0
  let fonts = 0
  let fontCount = 0
  let signatures = signatureDictBytes
  let contentStreams = 0
  let metadata = 0
  let categorized = signatureDictBytes

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
    } else if (isFontStream(subtype, type)) {
      fonts += size
      fontCount += 1
      categorized += size
    } else if (subtype === PDFName.of('XML') || type === PDFName.of('Metadata')) {
      metadata += size
      categorized += size
    } else if (type === PDFName.of('Sig') || signatureContentRefs.has(ref.toString())) {
      signatures += size
      categorized += size
    } else if (!subtype && !type) {
      // Untyped streams are typically page content streams.
      contentStreams += size
      categorized += size
    }
  }

  // Count Font dicts (not streams) too, so the count is meaningful.
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict && obj.get(PDFName.of('Type')) === PDFName.of('Font')) {
      fontCount += 1
    }
  }

  return {
    totalBytes,
    images,
    imageCount,
    fonts,
    fontCount,
    signatures,
    signatureCount,
    contentStreams,
    metadata,
    other: Math.max(0, totalBytes - categorized),
  }
}

function isFontStream(subtype: unknown, type: unknown): boolean {
  return (
    type === PDFName.of('Font') ||
    type === PDFName.of('FontDescriptor') ||
    subtype === PDFName.of('CIDFontType0C') ||
    subtype === PDFName.of('CIDFontType2') ||
    subtype === PDFName.of('Type1C') ||
    subtype === PDFName.of('OpenType')
  )
}

function emptyBreakdown(totalBytes: number): StructureBreakdown {
  return {
    totalBytes,
    images: 0,
    imageCount: 0,
    fonts: 0,
    fontCount: 0,
    signatures: 0,
    signatureCount: 0,
    contentStreams: 0,
    metadata: 0,
    other: totalBytes,
  }
}

/* ===========================================================
 * Low-level helpers
 * =========================================================== */

/** Copy into a fresh ArrayBuffer to satisfy strict TS Blob type narrowing. */
function copyBuffer(src: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(src.byteLength)
  new Uint8Array(ab).set(src)
  return ab
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  return c
}

function clampDimensions(width: number, height: number, maxPx: number): [number, number] {
  if (maxPx <= 0 || (width <= maxPx && height <= maxPx)) return [width, height]
  const scale = Math.min(maxPx / width, maxPx / height)
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))]
}

function drawPixelsScaled(pixels: ImageData, targetW: number, targetH: number): HTMLCanvasElement {
  const dest = makeCanvas(targetW, targetH)
  const ctx = dest.getContext('2d')!
  if (targetW === pixels.width && targetH === pixels.height) {
    ctx.putImageData(pixels, 0, 0)
    return dest
  }
  // Need a source canvas to draw a scaled bitmap from
  const src = makeCanvas(pixels.width, pixels.height)
  src.getContext('2d')!.putImageData(pixels, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, targetW, targetH)
  return dest
}

async function canvasToJpegArrayBuffer(canvas: HTMLCanvasElement, quality: number): Promise<ArrayBuffer> {
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))),
      'image/jpeg',
      quality,
    ),
  )
  return await blob.arrayBuffer()
}

function numberOf(dict: PDFDict, key: string): number | undefined {
  const v = dict.get(PDFName.of(key))
  return v instanceof PDFNumber ? v.asNumber() : undefined
}
