/**
 * Turns the fragments a PDF's text layer (or OCR) yields into the units a
 * person actually wants to edit: lines and paragraphs.
 *
 * pdf.js reports text in arbitrary runs — sometimes a whole line, sometimes a
 * word, sometimes a single glyph, split wherever the font or spacing changed.
 * Fragments are clustered by baseline, joined along it (splitting at gaps
 * wide enough to be a column or table boundary), and consecutive lines with
 * the same size, consistent leading and overlapping extent become paragraphs
 * whose alignment (left / centre / right / justified) and first-line indent
 * are inferred from the line edges.
 */

import { bandRect, type Rect } from './editorGeometry'

export type FontFamily = 'sans' | 'serif' | 'mono'
export type TextAlign = 'left' | 'center' | 'right' | 'justify'

export interface FontInfo {
  /** PDF /BaseFont as pdf.js reports it (may carry a subset tag like ABCDEF+). */
  baseFont: string
  /** Human-readable name: subset tag stripped. */
  displayName: string
  family: FontFamily
  bold: boolean
  italic: boolean
}

export interface TextLine {
  id: string
  page: number
  text: string
  /** Baseline origin of the first glyph, user space. */
  x: number
  y: number
  /** Baseline direction, degrees counter-clockwise in user space. */
  angle: number
  /** Advance width along the baseline, points. */
  width: number
  fontSize: number
  /** Glyph box above / below the baseline, in em (descent is negative). */
  ascent: number
  descent: number
  font: FontInfo | null
  family: FontFamily
  bold: boolean
  italic: boolean
  color: string
  bg: string
  origin: 'layer' | 'ocr'
  /** Glyphs are real text objects that can be deleted from the content stream. */
  removable: boolean
  /** What you see is pixels (scan / OCR'd scan) — the area must be repainted. */
  needsCover: boolean
  /** OCR confidence 0–100. */
  confidence?: number
  /**
   * Horizontal scale: the text matrix's character width (장평) for real text,
   * or what makes the fallback font match the original width for OCR text.
   */
  hScale: number
  paragraphId: string
  /** Raw runs in the line's main font, for measuring the original spacing. */
  samples: { str: string; width: number }[]
  /** Every font the line was drawn with (main font first) and what each drew. */
  fonts: LineFont[]
  /** Free space after the line before the next text on its row (or the text margin), points. */
  room: number
}

export interface LineFont {
  info: FontInfo
  chars: string
}

export interface Paragraph {
  id: string
  page: number
  lineIds: string[]
  /** Left edge of the text box (body lines, not the indented first line). */
  x: number
  width: number
  align: TextAlign
  /** First-line indent relative to `x`, points (may be negative for hanging). */
  indent: number
  /** Baseline-to-baseline distance, points. */
  lineGap: number
}

export interface PageText {
  lines: TextLine[]
  paragraphs: Paragraph[]
}

/* ---------- Font naming ---------- */

export function stripSubsetTag(name: string): string {
  return name.replace(/^[A-Z]{6}\+/, '')
}

const SERIF_RE =
  /(times|serif|roman|georgia|garamond|minion|cambria|book ?antiqua|palatino|batang|myeong|mincho|song|ming|바탕|명조|궁서|gungs|hymj|h2mj|mjre|hcr ?batang|함초롬바탕)/i
const MONO_RE = /(courier|mono|consol|code|d2coding|menlo|fixed)/i
// Also Hangul (HWP) PostScript names: HYwulB, H2gtrB… end in B for bold.
const BOLD_RE = /(bold|black|heavy|semibold|demi|extrabold|ultra|-b$|,b$|\bbd\b|^(hy|h2)[a-z0-9]+b$)/i
const ITALIC_RE = /(italic|oblique|-it$|,it$|-i$)/i

/**
 * Font names arrive as raw bytes; Korean producers (Hangul/HWP) write them in
 * EUC-KR, which reads as mojibake ("ÈÞ¸Õ¸íÁ¶" for 휴먼명조) unless decoded.
 */
export function decodeFontName(name: string): string {
  if (!/[\u0080-ÿ]/.test(name) || /[^\u0000-ÿ]/.test(name)) return name
  try {
    const bytes = Uint8Array.from(name, (c) => c.charCodeAt(0))
    const decoded = new TextDecoder('euc-kr', { fatal: true }).decode(bytes)
    return /[가-힣]/.test(decoded) ? decoded : name
  } catch {
    return name
  }
}

export function describeFont(
  baseFont: string,
  flags: { bold?: boolean; black?: boolean; italic?: boolean; cssFamily?: string },
): FontInfo {
  const displayName = decodeFontName(stripSubsetTag(baseFont || ''))
  const sansHint = /sans/i.test(displayName)
  let family: FontFamily = 'sans'
  if (MONO_RE.test(displayName) || flags.cssFamily === 'monospace') family = 'mono'
  else if ((!sansHint && SERIF_RE.test(displayName)) || flags.cssFamily === 'serif') family = 'serif'
  return {
    baseFont: baseFont || '',
    displayName: displayName || '—',
    family,
    bold: !!flags.bold || !!flags.black || BOLD_RE.test(displayName),
    italic: !!flags.italic || ITALIC_RE.test(displayName),
  }
}

/* ---------- Text-layer grouping ---------- */

export interface RawTextItem {
  str: string
  transform: number[]
  width: number
  fontName: string
}

export interface FontLookupResult {
  info: FontInfo | null
  ascent: number
  descent: number
  vertical: boolean
}

interface Frag {
  str: string
  x: number
  y: number
  along: number
  across: number
  width: number
  size: number
  /** Character width relative to height (장평 / Tz), from the text matrix. */
  hs: number
  angle: number
  fontName: string
}

const isCJK = (ch: string) => /[぀-ヿ㐀-鿿豈-﫿]/.test(ch)

/** Join raw strings into a line, inserting spaces where gaps imply them. */
function joinFrags(frags: Frag[]): string {
  let out = ''
  let prevEnd = 0
  for (let i = 0; i < frags.length; i++) {
    const f = frags[i]
    if (i > 0) {
      const gap = f.along - prevEnd
      const needsSpace =
        gap > f.size * 0.15 && !/\s$/.test(out) && !/^\s/.test(f.str) && !(isCJK(out.slice(-1)) && isCJK(f.str[0] ?? ''))
      if (needsSpace) out += ' '
    }
    out += f.str
    prevEnd = Math.max(prevEnd, f.along + f.width)
  }
  return out.replace(/\s+/g, ' ').trim()
}

function sanitizeMetric(v: number | undefined, fallback: number, lo: number, hi: number) {
  return typeof v === 'number' && isFinite(v) && v >= lo && v <= hi ? v : fallback
}

/** Group pdf.js text items of one page into lines. */
export function buildLayerLines(
  items: RawTextItem[],
  page: number,
  lookup: (fontName: string) => FontLookupResult,
): TextLine[] {
  const frags: Frag[] = []
  for (const it of items) {
    if (!it.str) continue
    const t = it.transform
    const meta = lookup(it.fontName)
    if (meta.vertical) continue
    const size = Math.hypot(t[2], t[3]) || Math.hypot(t[0], t[1])
    if (!(size > 0.5)) continue
    const rad = Math.atan2(t[1], t[0])
    const angle = (rad * 180) / Math.PI
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    frags.push({
      str: it.str,
      x: t[4],
      y: t[5],
      along: t[4] * cos + t[5] * sin,
      across: -t[4] * sin + t[5] * cos,
      width: it.width,
      size,
      hs: Math.hypot(t[0], t[1]) / size,
      angle: Math.round(angle * 2) / 2,
      fontName: it.fontName,
    })
  }

  // Bucket by direction, then cluster baselines, then split at wide gaps.
  const byAngle = new Map<number, Frag[]>()
  for (const f of frags) {
    const arr = byAngle.get(f.angle) ?? []
    arr.push(f)
    byAngle.set(f.angle, arr)
  }

  const lines: TextLine[] = []
  for (const [, group] of byAngle) {
    group.sort((a, b) => b.across - a.across || a.along - b.along)
    const clusters: Frag[][] = []
    let current: Frag[] = []
    let clusterAcross = 0
    for (const f of group) {
      if (current.length && Math.abs(f.across - clusterAcross) <= 0.3 * Math.min(f.size, current[0].size)) {
        current.push(f)
        clusterAcross = (clusterAcross * (current.length - 1) + f.across) / current.length
      } else {
        if (current.length) clusters.push(current)
        current = [f]
        clusterAcross = f.across
      }
    }
    if (current.length) clusters.push(current)

    for (const cluster of clusters) {
      cluster.sort((a, b) => a.along - b.along)
      let run: Frag[] = []
      let runEnd = -Infinity
      let lastSolid: Frag | null = null
      const flush = () => {
        const line = makeLayerLine(run, page, lines.length, lookup)
        if (line) lines.push(line)
        run = []
        runEnd = -Infinity
        lastSolid = null
      }
      for (const f of cluster) {
        const blank = !f.str.trim()
        if (blank && run.length === 0) continue
        if (!blank && lastSolid) {
          // Same string drawn twice a hair apart = faux bold; keep one.
          if (f.str === lastSolid.str && Math.abs(f.along - lastSolid.along) < f.size * 0.1) continue
          // Column / cell boundary. Word gaps — even letter-spaced labels
          // like "상   호" that Hangul spreads across a cell — stay below 1.25 em.
          const gap = f.along - runEnd
          const size = Math.max(f.size, lastSolid.size)
          if (gap > size * 1.25 || gap < -size * 2) flush()
        }
        run.push(f)
        if (!blank) {
          runEnd = Math.max(runEnd, f.along + f.width)
          lastSolid = f
        }
      }
      if (run.length) flush()
    }
  }
  return lines
}

function makeLayerLine(
  run: Frag[],
  page: number,
  index: number,
  lookup: (fontName: string) => FontLookupResult,
): TextLine | null {
  const solid = run.filter((f) => f.str.trim())
  if (!solid.length) return null
  const text = joinFrags(run)
  if (!text) return null
  const first = solid[0]
  const startAlong = first.along
  const endAlong = Math.max(...solid.map((f) => f.along + f.width))

  // Dominant font by letters drawn (bullets and colons in a symbol font don't count)
  const weight = new Map<string, number>()
  for (const f of solid) {
    const letters = (f.str.match(/[\p{L}\p{N}]/gu) ?? []).length
    weight.set(f.fontName, (weight.get(f.fontName) ?? 0) + letters + f.str.length * 0.01)
  }
  const byWeight = [...weight.entries()].sort((a, b) => b[1] - a[1])
  const fontName = byWeight[0][0]
  const main = solid.filter((f) => f.fontName === fontName)
  const fontSize = Math.max(...main.map((f) => f.size))
  const meta = lookup(fontName)
  const info = meta.info

  // 장평: character width from the text matrix, weighted by text length.
  const hsTotal = main.reduce((s, f) => s + f.hs * f.str.length, 0) / main.reduce((s, f) => s + f.str.length, 0)
  const hScale = Math.abs(hsTotal - 1) < 0.01 || !isFinite(hsTotal) ? 1 : Math.round(hsTotal * 1000) / 1000

  const fonts: LineFont[] = []
  for (const [name] of byWeight) {
    const fi = lookup(name).info
    if (!fi) continue
    const chars = solid.filter((f) => f.fontName === name).map((f) => f.str).join('')
    const same = fonts.find((x) => x.info.baseFont === fi.baseFont)
    if (same) same.chars += chars
    else fonts.push({ info: fi, chars })
  }

  return {
    id: `L${page}-${index}`,
    page,
    text,
    x: first.x,
    y: first.y,
    angle: first.angle,
    width: endAlong - startAlong,
    fontSize,
    ascent: sanitizeMetric(meta.ascent, 0.8, 0.4, 1.4),
    descent: sanitizeMetric(meta.descent, -0.2, -0.6, -0.02),
    font: info,
    family: info?.family ?? 'sans',
    bold: info?.bold ?? false,
    italic: info?.italic ?? false,
    color: '#000000',
    bg: '#ffffff',
    origin: 'layer',
    removable: true,
    needsCover: false,
    hScale,
    paragraphId: '',
    samples: main.map((f) => ({ str: f.str, width: f.width })),
    fonts,
    room: 0,
  }
}

/* ---------- Paragraphs ---------- */

/** Text of a paragraph's lines as one flowing string. */
export function joinLines(texts: string[]): string {
  let out = ''
  for (const t of texts) {
    if (!out) {
      out = t
      continue
    }
    const prev = out.slice(-1)
    if (prev === '-' && /^[a-z]/.test(t)) out = out.slice(0, -1) + t
    else if (isCJK(prev) && isCJK(t[0] ?? '')) out += t
    else out += ' ' + t
  }
  return out
}

/** Glyph box of a line (user space). */
export function lineBox(l: TextLine): Rect {
  return bandRect(l.x, l.y, l.angle, l.width, l.descent * l.fontSize, l.ascent * l.fontSize)
}

/**
 * The band deleted from the content stream when a text-layer line is edited:
 * the middle of the line's glyph boxes, so neighbours above and below — whose
 * boxes may touch this line's — are never caught.
 */
export function removalBand(l: TextLine): Rect {
  const s = l.fontSize
  const inset = l.width > s * 0.5 ? s * 0.08 : 0
  return bandRect(
    l.x + Math.cos((l.angle * Math.PI) / 180) * inset,
    l.y + Math.sin((l.angle * Math.PI) / 180) * inset,
    l.angle,
    Math.max(0.5, l.width - inset * 2),
    s * 0.18,
    s * 0.52,
  )
}

/** Area painted over when the original glyphs are pixels (scan / OCR). */
export function coverBand(l: TextLine): Rect {
  const s = l.fontSize
  const pad = s * 0.12
  const rad = (l.angle * Math.PI) / 180
  return bandRect(
    l.x - Math.cos(rad) * pad,
    l.y - Math.sin(rad) * pad,
    l.angle,
    l.width + pad * 2,
    l.descent * s - pad,
    l.ascent * s + pad,
  )
}

interface ParaDraft {
  lines: TextLine[]
  gap: number
}

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol

/** Group a page's lines into paragraphs and infer their layout. */
export function buildParagraphs(lines: TextLine[], page: number, view: number[]): Paragraph[] {
  const flat = lines.filter((l) => Math.abs(l.angle) < 0.5)
  const other = lines.filter((l) => Math.abs(l.angle) >= 0.5)
  flat.sort((a, b) => b.y - a.y || a.x - b.x)

  const drafts: ParaDraft[] = []
  for (const line of flat) {
    const s = line.fontSize
    let best: ParaDraft | null = null
    let bestGap = Infinity
    for (const p of drafts) {
      const L = p.lines[p.lines.length - 1]
      if (Math.abs(L.fontSize - s) > 0.12 * Math.max(L.fontSize, s)) continue
      if (L.bold !== line.bold || L.origin !== line.origin) continue
      const g = L.y - line.y
      if (g < 0.9 * s || g > 2.3 * s) continue
      if (p.lines.length >= 2 && Math.abs(g - p.gap) > 0.2 * s) continue
      const lx0 = L.x
      const lx1 = L.x + L.width
      const x0 = line.x
      const x1 = line.x + line.width
      if (Math.min(lx1, x1) - Math.max(lx0, x0) <= 0) continue
      const body = p.lines.length > 1 ? Math.min(...p.lines.slice(1).map((l) => l.x)) : lx0
      const leftOk = near(x0, body, 1.5 * s) || (p.lines.length === 1 && near(x0, lx0, 3 * s) && x0 <= lx0 + 0.2 * s)
      const centerOk = near((x0 + x1) / 2, (lx0 + lx1) / 2, 1.0 * s)
      const rightOk = near(x1, lx1, 1.0 * s)
      if (!leftOk && !centerOk && !rightOk) continue
      // A short line ends a left-aligned paragraph
      if (p.lines.length >= 2 && leftOk && !rightOk && !centerOk) {
        const maxW = Math.max(...p.lines.map((l) => l.x + l.width)) - body
        if (lx1 - body < 0.6 * maxW) continue
      }
      if (g < bestGap) {
        best = p
        bestGap = g
      }
    }
    if (best) {
      if (best.lines.length === 1) best.gap = bestGap
      best.lines.push(line)
    } else {
      drafts.push({ lines: [line], gap: s * 1.2 })
    }
  }
  for (const l of other) drafts.push({ lines: [l], gap: l.fontSize * 1.2 })

  const hints = pageHints(lines, view)
  return drafts.map((d, i) => {
    const id = `P${page}-${i}`
    for (const l of d.lines) l.paragraphId = id
    return finishParagraph(id, page, d.lines, d.gap, hints)
  })
}

export interface PageHints {
  leftMargin: number
  rightMargin: number
  pageCenter: number
  pageWidth: number
  /** Lines with nothing else on their row — the only ones whose alignment can be guessed. */
  alone: Set<string>
}

/**
 * Row structure of a page: which lines share a baseline with other text
 * (table rows, label/value pairs) and how much free space follows each line
 * before the next text on its row — an edit may grow into that space.
 * Sets `room` on every line.
 */
export function pageHints(lines: TextLine[], view: number[]): PageHints {
  const flat = lines.filter((l) => Math.abs(l.angle) < 0.5)
  const lefts = flat.map((l) => l.x).sort((a, b) => a - b)
  const rightsSorted = flat.map((l) => l.x + l.width).sort((a, b) => a - b)
  const leftMargin = lefts.length ? lefts[Math.floor(lefts.length * 0.1)] : view[0]
  const rightMargin = rightsSorted.length ? rightsSorted[Math.floor(rightsSorted.length * 0.9)] : view[2]
  const textRight = rightsSorted.length ? rightsSorted[rightsSorted.length - 1] : view[2]
  const alone = new Set<string>()
  for (const l of lines) l.room = 0
  for (const l of flat) {
    const s = l.fontSize
    const end = l.x + l.width
    const row = flat.filter((o) => o !== l && Math.abs(o.y - l.y) < 0.6 * Math.max(s, o.fontSize))
    if (!row.length) alone.add(l.id)
    const next = row.filter((o) => o.x >= end - 0.5).map((o) => o.x)
    const limit = next.length ? Math.min(...next) - 0.5 * s : textRight
    l.room = Math.max(0, limit - end)
  }
  return {
    leftMargin,
    rightMargin,
    pageCenter: (view[0] + view[2]) / 2,
    pageWidth: Math.abs(view[2] - view[0]),
    alone,
  }
}

export function finishParagraph(id: string, page: number, lines: TextLine[], gap: number, pageHints: PageHints): Paragraph {
  const s = lines[0].fontSize
  const lefts = lines.map((l) => l.x)
  const rights = lines.map((l) => l.x + l.width)
  const centers = lines.map((_, k) => (lefts[k] + rights[k]) / 2)
  const tol = 0.6 * s
  let align: TextAlign = 'left'
  let indent = 0
  let x = Math.min(...lefts)

  if (lines.length === 1) {
    // A lone line's alignment is a guess; only guess for text alone on its
    // row (titles, dates). Inside table rows a wrong "centre" makes edits jump.
    const l = lines[0]
    const c = centers[0]
    const offLeft = l.x - pageHints.leftMargin > 3 * s
    const alone = pageHints.alone.has(l.id) && Math.abs(l.angle) < 0.5
    if (alone && offLeft && Math.abs(c - pageHints.pageCenter) < 0.025 * pageHints.pageWidth) align = 'center'
    else if (alone && offLeft && Math.abs(rights[0] - pageHints.rightMargin) < 0.5 * s) align = 'right'
    x = l.x
  } else {
    const body = lefts.slice(1)
    const bodyLeft = Math.min(...body)
    const leftAligned = body.every((v) => near(v, bodyLeft, tol))
    const rightsButLast = rights.slice(0, -1)
    const maxRight = Math.max(...rights)
    const rightAligned = rightsButLast.every((v) => near(v, maxRight, tol))
    const centerAligned = centers.every((v) => near(v, centers[0], tol))
    if (leftAligned && rightAligned && lines.length >= 3) align = 'justify'
    else if (leftAligned && near(lefts[0], bodyLeft, tol)) align = 'left'
    else if (centerAligned) align = 'center'
    else if (rights.every((v) => near(v, maxRight, tol))) align = 'right'
    else align = 'left'
    if (align === 'left' || align === 'justify') {
      x = bodyLeft
      indent = lefts[0] - bodyLeft
      if (Math.abs(indent) < 0.4 * s) indent = 0
    }
  }
  const width = Math.max(...rights) - x
  return { id, page, lineIds: lines.map((l) => l.id), x, width, align, indent, lineGap: gap }
}
