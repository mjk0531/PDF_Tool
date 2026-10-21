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
import { extractGlyphs, removeTextInRects, type GlyphPos } from './editorRedact'
import { planLineDiff, type DiffPlan } from './editorDiff'
import { typeset } from './editorTypeset'
import { rectKey, type Rect } from './editorGeometry'
import { coverBand, removalBand, type FontFamily, type FontInfo, type TextAlign, type TextLine } from './editorLayout'
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
  /** Main font of the original (for the UI and the fallback family). */
  font: FontInfo | null
  /**
   * Document fonts to draw with, in order: the line's own fonts, then other
   * fonts of the same family on the page (e.g. digits a heading font lacks).
   */
  fonts?: FontInfo[]
  /** Which font drew each character in the original — reused first. */
  charFonts?: Record<string, string>
  /** 장평 detected in the original text matrix. */
  hScale0?: number
  /** Where the edit started — an edit still here can be applied change-only. */
  anchor?: { x: number; y: number; width: number }
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
  /** Free space after the box an unwrapped edit may grow into before condensing, points. */
  room?: number
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

interface ResolvedFont {
  info: FontInfo
  font: OriginalFont
}

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
  const originals = new Map<string, ResolvedFont[]>()
  const resolved = new Map<string, OriginalFont | null>()
  for (const a of texts) {
    if (a.style.family !== 'original' || !a.source?.font) continue
    const idx = indexOf.get(a.page)!
    const list: ResolvedFont[] = []
    for (const info of a.source.fonts?.length ? a.source.fonts : [a.source.font]) {
      const key = `${idx}|${info.baseFont}`
      if (!resolved.has(key))
        resolved.set(key, resolveOriginalFont(doc, idx, info.baseFont, session.knownChars.get(info.baseFont) ?? new Set(), a.text))
      const font = resolved.get(key)
      if (font) list.push({ info, font })
    }
    if (list.length) originals.set(a.id, list)
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
  // 3a. Change-only plans: single-line edits of real text touch just the
  // characters that changed (see editorDiff.ts), pushing the next fields on
  // the row along when the new text needs their space.
  const plans = new Map<string, DiffPlan>()
  const pushed = new Map<string, NeighbourShift[]>()
  const exactColor = new Map<string, [number, number, number]>()
  const layerEdits = texts.filter(
    (a) => a.source?.origin === 'layer' && !a.source.alwaysCover && !opts.hiddenTextIds?.has(a.id),
  )
  const candidates = texts.filter((a) => diffEligible(a, session, opts))
  let workingBytes: Uint8Array | null = null
  if (layerEdits.length) {
    try {
      workingBytes = await doc.save({ useObjectStreams: false })
      const edited = new Set(texts.flatMap((a) => a.source?.lineIds ?? []))
      const rows = new Map<string, { chain: TextLine[]; pushable: number }>()
      for (const a of candidates) {
        const all = session.lines?.get(a.page) ?? []
        rows.set(a.id, rowNeighbours(all.find((l) => l.id === a.source!.lineIds[0]), all, edited))
      }
      const requests = [
        ...layerEdits.map((a) => ({ key: a.id, pageIndex: indexOf.get(a.page)!, box: a.source!.coverRects[0] })),
        ...[...rows.values()].flatMap((r) =>
          r.chain.map((l) => ({ key: `nb:${l.id}`, pageIndex: indexOf.get(l.page)!, box: coverBand(l) })),
        ),
      ]
      const glyphs = await extractGlyphs(workingBytes, requests)

      // Exact colour of untouched-colour edits, from the glyphs themselves.
      for (const a of layerEdits) {
        if (a.style.color.toLowerCase() !== a.source!.detected.color.toLowerCase()) continue
        const c = dominantColor(glyphs.get(a.id) ?? [])
        if (c) exactColor.set(a.id, c)
      }

      const measureBank = new FontBank(await PDFDocument.create())
      for (const a of candidates) {
        const g = glyphs.get(a.id)
        if (!g?.length) continue
        const setup = await fontSetup(a, measureBank, originals.get(a.id) ?? [])
        const size = a.style.fontSize
        const measure = (text: string) => {
          let w = 0
          for (const ch of text) w += (setup.choose(ch)?.widthOf(ch, size) ?? 0) * setup.hScale
          return w
        }
        const maxRight = a.x + a.width + (a.room ?? 0)

        // Following fields on the row that can be moved, with their fonts.
        const row = rows.get(a.id)!
        const shifts: NeighbourShift[] = []
        let pushable = row.pushable
        for (const l of row.chain) {
          const gl = glyphs.get(`nb:${l.id}`) ?? []
          const fonts: ResolvedFont[] = []
          for (const f of l.fonts) {
            const key = `${indexOf.get(l.page)}|${f.info.baseFont}`
            if (!resolved.has(key))
              resolved.set(
                key,
                resolveOriginalFont(doc, indexOf.get(l.page)!, f.info.baseFont, session.knownChars.get(f.info.baseFont) ?? new Set(), l.text),
              )
            const font = resolved.get(key)
            if (font) fonts.push({ info: f.info, font })
          }
          const charFonts: Record<string, string> = {}
          for (const f of l.fonts) for (const ch of f.chars) charFonts[ch] ??= f.info.baseFont
          const shift: NeighbourShift = { key: `nb:${a.id}:${l.id}`, line: l, glyphs: gl, charFonts }
          const pick = plainChooser(fonts, charFonts)
          if (!gl.some((x) => x.c.trim()) || !gl.every((x) => !x.c.trim() || pick(x.c))) {
            pushable = 0
            break
          }
          originals.set(shift.key, fonts)
          shifts.push(shift)
        }

        // With movable fields after it, the line keeps its original gap to
        // them and they move by exactly the growth; otherwise it may first
        // grow into the free space after it.
        const movable = shifts.length > 0 && pushable > 0
        let plan = planLineDiff(
          g,
          a.source!.originalText,
          a.text,
          measure,
          movable ? a.x + a.width : maxRight,
          movable ? pushable : 0,
        )
        // Shifted glyphs must be redrawn in the document's own fonts, or they'd change look.
        if (plan && !plan.suffix.every((gl) => !gl.c.trim() || setup.originalFor(gl.c))) plan = null
        if (!plan) continue
        if (!plan.noop) plan.color = exactColor.get(a.id) ?? colorNear(g, plan.startX)
        plans.set(a.id, plan)
        if (plan.push > 0.05) {
          pushed.set(a.id, shifts)
          for (const s of shifts) plan.removeRects.push(glyphBand(s.glyphs))
        }
      }
    } catch (e) {
      console.warn('Change-only planning failed; rewriting whole lines', e)
      plans.clear()
      pushed.clear()
    }
  }

  const bands = new Map<number, Rect[]>()
  const owner = new Map<Rect, { ann: TextAnnotation; k: number }>()
  for (const a of texts) {
    const idx = indexOf.get(a.page)!
    const plan = plans.get(a.id)
    if (plan) {
      if (plan.removeRects.length) bands.set(idx, [...(bands.get(idx) ?? []), ...plan.removeRects])
      continue
    }
    a.source?.removeRects.forEach((r, k) => {
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
      const { bytes, leftovers } = await removeTextInRects(
        workingBytes ?? (await doc.save({ useObjectStreams: false })),
        bands,
      )
      doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
      let copier: PDFObjectCopier | null = null
      const moved = new Map<OriginalFont, OriginalFont>()
      for (const [id, list] of originals) {
        originals.set(
          id,
          list.map((r) => {
            const f = r.font
            if (fontRefStillValid(doc, f.ref, f.baseFont)) return r
            if (!moved.has(f)) {
              copier ??= PDFObjectCopier.for(before.context, doc.context)
              const copied = copier.copy(before.context.lookup(f.ref)!)
              moved.set(f, { ...f, ref: doc.context.register(copied) as PDFRef })
            }
            return { ...r, font: moved.get(f)! }
          }),
        )
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
        const plan = plans.get(a.id)
        if (plan) {
          if (!plan.noop) {
            const shifts = (pushed.get(a.id) ?? []).map((s) => ({ ...s, fonts: originals.get(s.key) ?? [] }))
            await drawPlan(page, a, plan, bank, originals.get(a.id) ?? [], shifts, fontKeys, warnings)
          }
        } else {
          await drawText(page, a, bank, originals.get(a.id) ?? [], fontKeys, warnings, exactColor.get(a.id))
        }
      } catch (e) {
        warnings.push(msg.renderFailed((e as Error).message))
      }
    }
  }

  return { bytes: await doc.save(), warnings }
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.01

/** A following field on the row, moved right to make space for an edit. */
interface NeighbourShift {
  /** Key of its resolved fonts in the `originals` map. */
  key: string
  line: TextLine
  glyphs: GlyphPos[]
  charFonts: Record<string, string>
}

/**
 * Fields following `line` on its row that belong with it (gaps under 2.5 em —
 * a wider gap is a column boundary and must not move), and the free space
 * after the last of them. Nothing moves if one of them is itself being edited.
 */
function rowNeighbours(line: TextLine | undefined, all: TextLine[], edited: Set<string>) {
  const none = { chain: [] as TextLine[], pushable: 0 }
  if (!line || Math.abs(line.angle) >= 0.5) return none
  const s = line.fontSize
  const row = all
    .filter(
      (o) =>
        o !== line &&
        Math.abs(o.angle) < 0.5 &&
        Math.abs(o.y - line.y) < 0.5 * Math.max(s, o.fontSize) &&
        o.x >= line.x + line.width - 0.5,
    )
    .sort((a, b) => a.x - b.x)
  const chain: TextLine[] = []
  let end = line.x + line.width
  for (const o of row) {
    if (o.x - end > 2.5 * s) break
    if (edited.has(o.id) || !o.removable || o.needsCover || o.origin !== 'layer') return none
    chain.push(o)
    end = o.x + o.width
  }
  if (!chain.length) return none
  return { chain, pushable: Math.max(0, chain[chain.length - 1].room) }
}

/** Chooser over a set of document fonts, preferring the font that drew each character. */
function plainChooser(fonts: ResolvedFont[], charFonts: Record<string, string>) {
  const handles = fonts.map((r) => ({ base: r.info.baseFont, h: originalFontHandle(r.font, false, false) }))
  const byBase = new Map(handles.map((x) => [x.base, x.h]))
  return (ch: string): FontHandle | null => {
    const first = charFonts[ch]
    const pref = first ? byBase.get(first) : undefined
    if (pref?.canEncode(ch)) return pref
    for (const x of handles) if (x.h.canEncode(ch)) return x.h
    return null
  }
}

/** Deletion band covering a run of glyphs (inset so neighbours are spared). */
function glyphBand(gl: GlyphPos[]): Rect {
  const a = gl[0]
  const b = gl[gl.length - 1]
  const x0 = a.x + a.w * 0.15
  const x1 = b.x + b.w * 0.85
  return { x: x0, y: a.y + a.size * 0.18, width: Math.max(0.5, x1 - x0), height: a.size * 0.34 }
}

function colorKey(c: [number, number, number]) {
  return c.map((v) => Math.round(v * 255)).join(',')
}

/** The fill colour most of a line's visible glyphs were drawn in. */
function dominantColor(gl: GlyphPos[]): [number, number, number] | null {
  const counts = new Map<string, { c: [number, number, number]; n: number }>()
  for (const g of gl) {
    if (!g.c.trim()) continue
    const k = colorKey(g.color)
    const cur = counts.get(k)
    if (cur) cur.n++
    else counts.set(k, { c: g.color, n: 1 })
  }
  let best: { c: [number, number, number]; n: number } | null = null
  for (const v of counts.values()) if (!best || v.n > best.n) best = v
  return best?.c ?? null
}

/** Colour of the visible glyph nearest to `x` (where new characters go). */
function colorNear(gl: GlyphPos[], x: number): [number, number, number] | undefined {
  let best: GlyphPos | undefined
  for (const g of gl) if (g.c.trim() && (!best || Math.abs(g.x - x) < Math.abs(best.x - x))) best = g
  return best?.color
}

/**
 * A single-line edit of real text whose style and place are as detected can
 * be applied as a change-only edit.
 */
function diffEligible(a: TextAnnotation, session: EditSession, opts: BuildOptions): boolean {
  const s = a.source
  if (!s || s.origin !== 'layer' || s.alwaysCover || s.lineIds.length !== 1 || !s.anchor) return false
  if (a.wrap || a.text.includes('\n') || a.rotation !== 0 || (session.rotation.get(a.page) ?? 0) !== 0) return false
  if (opts.hiddenTextIds?.has(a.id)) return false
  const st = a.style
  const d = s.detected
  if (st.family !== 'original' || st.align !== 'left') return false
  if (!near(st.fontSize, d.fontSize) || st.color.toLowerCase() !== d.color.toLowerCase()) return false
  if (st.bold !== d.bold || st.italic !== d.italic || !near(st.hScale, d.hScale)) return false
  return near(a.x, s.anchor.x) && near(a.y, s.anchor.y) && near(a.width, s.anchor.width)
}

interface FontSetup {
  choose: (ch: string) => FontHandle | null
  /** The document's own font for `ch`, drawn without synthetic styling. */
  originalFor: (ch: string) => FontHandle | null
  hScale: number
}

async function fontSetup(a: TextAnnotation, bank: FontBank, originals: ResolvedFont[]): Promise<FontSetup> {
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

  // Synthetic bold/italic only when the user asked for a style the original
  // didn't have — never on glyphs that were simply drawn in a sibling font.
  const fakeBold = st.bold && !(src?.detected.bold ?? false)
  const fakeItalic = st.italic && !(src?.detected.italic ?? false)
  const make = (styled: boolean) => {
    const handles = originals.map((r) => ({
      base: r.info.baseFont,
      h: originalFontHandle(r.font, styled && fakeBold && !r.info.bold, styled && fakeItalic && !r.info.italic),
    }))
    const byBase = new Map(handles.map((x) => [x.base, x.h]))
    // The font that drew this character originally, else any document font that has it.
    return (ch: string): FontHandle | null => {
      const first = src?.charFonts?.[ch]
      const pref = first ? byBase.get(first) : undefined
      if (pref?.canEncode(ch)) return pref
      for (const x of handles) if (x.h.canEncode(ch)) return x.h
      return null
    }
  }
  const styledOriginal = make(true)
  const originalFor = make(false)

  // st.hScale carries the 장평; with the original font in hand, its measured
  // letter spacing (Tc) on top of that is reproduced too.
  const main = originals.find((r) => r.info.baseFont === src?.font?.baseFont)
  let tracking = 1
  if (main && src) {
    const t = spacingRatio(main.font, src) / (src.hScale0 || 1)
    if (t > 0.85 && t < 1.2) tracking = t
  }
  return {
    choose: (ch) => styledOriginal(ch) ?? fallback(ch),
    originalFor,
    hScale: st.hScale * tracking,
  }
}

function fontKeyFor(page: PDFPage, font: FontHandle, fontKeys: Map<string, PDFName>): PDFName {
  let key = fontKeys.get(font.id)
  if (!key) {
    key = page.node.newFontDictionary(font.tag, font.ref)
    fontKeys.set(font.id, key)
  }
  return key
}

/** Draw a change-only edit: the new characters, then the shifted tail. */
async function drawPlan(
  page: PDFPage,
  a: TextAnnotation,
  plan: DiffPlan,
  bank: FontBank,
  originals: ResolvedFont[],
  shifts: (NeighbourShift & { fonts: ResolvedFont[] })[],
  fontKeys: Map<string, PDFName>,
  warnings: string[],
) {
  const st = a.style
  const setup = await fontSetup(a, bank, originals)
  const [r, g, b] = plan.color ?? hexToRgb01(st.color)
  const ops = [pushGraphicsState(), setFillingRgbColor(r, g, b), setStrokingRgbColor(r, g, b), beginText()]
  const skipped: string[] = []
  let fill = colorKey([r, g, b])
  /** Original glyphs keep their exact colour. */
  const colorOf = (c: [number, number, number]) => {
    const k = colorKey(c)
    if (k !== fill) {
      ops.push(setFillingRgbColor(c[0], c[1], c[2]))
      fill = k
    }
  }

  const midScale = setup.hScale * plan.squeeze
  ops.push(setCharacterSqueeze(Math.round(midScale * 1000) / 10))
  let x = plan.startX
  let mode: TextRenderingMode | null = null
  for (const ch of plan.middle) {
    const font = setup.choose(ch)
    if (!font) {
      if (ch.trim()) skipped.push(ch)
      continue
    }
    const wantMode = font.fakeBold ? TextRenderingMode.FillAndOutline : TextRenderingMode.Fill
    if (wantMode !== mode) {
      ops.push(setTextRenderingMode(wantMode))
      if (font.fakeBold) ops.push(setLineWidth(st.fontSize * 0.035))
      mode = wantMode
    }
    const k = font.fakeItalic ? 0.2126 : 0
    ops.push(setFontAndSize(fontKeyFor(page, font, fontKeys), st.fontSize))
    ops.push(setTextMatrix(1, 0, k, 1, x, plan.y))
    ops.push(showText(font.encode(ch)))
    x += font.widthOf(ch, st.fontSize) * midScale
  }

  // The tail keeps its original glyphs, spacing and 장평 — only moved.
  if (plan.suffix.length) {
    ops.push(setTextRenderingMode(TextRenderingMode.Fill))
    ops.push(setCharacterSqueeze(Math.round((a.source?.hScale0 || 1) * 1000) / 10))
    for (const gl of plan.suffix) {
      const font = setup.originalFor(gl.c)
      if (!font) continue
      colorOf(gl.color)
      ops.push(setFontAndSize(fontKeyFor(page, font, fontKeys), gl.size))
      ops.push(setTextMatrix(1, 0, 0, 1, gl.x + plan.delta, gl.y))
      ops.push(showText(font.encode(gl.c)))
    }
  }

  // Following fields on the row, moved right as a whole to make space.
  if (plan.push > 0.05) {
    ops.push(setTextRenderingMode(TextRenderingMode.Fill))
    for (const s of shifts) {
      const choose = plainChooser(s.fonts, s.charFonts)
      ops.push(setCharacterSqueeze(Math.round((s.line.hScale || 1) * 1000) / 10))
      for (const gl of s.glyphs) {
        const font = choose(gl.c)
        if (!font) continue
        colorOf(gl.color)
        ops.push(setFontAndSize(fontKeyFor(page, font, fontKeys), gl.size))
        ops.push(setTextMatrix(1, 0, 0, 1, gl.x + plan.push, gl.y))
        ops.push(showText(font.encode(gl.c)))
      }
    }
  }
  ops.push(endText(), popGraphicsState())
  page.pushOperators(...ops)
  if (skipped.length) warnings.push(pick(editMessages).warnings.glyphsMissing([...new Set(skipped)].join('')))
}

async function drawText(
  page: PDFPage,
  a: TextAnnotation,
  bank: FontBank,
  originals: ResolvedFont[],
  fontKeys: Map<string, PDFName>,
  warnings: string[],
  exactColor?: [number, number, number],
) {
  const st = a.style
  const { choose, hScale } = await fontSetup(a, bank, originals)

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
    room: a.room,
    choose,
  })
  if (result.skipped.length) warnings.push(pick(editMessages).warnings.glyphsMissing(result.skipped.join('')))

  const rad = (a.rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const [r, g, b] = exactColor ?? hexToRgb01(st.color)
  const ops = [pushGraphicsState(), setFillingRgbColor(r, g, b), setStrokingRgbColor(r, g, b), beginText()]
  ops.push(setCharacterSqueeze(Math.round(result.hScale * 1000) / 10))
  let mode: TextRenderingMode | null = null
  for (const line of result.lines) {
    for (const run of line.runs) {
      const font = run.font
      const key = fontKeyFor(page, font, fontKeys)
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
