/**
 * Change-only line edits.
 *
 * Rewriting a whole line to change one word moves everything else in it: the
 * replacement is set with natural spacing, so letter-spaced labels collapse,
 * tab stops drift and the text after the change slides. Instead the old and
 * new text are compared and only the difference is touched:
 *  - glyphs before the change stay exactly as they are in the file;
 *  - the changed glyphs are deleted and the new characters drawn in their place;
 *  - glyphs after the change stay put when the width didn't change, or are
 *    redrawn shifted as a block by the exact difference, keeping their
 *    original spacing.
 * Positions come from the page's real glyphs (editorRedact.extractGlyphs).
 */

import type { Rect } from './editorGeometry'
import type { GlyphPos } from './editorRedact'

export interface DiffPlan {
  /** Nothing changed — the line stays as it is. */
  noop: boolean
  /** Where the new characters start (baseline origin, user space). */
  startX: number
  y: number
  /** New characters to draw at `startX`. */
  middle: string
  /** Extra horizontal squeeze (≤ 1) for the new characters so the line still fits. */
  squeeze: number
  /** Exact colour for the new characters (that of the glyphs they sit among). */
  color?: [number, number, number]
  /** Original glyphs after the change, redrawn shifted by `delta` (empty = left untouched). */
  suffix: GlyphPos[]
  delta: number
  /** How far the next fields on the row must move right to make space. */
  push: number
  /** Bands whose glyphs are deleted. */
  removeRects: Rect[]
}

const isSpace = (c: string) => !c.trim()
const squash = (s: string) => s.replace(/\s+/g, '')

/**
 * Plan a change-only edit, or return null when the whole line has to be
 * rewritten instead (the page's glyphs don't spell the original text).
 *
 * `measure` gives the advance width of a string as the new characters will be
 * drawn; `maxRight` is how far right the line may extend without disturbing
 * anything. Beyond that, up to `pushable` points are gained by moving the
 * next fields on the row (`push`), and only then are the new characters
 * condensed (to 75%) — the untouched ones never are.
 */
export function planLineDiff(
  glyphs: GlyphPos[],
  oldText: string,
  newText: string,
  measure: (s: string) => number,
  maxRight: number,
  pushable = 0,
): DiffPlan | null {
  const O = glyphs
  const ons = O.map((g, i) => (isSpace(g.c) ? -1 : i)).filter((i) => i >= 0)
  if (!ons.length) return null
  // The page's glyphs must spell the text the edit started from.
  if (ons.map((i) => O[i].c).join('') !== squash(oldText)) return null

  const nArr = [...newText]
  const nns = nArr.map((c, i) => (isSpace(c) ? -1 : i)).filter((i) => i >= 0)
  const n = ons.length

  if (newText.replace(/\s+/g, ' ').trim() === oldText.replace(/\s+/g, ' ').trim()) {
    return {
      noop: true,
      startX: O[ons[0]].x,
      y: O[ons[0]].y,
      middle: '',
      squeeze: 1,
      suffix: [],
      delta: 0,
      push: 0,
      removeRects: [],
    }
  }

  let p = 0
  while (p < n && p < nns.length && O[ons[p]].c === nArr[nns[p]]) p++
  let s = 0
  while (s < n - p && s < nns.length - p && O[ons[n - 1 - s]].c === nArr[nns[nns.length - 1 - s]]) s++
  if (p === n && p === nns.length) return null // only spacing changed — rewrite the line

  const removed = ons.slice(p, n - s).map((i) => O[i])
  const prefixLast = p > 0 ? O[ons[p - 1]] : null
  const y = O[ons[0]].y
  const size = O[ons[0]].size

  const midStart = p > 0 ? nns[p - 1] + 1 : 0
  const midEnd = s > 0 ? nns[nns.length - s] : nArr.length
  let middle = nArr.slice(midStart, midEnd).join('')

  // Start: where the replaced characters started, keeping the original gap
  // after the prefix; a pure insertion goes right after the prefix.
  let startX: number
  if (removed.length) {
    startX = removed[0].x
    if (prefixLast && ons[p] - ons[p - 1] > 1) middle = middle.replace(/^\s+/, '')
  } else {
    startX = prefixLast ? prefixLast.x + prefixLast.w : O[ons[0]].x
  }

  let delta = 0
  let suffix: GlyphPos[] = []
  let squeeze = 1
  let lineEnd: number
  if (s > 0) {
    const first = O[ons[n - s]]
    const last = O[ons[n - 1]]
    const prevIdx = removed.length ? ons[n - s - 1] : p > 0 ? ons[p - 1] : -1
    const prevEnd = prevIdx >= 0 ? O[prevIdx].x + O[prevIdx].w : first.x
    const gap = first.x - prevEnd
    const gapHasSpace = prevIdx >= 0 && ons[n - s] - prevIdx > 1
    let after: number // space kept between the new characters and the tail
    let keepGapSpaces = false
    if (gapHasSpace && /\s$/.test(middle)) {
      middle = middle.replace(/\s+$/, '')
      after = gap
      keepGapSpaces = true
    } else {
      after = gapHasSpace ? 0 : Math.max(0, gap)
    }
    const tail = last.x + last.w - first.x
    const natural = measure(middle)
    const fits = maxRight + pushable - tail - after - startX
    if (natural > 0 && natural > fits) squeeze = Math.max(0.75, fits / natural)
    delta = startX + natural * squeeze + after - first.x
    // Space glyphs move with the tail too, so copied/searched text keeps its spaces.
    if (Math.abs(delta) >= 0.05) suffix = O.slice(keepGapSpaces ? prevIdx + 1 : ons[n - s])
    else delta = 0
    lineEnd = last.x + last.w + delta
  } else {
    const natural = measure(middle)
    const fits = maxRight + pushable - startX
    if (natural > 0 && natural > fits) squeeze = Math.max(0.75, fits / natural)
    lineEnd = startX + natural * squeeze
  }
  const push = Math.min(pushable, Math.max(0, lineEnd - maxRight))

  // Everything redrawn is removed first — spaces included, so none is doubled.
  const gone = [...removed, ...suffix]
  const removeRects: Rect[] = []
  if (gone.length) {
    const a = gone[0]
    const b = gone[gone.length - 1]
    const x0 = a.x + a.w * 0.15
    const x1 = b.x + b.w * 0.85
    removeRects.push({ x: x0, y: y + size * 0.18, width: Math.max(0.5, x1 - x0), height: size * 0.34 })
  }
  return { noop: false, startX, y, middle, squeeze, suffix, delta, push, removeRects }
}
