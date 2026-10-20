/**
 * PDF editor — edit model and the pipeline that writes it into the PDF.
 *
 * All geometry is PDF user space (points, origin bottom-left, before
 * /Rotate). Saving runs in three steps:
 *
 *  1. Remove: original glyphs of edited text-layer lines are deleted from
 *     the content stream with MuPDF (editorRedact.ts), so the page underneath
 *     — coloured panels, rules, images — stays exactly as it was.
 *  2. Cover: where the original text is pixels (scans, OCR) or removal
 *     didn't take, the area is repainted with a background reconstructed from
 *     its surroundings (editorPixels.ts) — or a flat fill when the paper is
 *     flat. Erase boxes use the same machinery.
 *  3. Draw: images, then text. Each character is set in the document's own
 *     font when that font has the glyph (editorPdfFonts.ts), otherwise in the
 *     closest fallback (editorFonts.ts), laid out by editorTypeset.ts.
 *
 * The same pipeline renders single-page previews, so what the editor shows
 * between keystrokes is what Save will produce.
 */

import {
  PDFDocument,
  PDFName,
  PDFObjectCopier,
  PDFRef,
  TextRenderingMode,
  beginText,
  degrees,
  endText,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setCharacterSqueeze,
  setFillingRgbColor,
  setFontAndSize,
  setLineWidth,
  setStrokingRgbColor,
  setTextMatrix,
  setTextRenderingMode,
  showText,
} from 'pdf-lib'
import type { PDFImage, PDFPage } from 'pdf-lib'
import { FontBank, originalFontHandle, prefersPretendard, type FontHandle } from './editorFonts'
import { fontRefStillValid, resolveOriginalFont, type OriginalFont } from './editorPdfFonts'
import { removeTextInRects } from './editorRedact'
import { typeset } from './editorTypeset'
import { rectKey, type Rect } from './editorGeometry'
import { removalBand, type FontFamily, type FontInfo, type TextAlign, type TextLine } from './editorLayout'
import type { Patch } from './editorPixels'
import { pdfjsLib } from './pdfWorker'
import { pick } from '../i18n'
import editMessages from '../i18n/messages/edit'

/* ---------- Edit model ---------- */

export type AnnotationKind = 'text' | 'image' | 'whiteout'

export interface BaseAnnotation {
  id: string
  page: number // 1-indexed
}

export interface TextStyle {
  fontSize: number
  color: string
  bold: boolean
  italic: boolean
  /** 'original' = the document's own font, falling back per character. */
  family: 'original' | FontFamily
  align: TextAlign
  /** Line spacing as a multiple of the font size. */
  lineHeight: number
  /** Horizontal scale, 1 = 100%. */
  hScale: number
}

/** What an edit of existing text replaces. */
export interface TextSource {
  origin: 'layer' | 'ocr'
  lineIds: string[]
  originalText: string
  /** Bands whose glyphs are deleted from the content stream (text layer). */
  removeRects: Rect[]
  /** Full glyph boxes: repainted when `alwaysCover`, or when removal fails. */
  coverRects: Rect[]
  /** The original is pixels — always repaint `coverRects`. */
  alwaysCover: boolean
  bg: string
  font: FontInfo | null
  /** The page is mostly Korean — fallback Latin/digits use Pretendard too. */
  koreanPage?: boolean
  /** Raw runs of the original font, to recover its letter spacing. */
  samples: { str: string; width: number }[]
  sampleSize: number
  /** Style as detected, for "reset". */
  detected: TextStyle
}

export interface TextAnnotation extends BaseAnnotation {
  kind: 'text'
  /** Baseline origin of the first line at the box's left edge. */
  x: number
  y: number
  /** Box width (wrap width / alignment width), points. */
  width: number
  /** Baseline angle, degrees counter-clockwise. */
  rotation: number
  text: string
  style: TextStyle
  wrap: boolean
  fit: 'none' | 'shrink'
  /** First-line indent, points. */
  indent: number
  source?: TextSource
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
  /** 'auto' rebuilds the background from the surroundings. */
  fill: 'auto' | 'white' | 'custom'
  /** Solid colour used for 'white' / 'custom', and as auto's fallback. */
  color: string
}

export type Annotation = TextAnnotation | ImageAnnotation | WhiteoutAnnotation

export function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

/* ---------- Session ---------- */

export interface EditSession {
  bytes: Uint8Array
  /** Characters seen per /BaseFont — the glyphs a subset font must contain. */
  knownChars: Map<string, Set<string>>
  /** Reconstructed backgrounds, keyed by `rectKey(page, rect)`. */
  patches: Map<string, Patch>
  /** Page /Rotate per page number, for orienting background patches. */
  rotation: Map<number, number>
  /** Detected lines per page — erase boxes delete the real glyphs they reach. */
  lines?: Map<number, TextLine[]>
  /** Lazily loaded copy of the source, for single-page previews. */
  sourceDoc?: Promise<PDFDocument>
}

function loadSource(session: EditSession): Promise<PDFDocument> {
  session.sourceDoc ??= PDFDocument.load(session.bytes, { ignoreEncryption: true, updateMetadata: false })
  return session.sourceDoc
}

/* ---------- Helpers ---------- */

function hexToRgb01(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const n = parseInt(full, 16) || 0
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255]
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const commaAt = dataUrl.indexOf(',')
  if (commaAt < 0) throw new Error('Invalid data URL')
  const bin = atob(dataUrl.slice(commaAt + 1))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/**
 * Draw an image that is upright on *screen* (a raster patch) into a user
 * space rect, compensating for the page's /Rotate.
 */
function drawUprightImage(page: PDFPage, img: PDFImage, r: Rect, rotate: number) {
  switch (((rotate % 360) + 360) % 360) {
    case 90:
      page.drawImage(img, { x: r.x + r.width, y: r.y, width: r.height, height: r.width, rotate: degrees(90) })
      break
    case 180:
      page.drawImage(img, { x: r.x + r.width, y: r.y + r.height, width: r.width, height: r.height, rotate: degrees(180) })
      break
    case 270:
      page.drawImage(img, { x: r.x, y: r.y + r.height, width: r.height, height: r.width, rotate: degrees(270) })
      break
    default:
      page.drawImage(img, { x: r.x, y: r.y, width: r.width, height: r.height })
  }
}

/** Ratio between the original's drawn width and its font's nominal width (Tz / Tc). */
function spacingRatio(f: OriginalFont, src: TextSource): number {
  let actual = 0
  let nominal = 0
  for (const s of src.samples) {
    const w = f.widthOfTextAtSize(s.str, src.sampleSize)
    if (w > 0 && s.width > 0) {
      actual += s.width
      nominal += w
    }
  }
  if (nominal <= 0) return 1
  const r = actual / nominal
  return r > 0.6 && r < 1.6 && Math.abs(r - 1) > 0.015 ? r : 1
}

/* ---------- Pipeline ---------- */

export interface BuildOptions {
  /** Only these pages (1-indexed), in a fresh document — for previews. */
  pages?: number[]
  /** Text edits whose new text is left out (their removal still happens). */
  hiddenTextIds?: Set<string>
}

export interface ExportResult {
  bytes: Uint8Array
  warnings: string[]
}

export async function buildEditedPdf(
  session: EditSession,
  annotations: Annotation[],
  opts: BuildOptions = {},
): Promise<ExportResult> {
  const msg = pick(editMessages).warnings
  const warnings: string[] = []

  // 1. Working document and page mapping
  let doc: PDFDocument
  const indexOf = new Map<number, number>()
  if (opts.pages) {
    const src = await loadSource(session)
    doc = await PDFDocument.create()
    const copied = await doc.copyPages(
      src,
      opts.pages.map((p) => p - 1),
    )
    copied.forEach((p, i) => {
      doc.addPage(p)
      indexOf.set(opts.pages![i], i)
    })
  } else {
    doc = await PDFDocument.load(session.bytes, { ignoreEncryption: true, updateMetadata: false })
    doc.getPages().forEach((_, i) => indexOf.set(i + 1, i))
  }
  const anns = annotations.filter((a) => indexOf.has(a.page))
  const texts = anns.filter((a): a is TextAnnotation => a.kind === 'text')

  // 2. Resolve the document's own fonts while the original page is intact
  const originals = new Map<string, OriginalFont>()
  for (const a of texts) {
    if (a.style.family !== 'original' || !a.source?.font) continue
    const base = a.source.font.baseFont
    const f = resolveOriginalFont(doc, indexOf.get(a.page)!, base, session.knownChars.get(base) ?? new Set(), a.text)
    if (f) originals.set(a.id, f)
  }

  // 3. Remove original glyphs
  const covers = new Map<number, { rect: Rect; color: string; patch: boolean }[]>()
  const addCover = (page: number, rect: Rect, color: string, patch: boolean) => {
    const arr = covers.get(page) ?? []
    arr.push({ rect, color, patch })
    covers.set(page, arr)
  }
  for (const a of texts) {
    if (a.source?.alwaysCover) for (const r of a.source.coverRects) addCover(a.page, r, a.source.bg, true)
  }
  const bands = new Map<number, Rect[]>()
  const owner = new Map<Rect, { ann: TextAnnotation; k: number }>()
  for (const a of texts) {
    a.source?.removeRects.forEach((r, k) => {
      const idx = indexOf.get(a.page)!
      bands.set(idx, [...(bands.get(idx) ?? []), r])
      owner.set(r, { ann: a, k })
    })
  }
  // Erase boxes delete whole glyphs of real text they reach into (not just
  // the pixels inside the box), so no half-letters are left at the edges.
  for (const a of anns) {
    if (a.kind !== 'whiteout') continue
    for (const line of session.lines?.get(a.page) ?? []) {
      if (!line.removable) continue
      const band = removalBand(line)
      const x0 = Math.max(band.x, a.x)
      const x1 = Math.min(band.x + band.width, a.x + a.width)
      const y0 = Math.max(band.y, a.y)
      const y1 = Math.min(band.y + band.height, a.y + a.height)
      if (x1 - x0 <= 0.5 || y1 - y0 <= 0) continue
      const idx = indexOf.get(a.page)!
      bands.set(idx, [...(bands.get(idx) ?? []), { x: x0, y: band.y, width: x1 - x0, height: band.height }])
    }
  }
  if (bands.size) {
    const before = doc
    try {
      const { bytes, leftovers } = await removeTextInRects(await doc.save({ useObjectStreams: false }), bands)
      doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
      let copier: PDFObjectCopier | null = null
      for (const [id, f] of originals) {
        if (fontRefStillValid(doc, f.ref, f.baseFont)) continue
        copier ??= PDFObjectCopier.for(before.context, doc.context)
        const copied = copier.copy(before.context.lookup(f.ref)!)
        originals.set(id, { ...f, ref: doc.context.register(copied) as PDFRef })
      }
      for (const [, rects] of leftovers) {
        for (const r of rects) {
          const o = owner.get(r)
          if (o && !o.ann.source!.alwaysCover)
            addCover(o.ann.page, o.ann.source!.coverRects[o.k] ?? r, o.ann.source!.bg, true)
        }
      }
    } catch (e) {
      console.warn('Text removal failed; covering instead', e)
      warnings.push(msg.removalFallback)
      for (const [r, o] of owner) {
        if (!o.ann.source!.alwaysCover) addCover(o.ann.page, o.ann.source!.coverRects[o.k] ?? r, o.ann.source!.bg, true)
      }
    }
  }

  // 4. Draw
  const pages = doc.getPages()
  const bank = new FontBank(doc)
  const imageCache = new Map<string, PDFImage>()
  const embedImage = async (dataUrl: string) => {
    let img = imageCache.get(dataUrl)
    if (!img) {
      const bytes = dataUrlToBytes(dataUrl)
      img = dataUrl.startsWith('data:image/png') ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)
      imageCache.set(dataUrl, img)
    }
    return img
  }

  const byPage = new Map<number, Annotation[]>()
  for (const a of anns) byPage.set(a.page, [...(byPage.get(a.page) ?? []), a])
  for (const p of covers.keys()) if (!byPage.has(p)) byPage.set(p, [])

  for (const [pageNumber, list] of byPage) {
    const page = pages[indexOf.get(pageNumber)!]
    if (!page) continue
    // Isolate the original content so a CTM it leaves behind can't skew ours.
    page.node.wrapContentStreams(
      doc.context.getPushGraphicsStateContentStream(),
      doc.context.getPopGraphicsStateContentStream(),
    )
    const rotate = session.rotation.get(pageNumber) ?? 0

    // Covers: text repaint first, then erase boxes in the user's order
    for (const c of covers.get(pageNumber) ?? []) {
      const patch = c.patch ? session.patches.get(rectKey(pageNumber, c.rect)) : undefined
      if (patch && !patch.uniform && patch.dataUrl) {
        drawUprightImage(page, await embedImage(patch.dataUrl), c.rect, rotate)
      } else {
        const [r, g, b] = hexToRgb01(patch?.color ?? c.color)
        page.drawRectangle({ ...c.rect, color: rgb(r, g, b), borderWidth: 0 })
      }
    }
    for (const a of list) {
      if (a.kind !== 'whiteout') continue
      const rect = { x: a.x, y: a.y, width: a.width, height: a.height }
      const patch = a.fill === 'auto' ? session.patches.get(rectKey(pageNumber, rect)) : undefined
      if (patch && !patch.uniform && patch.dataUrl) {
        drawUprightImage(page, await embedImage(patch.dataUrl), rect, rotate)
      } else {
        const color = a.fill === 'white' ? '#ffffff' : a.fill === 'auto' ? (patch?.color ?? a.color) : a.color
        const [r, g, b] = hexToRgb01(color)
        page.drawRectangle({ ...rect, color: rgb(r, g, b), borderWidth: 0 })
      }
    }

    for (const a of list) {
      if (a.kind !== 'image') continue
      try {
        page.drawImage(await embedImage(a.dataUrl), { x: a.x, y: a.y, width: a.width, height: a.height })
      } catch (e) {
        warnings.push(msg.renderFailed((e as Error).message))
      }
    }

    const fontKeys = new Map<string, PDFName>()
    for (const a of list) {
      if (a.kind !== 'text' || opts.hiddenTextIds?.has(a.id) || !a.text.trim()) continue
      try {
        await drawText(page, a, bank, originals.get(a.id) ?? null, fontKeys, warnings)
      } catch (e) {
        warnings.push(msg.renderFailed((e as Error).message))
      }
    }
  }

  return { bytes: await doc.save(), warnings }
}

async function drawText(
  page: PDFPage,
  a: TextAnnotation,
  bank: FontBank,
  original: OriginalFont | null,
  fontKeys: Map<string, PDFName>,
  warnings: string[],
) {
  const st = a.style
  const src = a.source
  const family: FontFamily = st.family === 'original' ? (src?.font?.family ?? 'sans') : st.family
  const req = {
    family,
    bold: st.bold,
    italic: st.italic,
    korean: prefersPretendard(a.text + (src?.originalText ?? ''), src?.font?.displayName, src?.koreanPage),
  }
  await bank.prepare(req, a.text)
  const fallback = bank.chooser(req)
  const origHandle = original
    ? originalFontHandle(original, st.bold && !src!.font!.bold, st.italic && !src!.font!.italic)
    : null
  const choose = (ch: string): FontHandle | null => (origHandle?.canEncode(ch) ? origHandle : fallback(ch))
  const hScale = st.hScale * (original && src ? spacingRatio(original, src) : 1)

  const result = typeset({
    text: a.text,
    width: a.width,
    wrap: a.wrap,
    align: st.align,
    fontSize: st.fontSize,
    lineHeight: st.lineHeight,
    hScale,
    indent: a.indent,
    fit: a.fit,
    choose,
  })
  if (result.skipped.length) warnings.push(pick(editMessages).warnings.glyphsMissing(result.skipped.join('')))

  const rad = (a.rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const [r, g, b] = hexToRgb01(st.color)
  const ops = [pushGraphicsState(), setFillingRgbColor(r, g, b), setStrokingRgbColor(r, g, b), beginText()]
  ops.push(setCharacterSqueeze(Math.round(result.hScale * 1000) / 10))
  let mode: TextRenderingMode | null = null
  for (const line of result.lines) {
    for (const run of line.runs) {
      const font = run.font
      let key = fontKeys.get(font.id)
      if (!key) {
        key = page.node.newFontDictionary(font.tag, font.ref)
        fontKeys.set(font.id, key)
      }
      const wantMode = font.fakeBold ? TextRenderingMode.FillAndOutline : TextRenderingMode.Fill
      if (wantMode !== mode) {
        ops.push(setTextRenderingMode(wantMode))
        if (font.fakeBold) ops.push(setLineWidth(st.fontSize * 0.035))
        mode = wantMode
      }
      const k = font.fakeItalic ? 0.2126 : 0
      const ox = a.x + run.x * cos + line.dy * sin
      const oy = a.y + run.x * sin - line.dy * cos
      ops.push(setFontAndSize(key, st.fontSize))
      ops.push(setTextMatrix(cos, sin, k * cos - sin, k * sin + cos, ox, oy))
      ops.push(showText(font.encode(run.text)))
    }
  }
  ops.push(endText(), popGraphicsState())
  page.pushOperators(...ops)
}

/* ---------- Public entry points ---------- */

export async function exportEditedPdf(session: EditSession, annotations: Annotation[]): Promise<ExportResult> {
  return buildEditedPdf(session, annotations)
}

/**
 * Render one page with its edits applied, through the real save pipeline.
 * Returns a JPEG data URL at `scale` CSS px per point.
 */
export async function renderEditedPage(
  session: EditSession,
  pageNumber: number,
  annotations: Annotation[],
  scale: number,
  hiddenTextIds?: Set<string>,
): Promise<{ url: string; warnings: string[] }> {
  const { bytes, warnings } = await buildEditedPdf(
    session,
    annotations.filter((a) => a.page === pageNumber),
    { pages: [pageNumber], hiddenTextIds },
  )
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise
  try {
    const page = await pdf.getPage(1)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise
    return { url: canvas.toDataURL('image/jpeg', 0.9), warnings }
  } finally {
    await pdf.destroy()
  }
}
