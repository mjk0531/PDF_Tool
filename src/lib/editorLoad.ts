/**
 * Opening a PDF for editing: render each page, read its text layer, decide
 * what kind of page it is, and measure what a natural edit needs.
 *
 * Page kinds:
 *  - text      real, visible text objects — edits delete and redraw glyphs;
 *  - scan      no text at all (scans, outlined text) — OCR runs automatically;
 *  - ocr-layer a scan with an invisible OCR text layer on top — the layer
 *              gives the words, but what you see is pixels, so edits repaint;
 *  - mixed     visible text plus images — OCR for text inside the images is
 *              offered, not forced.
 */

import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { pdfjsLib } from './pdfWorker'
import { makeViewport, rectKey, rectToBox, type PageGeom, type Rect } from './editorGeometry'
import { analyzeRegion, inpaint, rasterFromCanvas, rgbToHex, strokeWidth, type Patch, type Raster } from './editorPixels'
import {
  buildLayerLines,
  buildParagraphs,
  describeFont,
  lineBox,
  type FontLookupResult,
  type PageText,
  type RawTextItem,
} from './editorLayout'
import { decideWeights, inkMetrics, lineWeights, renderPageRaster } from './editorOcr'
import { hasHangulOrCJK } from './editorFonts'

export type PageKind = 'text' | 'scan' | 'ocr-layer' | 'mixed' | 'blank'

export interface PageInfo {
  number: number
  geom: PageGeom
  /** Displayed size in points (after /Rotate). */
  width: number
  height: number
  /** The untouched page, rendered. */
  bgUrl: string
  kind: PageKind
}

interface PdfJsFont {
  name?: string
  bold?: boolean
  black?: boolean
  italic?: boolean
  ascent?: number
  descent?: number
}

interface PageOps {
  images: number
  visibleText: number
  invisibleText: number
  total: number
}

async function scanOperators(page: PDFPageProxy): Promise<PageOps> {
  const OPS = pdfjsLib.OPS
  const imageOps = new Set<number>([
    OPS.paintImageXObject,
    OPS.paintInlineImageXObject,
    OPS.paintImageMaskXObject,
    OPS.paintImageXObjectRepeat,
    OPS.paintImageMaskXObjectRepeat,
    OPS.paintImageMaskXObjectGroup,
    OPS.paintInlineImageXObjectGroup,
  ])
  const textOps = new Set<number>([OPS.showText, OPS.showSpacedText, OPS.nextLineShowText, OPS.nextLineSetSpacingShowText])
  const result: PageOps = { images: 0, visibleText: 0, invisibleText: 0, total: 0 }
  try {
    const list = await page.getOperatorList()
    result.total = list.fnArray.length
    let mode = 0
    const stack: number[] = []
    list.fnArray.forEach((fn, i) => {
      if (fn === OPS.save) stack.push(mode)
      else if (fn === OPS.restore) mode = stack.pop() ?? 0
      else if (fn === OPS.setTextRenderingMode) mode = Number(list.argsArray[i]?.[0] ?? 0)
      else if (textOps.has(fn)) {
        if (mode === 3 || mode === 7) result.invisibleText++
        else result.visibleText++
      } else if (imageOps.has(fn)) result.images++
    })
  } catch {
    /* classification falls back to the text layer alone */
  }
  return result
}

export interface LoadedPage {
  info: PageInfo
  text: PageText
}

/**
 * Load one page. `knownChars` collects, per /BaseFont, every character the
 * text layer draws — later used to tell which glyphs a subset font contains.
 */
export async function loadPage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  renderScale: number,
  knownChars: Map<string, Set<string>>,
): Promise<LoadedPage> {
  const page = await pdf.getPage(pageNumber)
  const geom: PageGeom = {
    view: page.view.slice(0, 4) as [number, number, number, number],
    rotate: page.rotate,
  }
  const base = makeViewport(geom, 1)
  const vp = makeViewport(geom, renderScale)

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(vp.width)
  canvas.height = Math.ceil(vp.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale: renderScale }) }).promise

  const content = await page.getTextContent()
  const ops = await scanOperators(page)
  const styles = content.styles as Record<string, { fontFamily?: string; ascent?: number; descent?: number; vertical?: boolean }>

  const lookupCache = new Map<string, FontLookupResult>()
  const lookup = (fontName: string): FontLookupResult => {
    const hit = lookupCache.get(fontName)
    if (hit) return hit
    const style = styles[fontName] ?? {}
    let font: PdfJsFont | null = null
    try {
      if (page.commonObjs.has(fontName)) font = page.commonObjs.get(fontName) as PdfJsFont
    } catch {
      font = null
    }
    const res: FontLookupResult = {
      info: font?.name
        ? describeFont(font.name, { bold: font.bold, black: font.black, italic: font.italic, cssFamily: style.fontFamily })
        : null,
      ascent: font?.ascent ?? style.ascent ?? 0.8,
      descent: font?.descent ?? style.descent ?? -0.2,
      vertical: !!style.vertical,
    }
    lookupCache.set(fontName, res)
    return res
  }

  const items = (content.items as Array<RawTextItem & { str?: string }>).filter((it) => typeof it.str === 'string')
  for (const it of items) {
    const name = lookup(it.fontName).info?.baseFont
    if (!name) continue
    const set = knownChars.get(name) ?? new Set<string>()
    for (const ch of it.str) set.add(ch)
    knownChars.set(name, set)
  }

  const lines = buildLayerLines(items, pageNumber, lookup)
  const visibleChars = lines.reduce((n, l) => n + l.text.length, 0)
  let kind: PageKind
  if (visibleChars === 0) kind = ops.total > 4 ? 'scan' : 'blank'
  else if (ops.invisibleText > 0 && ops.invisibleText >= ops.visibleText * 4) kind = 'ocr-layer'
  else if (ops.images > 0) kind = 'mixed'
  else kind = 'text'

  // Colours (and, for invisible layers, weight and width) from the pixels.
  const raster = rasterFromCanvas(canvas)
  for (const line of lines) {
    const box = rectToBox(vp.transform, lineBox(line))
    const stats = analyzeRegion(raster, box, Math.max(2, line.fontSize * renderScale * 0.35))
    line.bg = rgbToHex(stats.bg)
    if (stats.ink) line.color = rgbToHex(stats.ink)
    if (kind === 'ocr-layer') {
      line.removable = true
      line.needsCover = true
      // The invisible layer's font (often GlyphLessFont) is never drawn with.
      line.font = null
      line.fonts = []
      line.family = 'sans'
      const ascentPx = line.ascent * line.fontSize * renderScale
      if (stats.ink && ascentPx > 0) lineWeights.set(line, strokeWidth(raster, box, stats.bg, stats.ink) / ascentPx)
      const m = await inkMetrics(line.text, hasHangulOrCJK(line.text))
      const ratio = m.advance > 0 ? line.width / (m.advance * line.fontSize) : 1
      line.hScale = ratio > 0.75 && ratio < 1.3 ? Math.round(ratio * 100) / 100 : 1
    }
  }
  if (kind === 'ocr-layer') decideWeights(lines)
  const paragraphs = buildParagraphs(lines, pageNumber, geom.view)

  const bgUrl = canvas.toDataURL('image/jpeg', 0.88)
  page.cleanup()
  return {
    info: { number: pageNumber, geom, width: base.width, height: base.height, bgUrl, kind },
    text: { lines, paragraphs },
  }
}

/* ---------- Background patches ---------- */

const PATCH_SCALE = 200 / 72

/**
 * Builds reconstructed-background patches for cover rects, rendering each
 * page once (the two most recent rasters are kept).
 */
export class PatchMaker {
  private rasters = new Map<number, Promise<{ raster: Raster; transform: ReturnType<typeof makeViewport>['transform'] }>>()

  constructor(
    private pdf: PDFDocumentProxy,
    private geoms: Map<number, PageGeom>,
    private store: Map<string, Patch>,
  ) {}

  private raster(page: number) {
    let hit = this.rasters.get(page)
    if (!hit) {
      const geom = this.geoms.get(page)!
      hit = renderPageRaster(this.pdf, page, PATCH_SCALE).then(({ raster }) => ({
        raster,
        transform: makeViewport(geom, PATCH_SCALE).transform,
      }))
      this.rasters.set(page, hit)
      if (this.rasters.size > 2) this.rasters.delete(this.rasters.keys().next().value!)
    }
    return hit
  }

  /** Ensure a patch exists for each rect; returns the keys that were added. */
  async make(page: number, rects: Rect[]): Promise<string[]> {
    const todo = rects.filter((r) => !this.store.has(rectKey(page, r)))
    if (!todo.length) return []
    const { raster, transform } = await this.raster(page)
    const added: string[] = []
    for (const r of todo) {
      const box = rectToBox(transform, r)
      const pad = Math.max(3, Math.min(box.width, box.height) * 0.25)
      const stats = analyzeRegion(raster, box, pad)
      const key = rectKey(page, r)
      this.store.set(key, inpaint(raster, box, stats))
      added.push(key)
    }
    return added
  }
}
