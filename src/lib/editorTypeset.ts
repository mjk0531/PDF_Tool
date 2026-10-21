/**
 * Line breaking and alignment for edited text.
 *
 * Breaks at spaces (Korean keeps whole eojeol together, like the original
 * typesetting would), between any two CJK ideographs/kana, and inside a word
 * only when the word alone is wider than the box. Alignment covers left,
 * centre, right and justified (extra space spread over the gaps of every line
 * but a paragraph's last), plus a first-line indent. Single-line edits can be
 * condensed slightly to keep fitting the space the original occupied.
 */

import type { TextAlign } from './editorLayout'

export interface TypesetFont {
  id: string
  widthOf(text: string, size: number): number
}

export interface PlacedRun<F> {
  text: string
  font: F
  /** Offset from the box's left edge along the baseline, points. */
  x: number
}

export interface PlacedLine<F> {
  runs: PlacedRun<F>[]
  width: number
  /** Distance below the first baseline, points. */
  dy: number
}

export interface TypesetOptions<F> {
  text: string
  width: number
  wrap: boolean
  align: TextAlign
  fontSize: number
  lineHeight: number
  hScale: number
  indent: number
  /**
   * 'shrink' keeps a single-line edit inside its slot: it may first grow into
   * `room` (free space after a left-aligned box), then condenses — down to
   * 80% — and only then overflows.
   */
  fit: 'none' | 'shrink'
  room?: number
  choose: (ch: string) => F | null
}

export interface TypesetResult<F> {
  lines: PlacedLine<F>[]
  hScale: number
  /** Characters no font could draw. */
  skipped: string[]
}

const BREAK_EVERYWHERE = /[぀-ヿ㐀-鿿豈-﫿　-〿＀-￯]/

interface Token {
  text: string
  space: boolean
}

function tokenize(paragraph: string): Token[] {
  const tokens: Token[] = []
  for (const part of paragraph.split(/(\s+)/)) {
    if (!part) continue
    if (/^\s+$/.test(part)) {
      tokens.push({ text: part, space: true })
      continue
    }
    let buf = ''
    for (const ch of part) {
      if (BREAK_EVERYWHERE.test(ch)) {
        if (buf) tokens.push({ text: buf, space: false })
        tokens.push({ text: ch, space: false })
        buf = ''
      } else buf += ch
    }
    if (buf) tokens.push({ text: buf, space: false })
  }
  return tokens
}

export function typeset<F extends TypesetFont>(opts: TypesetOptions<F>): TypesetResult<F> {
  const size = opts.fontSize
  const skipped: string[] = []
  const fontCache = new Map<string, F | null>()
  const fontOf = (ch: string) => {
    if (!fontCache.has(ch)) {
      const f = opts.choose(ch)
      fontCache.set(ch, f)
      if (!f && ch.trim()) skipped.push(ch)
    }
    return fontCache.get(ch)!
  }
  const rawWidth = (text: string) => {
    let w = 0
    let chunk = ''
    let chunkFont: F | null = null
    const flush = () => {
      if (chunk && chunkFont) w += chunkFont.widthOf(chunk, size)
      chunk = ''
    }
    for (const ch of text) {
      const f = fontOf(ch)
      if (f !== chunkFont) {
        flush()
        chunkFont = f
      }
      chunk += ch
    }
    flush()
    return w
  }

  // 1. Break into lines of tokens (unscaled widths).
  interface RawLine {
    tokens: Token[]
    last: boolean
    first: boolean
  }
  const rawLines: RawLine[] = []
  const paragraphs = opts.text.split('\n')
  for (const para of paragraphs) {
    const tokens = tokenize(para)
    if (!opts.wrap) {
      rawLines.push({ tokens, last: true, first: true })
      continue
    }
    let line: Token[] = []
    let lineW = 0
    let first = true
    const avail = () => (opts.width - (first ? opts.indent : 0)) / opts.hScale
    const push = (last: boolean) => {
      while (line.length && line[line.length - 1].space) line.pop()
      rawLines.push({ tokens: line, last, first })
      line = []
      lineW = 0
      first = false
    }
    for (const tok of tokens) {
      const w = rawWidth(tok.text)
      if (tok.space) {
        if (line.length) {
          line.push(tok)
          lineW += w
        }
        continue
      }
      if (lineW + w <= avail() + 0.01 || line.length === 0) {
        if (line.length === 0 && w > avail()) {
          // A single word wider than the box: break it by characters.
          let piece = ''
          for (const ch of tok.text) {
            if (piece && rawWidth(piece + ch) > avail()) {
              line.push({ text: piece, space: false })
              push(false)
              piece = ''
            }
            piece += ch
          }
          line.push({ text: piece, space: false })
          lineW = rawWidth(piece)
          continue
        }
        line.push(tok)
        lineW += w
      } else {
        push(false)
        line.push(tok)
        lineW = w
      }
    }
    push(true)
  }

  // 2. Condense a single-line edit that outgrew its slot (and the free room after it).
  let hScale = opts.hScale
  if (!opts.wrap && opts.fit === 'shrink' && opts.width > 0) {
    const slot = opts.width + (opts.align === 'left' || opts.align === 'justify' ? Math.max(0, opts.room ?? 0) : 0)
    const widest = Math.max(0, ...rawLines.map((l) => rawWidth(l.tokens.map((t) => t.text).join(''))))
    const needed = widest * hScale
    if (needed > slot) hScale = Math.max(hScale * 0.8, slot / widest)
  }

  // 3. Place runs.
  const lines: PlacedLine<F>[] = []
  rawLines.forEach((rl, index) => {
    const tokenWidths = rl.tokens.map((t) => rawWidth(t.text) * hScale)
    const natural = tokenWidths.reduce((a, b) => a + b, 0)
    const indent = rl.first ? opts.indent : 0
    const avail = opts.width - indent
    const gaps = rl.tokens.filter((t) => t.space).length
    let offset = indent
    let extraPerGap = 0
    if (opts.align === 'center') offset = indent + (avail - natural) / 2
    else if (opts.align === 'right') offset = indent + avail - natural
    else if (opts.align === 'justify' && opts.wrap && !rl.last && gaps > 0 && natural < avail)
      extraPerGap = (avail - natural) / gaps

    const runs: PlacedRun<F>[] = []
    let x = offset
    rl.tokens.forEach((tok, k) => {
      if (tok.space) {
        // Spaces are drawn so the PDF keeps word boundaries for copy/search.
        const f = fontOf(' ')
        if (f) runs.push({ text: tok.text, font: f, x })
        x += tokenWidths[k] + extraPerGap
        return
      }
      let chunk = ''
      let chunkFont: F | null = null
      let chunkX = x
      for (const ch of tok.text) {
        const f = fontOf(ch)
        if (f !== chunkFont) {
          if (chunk && chunkFont) runs.push({ text: chunk, font: chunkFont, x: chunkX })
          if (chunk && chunkFont) chunkX += chunkFont.widthOf(chunk, size) * hScale
          chunk = ''
          chunkFont = f
        }
        if (f) chunk += ch
      }
      if (chunk && chunkFont) runs.push({ text: chunk, font: chunkFont, x: chunkX })
      x += tokenWidths[k]
    })

    // Merge neighbouring runs in the same font when nothing was stretched.
    const merged: PlacedRun<F>[] = []
    for (const r of runs) {
      const prev = merged[merged.length - 1]
      if (prev && prev.font === r.font && extraPerGap === 0) prev.text += r.text
      else merged.push({ ...r })
    }
    lines.push({ runs: merged, width: natural, dy: index * opts.lineHeight * size })
  })

  return { lines, hScale, skipped: [...new Set(skipped)] }
}
