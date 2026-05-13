/**
 * Font infrastructure for the editor.
 *
 * Pretendard (a Korean sans-serif with strong Latin coverage and partial CJK
 * Hanja) is bundled as the universal font for overlay text in the editor.
 * It's lazy-loaded — the ~1.6 MB OTF only downloads on the first save that
 * includes text. Browser HTTP cache means subsequent saves are instant.
 *
 * fontkit (loaded from @pdf-lib/fontkit) is registered on each PDFDocument
 * so pdf-lib can subset & embed the OTF.
 */

import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import type { PDFFont } from 'pdf-lib'
// TTF variant — @pdf-lib/fontkit subsets TTF reliably; the CFF-based OTF
// throws "Not a CFF Font" on subset() due to a fontkit issue.
import pretendardUrl from 'pretendard/dist/public/static/alternative/Pretendard-Regular.ttf?url'

let pretendardBytesPromise: Promise<ArrayBuffer> | null = null
function loadPretendardBytes(): Promise<ArrayBuffer> {
  if (!pretendardBytesPromise) {
    pretendardBytesPromise = fetch(pretendardUrl).then((r) => {
      if (!r.ok) throw new Error(`Failed to load Pretendard font (${r.status})`)
      return r.arrayBuffer()
    })
  }
  return pretendardBytesPromise
}

/** Pre-warm the font bytes so save isn't delayed by the first fetch. */
export function preloadEditorFont(): void {
  loadPretendardBytes().catch(() => {
    /* swallowed — caller will retry on save */
  })
}

export interface EditorFontSet {
  /** Universal Pretendard (Korean + Latin + partial CJK). */
  universal: PDFFont
  /** Built-in Helvetica fallback for the rare characters Pretendard misses. */
  fallback: PDFFont
}

/**
 * Load + embed both fonts for a PDFDocument. Registers fontkit so pdf-lib
 * can read the OTF.
 */
export async function embedEditorFonts(pdf: PDFDocument): Promise<EditorFontSet> {
  pdf.registerFontkit(fontkit)
  const bytes = await loadPretendardBytes()
  const universal = await pdf.embedFont(bytes, { subset: true })
  const fallback = await pdf.embedFont(StandardFonts.Helvetica)
  return { universal, fallback }
}

/**
 * Pick the best font for a given string. Pretendard covers the vast
 * majority of real-world cases (any Latin, Hangul, common Hanja). If a
 * character is genuinely unsupported, we fall back to Helvetica for that
 * substring — at least the WinAnsi parts will render instead of failing
 * the whole text annotation.
 */
export function chooseFontForChar(char: number, fonts: EditorFontSet): PDFFont {
  // Pretendard via fontkit will subset on the fly for whatever codepoints
  // exist in the font. The fontkit subset call inside drawText throws if a
  // codepoint isn't in the font, so we conservatively check the script.
  // In practice Pretendard handles Korean + Latin + a lot of common
  // CJK ideographs.
  if (canPretendardRender(char)) return fonts.universal
  return fonts.fallback
}

/**
 * Conservative range check for Pretendard's coverage. Returns true for code
 * points the font is virtually guaranteed to contain.
 */
function canPretendardRender(code: number): boolean {
  // Basic Latin + Latin-1 Supplement + Latin Extended A
  if (code <= 0x024f) return true
  // Latin Extended Additional
  if (code >= 0x1e00 && code <= 0x1eff) return true
  // General punctuation, super/subscripts, currency, letterlike
  if (code >= 0x2000 && code <= 0x214f) return true
  // CJK Symbols and Punctuation
  if (code >= 0x3000 && code <= 0x303f) return true
  // Hangul Jamo
  if (code >= 0x1100 && code <= 0x11ff) return true
  // Hangul Compatibility Jamo
  if (code >= 0x3130 && code <= 0x318f) return true
  // Hangul Syllables (the big one — ~11k Korean syllables)
  if (code >= 0xac00 && code <= 0xd7a3) return true
  // CJK Unified Ideographs (partial coverage but most common ones)
  if (code >= 0x4e00 && code <= 0x9fff) return true
  // Halfwidth and Fullwidth Forms
  if (code >= 0xff00 && code <= 0xffef) return true
  return false
}

/**
 * Split a string into runs that share a font. Each run renders contiguously
 * with `font` without throwing on unsupported codepoints.
 */
export interface TextRun {
  text: string
  font: PDFFont
}

export function segmentTextByFont(text: string, fonts: EditorFontSet): TextRun[] {
  const runs: TextRun[] = []
  let buf = ''
  let bufFont: PDFFont | null = null
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    const font = chooseFontForChar(code, fonts)
    if (bufFont === null) {
      buf = ch
      bufFont = font
    } else if (font === bufFont) {
      buf += ch
    } else {
      runs.push({ text: buf, font: bufFont })
      buf = ch
      bufFont = font
    }
  }
  if (buf && bufFont) runs.push({ text: buf, font: bufFont })
  return runs
}

/**
 * Word-wrap a string to a max width, returning the lines as font-aware runs.
 * Each line is a sequence of TextRuns; each run is text that fits and shares
 * a single font.
 *
 * Words are broken on spaces; if a single word is longer than maxWidth it's
 * placed on its own line and allowed to overflow (we don't hyphenate).
 */
export function wrapTextToWidth(
  text: string,
  fonts: EditorFontSet,
  fontSize: number,
  maxWidth: number,
): TextRun[][] {
  const lines: TextRun[][] = []
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      lines.push([])
      continue
    }
    const words = paragraph.split(' ')
    let currentLine = ''
    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word
      const width = measureTextWidth(candidate, fonts, fontSize)
      if (width <= maxWidth || currentLine === '') {
        currentLine = candidate
      } else {
        lines.push(segmentTextByFont(currentLine, fonts))
        currentLine = word
      }
    }
    if (currentLine) lines.push(segmentTextByFont(currentLine, fonts))
  }
  return lines
}

function measureTextWidth(text: string, fonts: EditorFontSet, fontSize: number): number {
  const runs = segmentTextByFont(text, fonts)
  let total = 0
  for (const r of runs) {
    try {
      total += r.font.widthOfTextAtSize(r.text, fontSize)
    } catch {
      // If even fallback can't measure (e.g. truly exotic chars), approximate
      total += r.text.length * fontSize * 0.5
    }
  }
  return total
}
