/**
 * Building edits from detected text, and document-wide find & replace.
 */

import {
  coverBand,
  joinLines,
  removalBand,
  type PageText,
  type Paragraph,
  type TextLine,
} from './editorLayout'
import { genId, type Annotation, type TextAnnotation, type TextStyle } from './editor'

export type EditUnit = 'line' | 'paragraph'

/** Whether most of a page's text is Hangul. */
export function isKoreanPage(pt: PageText | undefined): boolean {
  if (!pt) return false
  let letters = 0
  let hangul = 0
  for (const l of pt.lines) {
    letters += (l.text.match(/[\p{L}\p{N}]/gu) ?? []).length
    hangul += (l.text.match(/[가-힣]/g) ?? []).length
  }
  return letters > 0 && hangul / letters > 0.25
}

/** An edit that replaces `lines` (one line, or a whole paragraph). */
export function editFromLines(
  lines: TextLine[],
  para: Paragraph | null,
  unit: EditUnit,
  koreanPage = false,
): TextAnnotation {
  const first = lines[0]
  const multi = unit === 'paragraph' && lines.length > 1 && para
  const paraIsMulti = !!para && para.lineIds.length > 1
  const align = multi
    ? para!.align
    : para && !paraIsMulti
      ? para.align
      : para?.align === 'center'
        ? 'center'
        : 'left'
  const style: TextStyle = {
    fontSize: first.fontSize,
    color: first.color,
    bold: first.bold,
    italic: first.italic,
    family: first.font ? 'original' : first.family,
    align: align === 'justify' && !multi ? 'left' : align,
    lineHeight: para && paraIsMulti ? Math.round((para.lineGap / first.fontSize) * 100) / 100 : 1.2,
    hScale: first.needsCover ? first.hScale : 1,
  }
  return {
    id: genId(),
    page: first.page,
    kind: 'text',
    x: multi ? para!.x : first.x,
    y: first.y,
    width: multi ? para!.width + first.fontSize * 0.05 : first.width,
    rotation: first.angle,
    text: multi ? joinLines(lines.map((l) => l.text)) : first.text,
    style,
    wrap: !!multi,
    fit: multi ? 'none' : 'shrink',
    indent: multi ? para!.indent : 0,
    source: {
      origin: first.origin,
      lineIds: lines.map((l) => l.id),
      originalText: lines.map((l) => l.text).join('\n'),
      removeRects: lines.filter((l) => l.removable).map(removalBand),
      coverRects: lines.map(coverBand),
      alwaysCover: lines.some((l) => l.needsCover),
      bg: first.bg,
      font: first.font,
      koreanPage,
      samples: first.samples,
      sampleSize: first.fontSize,
      detected: { ...style },
    },
  }
}

/** Lines a click on `lineId` should edit, honouring the edit unit. */
export function linesForClick(
  text: PageText,
  lineId: string,
  unit: EditUnit,
): { lines: TextLine[]; para: Paragraph | null } | null {
  const line = text.lines.find((l) => l.id === lineId)
  if (!line) return null
  const para = text.paragraphs.find((p) => p.id === line.paragraphId) ?? null
  if (unit === 'paragraph' && para) {
    const lines = para.lineIds.map((id) => text.lines.find((l) => l.id === id)).filter((l): l is TextLine => !!l)
    return { lines, para }
  }
  return { lines: [line], para }
}

/** Line ids already replaced by an edit. */
export function editedLineIds(annotations: Annotation[]): Set<string> {
  const ids = new Set<string>()
  for (const a of annotations) if (a.kind === 'text') a.source?.lineIds.forEach((id) => ids.add(id))
  return ids
}

/* ---------- Find & replace ---------- */

export interface FindHit {
  page: number
  /** An edit's id, or an untouched line's id. */
  targetId: string
  kind: 'edit' | 'line'
  text: string
  count: number
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function makeMatcher(query: string, caseSensitive: boolean): RegExp | null {
  if (!query) return null
  return new RegExp(escapeRegExp(query), caseSensitive ? 'g' : 'gi')
}

export function findHits(
  pageTexts: Map<number, PageText>,
  annotations: Annotation[],
  matcher: RegExp | null,
): FindHit[] {
  if (!matcher) return []
  const hits: FindHit[] = []
  const count = (t: string) => (t.match(matcher) ?? []).length
  const edited = editedLineIds(annotations)
  for (const a of annotations) {
    if (a.kind !== 'text') continue
    const n = count(a.text)
    if (n) hits.push({ page: a.page, targetId: a.id, kind: 'edit', text: a.text, count: n })
  }
  for (const [page, pt] of pageTexts) {
    for (const l of pt.lines) {
      if (edited.has(l.id)) continue
      const n = count(l.text)
      if (n) hits.push({ page, targetId: l.id, kind: 'line', text: l.text, count: n })
    }
  }
  return hits.sort((a, b) => a.page - b.page)
}

/** Apply a replacement to every hit; untouched lines become line edits. */
export function replaceAll(
  pageTexts: Map<number, PageText>,
  annotations: Annotation[],
  matcher: RegExp,
  replacement: string,
): { next: Annotation[]; replaced: number } {
  let replaced = 0
  const hits = findHits(pageTexts, annotations, matcher)
  const editIds = new Set(hits.filter((h) => h.kind === 'edit').map((h) => h.targetId))
  const next: Annotation[] = annotations.map((a) => {
    if (a.kind !== 'text' || !editIds.has(a.id)) return a
    replaced += (a.text.match(matcher) ?? []).length
    return { ...a, text: a.text.replace(matcher, () => replacement) }
  })
  for (const h of hits) {
    if (h.kind !== 'line') continue
    const pt = pageTexts.get(h.page)!
    const picked = linesForClick(pt, h.targetId, 'line')
    if (!picked) continue
    const ann = editFromLines(picked.lines, picked.para, 'line', isKoreanPage(pt))
    replaced += h.count
    next.push({ ...ann, text: ann.text.replace(matcher, () => replacement) })
  }
  return { next, replaced }
}
