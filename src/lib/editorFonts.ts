/**
 * Fonts for edited text.
 *
 * Order of preference for each character of an edit:
 *  1. the document's own font, when it can draw that character
 *     (see editorPdfFonts.ts);
 *  2. the standard PDF font of the same family and weight — Helvetica,
 *     Times or Courier (regular / bold / italic) — for Latin text;
 *  3. Pretendard Regular or Bold for Hangul, CJK and anything else
 *     the standard fonts can't encode, and for Latin inside Korean text,
 *     where Helvetica would look out of place.
 *
 * Pretendard TTFs are lazy-loaded (~2.7 MB each, Bold only when needed) and
 * subset on save. @pdf-lib/fontkit's subsetter writes a short-format `loca`
 * table without padding odd-length glyph records, which shifts every later
 * glyph and leaves Hangul blank in MuPDF, Acrobat and others;
 * `patchSubsetPadding` pads each glyph to an even length before it's written.
 */

import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, PDFFont, PDFHexString, PDFRef, StandardFonts } from 'pdf-lib'
// TTF variants — @pdf-lib/fontkit subsets TTF reliably; the CFF-based OTF
// throws "Not a CFF Font" on subset() due to a fontkit issue.
import pretendardRegularUrl from 'pretendard/dist/public/static/alternative/Pretendard-Regular.ttf?url'
import pretendardBoldUrl from 'pretendard/dist/public/static/alternative/Pretendard-Bold.ttf?url'
import type { FontFamily, FontInfo } from './editorLayout'
import type { OriginalFont } from './editorPdfFonts'
import { pick } from '../i18n'
import editMessages from '../i18n/messages/edit'

/* ---------- Pretendard bytes ---------- */

type Weight = 'regular' | 'bold'
const URLS: Record<Weight, string> = { regular: pretendardRegularUrl, bold: pretendardBoldUrl }
const bytesCache: Partial<Record<Weight, Promise<ArrayBuffer>>> = {}

function loadPretendard(weight: Weight): Promise<ArrayBuffer> {
  if (!bytesCache[weight]) {
    bytesCache[weight] = fetch(URLS[weight]).then((r) => {
      if (!r.ok) {
        delete bytesCache[weight]
        throw new Error(pick(editMessages).errors.fontLoadFailed(r.status))
      }
      return r.arrayBuffer()
    })
  }
  return bytesCache[weight]!
}

/** Pre-warm the regular weight so the first save/preview doesn't wait on it. */
export function preloadEditorFont(): void {
  loadPretendard('regular').catch(() => {
    /* retried on demand */
  })
}

/* ---------- fontkit subset fix ---------- */

interface FontkitSubset {
  glyf: Uint8Array[]
  offset: number
  _addGlyph(gid: number): number
}

let subsetPatched = false

function patchSubsetPadding(fkFont: { createSubset(): unknown } | undefined) {
  if (subsetPatched || !fkFont) return
  const proto = Object.getPrototypeOf(fkFont.createSubset()) as FontkitSubset
  const original = proto._addGlyph
  proto._addGlyph = function (this: FontkitSubset, gid: number) {
    const result = original.call(this, gid)
    const i = this.glyf.length - 1
    const last = this.glyf[i]
    if (last && last.length % 2 === 1) {
      const Ctor = last.constructor as { alloc?: (n: number) => Uint8Array; new (n: number): Uint8Array }
      const padded = typeof Ctor.alloc === 'function' ? Ctor.alloc(last.length + 1) : new Ctor(last.length + 1)
      padded.set(last)
      this.glyf[i] = padded
      this.offset += 1
    }
    return result
  }
  subsetPatched = true
}

/* ---------- Character classes ---------- */

const WIN_ANSI = new Set<number>([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d,
  0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e,
  0x0178,
])
for (let c = 0x20; c <= 0x7e; c++) WIN_ANSI.add(c)
for (let c = 0xa0; c <= 0xff; c++) WIN_ANSI.add(c)

export function isWinAnsi(ch: string): boolean {
  return WIN_ANSI.has(ch.codePointAt(0) ?? 0)
}

export function hasHangulOrCJK(text: string): boolean {
  return /[ᄀ-ᇿ㄰-㆏가-힣぀-ヿ㐀-鿿豈-﫿]/.test(text)
}

const KOREAN_FONT_RE = /(malgun|gulim|dotum|batang|gungsuh|nanum|hy|hcr|함초롬|맑은|굴림|돋움|바탕|궁서|noto ?sans ?(kr|cjk)|noto ?serif ?(kr|cjk)|pretendard|apple ?sd|spoqa|kopub|yoon|hangul)/i

/**
 * Latin set inside a Korean context looks right in Pretendard, not Helvetica:
 * Korean text in the edit, a Korean original font, or a mostly-Korean page.
 */
export function prefersPretendard(text: string, fontName?: string | null, koreanPage?: boolean): boolean {
  return hasHangulOrCJK(text) || (!!fontName && KOREAN_FONT_RE.test(fontName)) || !!koreanPage
}

/* ---------- Font handles ---------- */

export interface FontHandle {
  id: string
  ref: PDFRef
  /** Suggested resource-name tag. */
  tag: string
  canEncode(ch: string): boolean
  widthOf(text: string, size: number): number
  encode(text: string): PDFHexString
  /** Synthesise bold (stroke outline) / italic (shear) at draw time. */
  fakeBold: boolean
  fakeItalic: boolean
}

const STANDARD: Record<FontFamily, [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
  sans: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  serif: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  mono: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
}

function pdfFontHandle(
  id: string,
  font: PDFFont,
  canEncode: (ch: string) => boolean,
  fakeBold: boolean,
  fakeItalic: boolean,
): FontHandle {
  return {
    id,
    ref: font.ref,
    tag: font.name.replace(/[^A-Za-z0-9-]/g, '').slice(0, 24) || 'F',
    canEncode,
    widthOf: (text, size) => {
      try {
        return font.widthOfTextAtSize(text, size)
      } catch {
        return text.length * size * 0.5
      }
    },
    encode: (text) => font.encodeText(text),
    fakeBold,
    fakeItalic,
  }
}

export function originalFontHandle(f: OriginalFont, fakeBold: boolean, fakeItalic: boolean): FontHandle {
  return {
    id: `orig:${f.ref.toString()}:${fakeBold ? 'b' : ''}${fakeItalic ? 'i' : ''}`,
    ref: f.ref,
    tag: 'PTKOrig',
    canEncode: f.canEncode,
    widthOf: f.widthOfTextAtSize,
    encode: f.encode,
    fakeBold,
    fakeItalic,
  }
}

export interface FontRequest {
  family: FontFamily
  bold: boolean
  italic: boolean
  /** Prefer Pretendard for Latin too (Korean context). */
  korean: boolean
}

/**
 * Embeds fallback fonts into one PDFDocument on demand and hands out a
 * synchronous per-character chooser once `prepare` has run.
 */
export class FontBank {
  private standard = new Map<string, FontHandle>()
  private pretendard = new Map<Weight, { font: PDFFont; has: (cp: number) => boolean } | null>()

  constructor(private doc: PDFDocument) {
    doc.registerFontkit(fontkit)
  }

  /** Embed everything `texts` will need under `req`. */
  async prepare(req: FontRequest, text: string): Promise<void> {
    const needsStd = [...text].some((ch) => isWinAnsi(ch))
    const needsPre = req.korean || [...text].some((ch) => !isWinAnsi(ch) && ch.trim() !== '')
    if (needsStd) await this.ensureStandard(req.family, req.bold, req.italic)
    if (needsPre) {
      const weight: Weight = req.bold ? 'bold' : 'regular'
      await this.ensurePretendard(weight)
      if (weight === 'bold' && !this.pretendard.get('bold')) await this.ensurePretendard('regular')
    }
  }

  private async ensureStandard(family: FontFamily, bold: boolean, italic: boolean) {
    const key = `${family}${bold ? 'B' : ''}${italic ? 'I' : ''}`
    if (this.standard.has(key)) return
    const name = STANDARD[family][(bold ? 1 : 0) + (italic ? 2 : 0)]
    const font = await this.doc.embedFont(name)
    this.standard.set(key, pdfFontHandle(`std:${key}`, font, isWinAnsi, false, false))
  }

  private async ensurePretendard(weight: Weight) {
    if (this.pretendard.has(weight)) return
    try {
      const bytes = await loadPretendard(weight)
      const font = await this.doc.embedFont(bytes, { subset: true })
      const fk = (font as unknown as { embedder?: { font?: { createSubset(): unknown; hasGlyphForCodePoint(cp: number): boolean } } })
        .embedder?.font
      patchSubsetPadding(fk)
      this.pretendard.set(weight, { font, has: (cp) => fk?.hasGlyphForCodePoint(cp) ?? true })
    } catch (e) {
      if (weight === 'regular') throw e
      this.pretendard.set(weight, null)
    }
  }

  /** Synchronous chooser for one request; returns null for unencodable characters. */
  chooser(req: FontRequest): (ch: string) => FontHandle | null {
    const stdKey = `${req.family}${req.bold ? 'B' : ''}${req.italic ? 'I' : ''}`
    const std = this.standard.get(stdKey) ?? null
    const preBold = req.bold ? this.pretendard.get('bold') : undefined
    const pre = preBold ?? this.pretendard.get('regular') ?? null
    const preHandle = pre
      ? pdfFontHandle(
          `pre:${preBold ? 'bold' : 'regular'}:${req.bold && !preBold ? 'b' : ''}${req.italic ? 'i' : ''}`,
          pre.font,
          (ch) => pre.has(ch.codePointAt(0) ?? 0),
          req.bold && !preBold,
          req.italic,
        )
      : null
    return (ch: string) => {
      const winAnsi = isWinAnsi(ch)
      if (winAnsi && std && !req.korean) return std
      if (preHandle && preHandle.canEncode(ch)) return preHandle
      if (winAnsi && std) return std
      return null
    }
  }
}

/* ---------- On-screen equivalents ---------- */

const CSS_STACKS: Record<FontFamily, string> = {
  sans: 'Helvetica, Arial, "Liberation Sans", Pretendard, sans-serif',
  serif: '"Times New Roman", Times, "Liberation Serif", Pretendard, serif',
  mono: '"Courier New", Courier, "Liberation Mono", Pretendard, monospace',
}

const KOREAN_STACKS: Record<FontFamily, string> = {
  sans: 'Pretendard, "Pretendard Variable", -apple-system, "Malgun Gothic", sans-serif',
  serif: 'Batang, "바탕", "Noto Serif KR", "Nanum Myeongjo", AppleMyungjo, serif',
  mono: '"D2Coding", "Nanum Gothic Coding", "Courier New", monospace',
}

/** CSS font-family that renders like what the save will embed. */
export function cssFontFamily(family: FontFamily, korean: boolean): string {
  return korean ? KOREAN_STACKS[family] : CSS_STACKS[family]
}

const localFaces = new Map<string, string>()
let faceSheet: CSSStyleSheet | null = null

/**
 * A CSS family for one of the document's fonts that resolves to the copy
 * installed on this computer, if there is one (`local()` matches the full or
 * PostScript name — Hangul users usually have 휴먼명조, HY헤드라인 and friends).
 * Text being typed then looks like the document, not like a substitute.
 */
export function cssOriginalFamily(info: FontInfo): string {
  let fam = localFaces.get(info.baseFont)
  if (fam) return fam
  fam = `ptk-doc-${localFaces.size}`
  localFaces.set(info.baseFont, fam)
  const names = [...new Set([info.displayName, info.baseFont.replace(/^[A-Z]{6}\+/, '')])]
    .filter((n) => n && n !== '—')
    .map((n) => `local("${n.replace(/["\\]/g, '')}")`)
  if (names.length) {
    try {
      if (!faceSheet) {
        const el = document.createElement('style')
        el.dataset.ptk = 'doc-fonts'
        document.head.appendChild(el)
        faceSheet = el.sheet
      }
      // Declared at the font's own weight, so a bold face isn't emboldened twice.
      faceSheet?.insertRule(
        `@font-face { font-family: "${fam}"; src: ${names.join(', ')}; font-weight: ${info.bold ? 700 : 400}; }`,
      )
    } catch {
      /* the stack's fallbacks still apply */
    }
  }
  return fam
}
