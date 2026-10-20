/**
 * Reusing a PDF's own fonts for edited text.
 *
 * Replacement text looks native only when it is set in the font the document
 * already uses. That font is usually an embedded subset, so it can only draw
 * the glyphs the document used — but for the commonest edit (fix a number, a
 * name, a word) those are exactly the glyphs needed. This module finds the
 * font dictionary behind a text run, builds a Unicode → character-code map
 * from its /ToUnicode CMap (or its simple encoding), works out which
 * characters the embedded program really contains, and measures widths from
 * /Widths or /W. Characters it can't encode are left to the caller's
 * fallback font, run by run.
 */

import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
  decodePDFRawStream,
} from 'pdf-lib'
import { stripSubsetTag } from './editorLayout'

export interface OriginalFont {
  ref: PDFRef
  baseFont: string
  canEncode(ch: string): boolean
  encode(text: string): PDFHexString
  /** Advance width in points (no horizontal scaling). */
  widthOfTextAtSize(text: string, size: number): number
}

const N = (s: string) => PDFName.of(s)

function nameOf(obj: unknown): string | null {
  return obj instanceof PDFName ? obj.decodeText() : null
}

function streamBytes(s: PDFStream): Uint8Array | null {
  try {
    if (s instanceof PDFRawStream) return decodePDFRawStream(s).decode()
    const anyS = s as unknown as { getUnencodedContents?: () => Uint8Array }
    return anyS.getUnencodedContents?.() ?? null
  } catch {
    return null
  }
}

/* ---------- ToUnicode ---------- */

function utf16HexToString(hex: string): string {
  let out = ''
  for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16))
  if (hex.length === 2) out += String.fromCharCode(parseInt(hex, 16))
  return out
}

function parseToUnicode(text: string): { map: Map<number, string>; bytes: 1 | 2 } {
  const map = new Map<number, string>()
  let bytes: 1 | 2 = 1
  const cs = /begincodespacerange\s*<([0-9a-fA-F]+)>/.exec(text)
  if (cs && cs[1].length >= 4) bytes = 2

  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) {
      if (m[1].length >= 4) bytes = 2
      map.set(parseInt(m[1], 16), utf16HexToString(m[2]))
    }
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[^\]]*\])/g)) {
      const lo = parseInt(m[1], 16)
      const hi = Math.min(parseInt(m[2], 16), lo + 0xffff)
      if (m[1].length >= 4) bytes = 2
      if (m[3].startsWith('[')) {
        const dsts = [...m[3].matchAll(/<([0-9a-fA-F]*)>/g)].map((d) => d[1])
        for (let c = lo; c <= hi && c - lo < dsts.length; c++) map.set(c, utf16HexToString(dsts[c - lo]))
      } else {
        const start = m[3].slice(1, -1)
        const head = start.slice(0, -4)
        const tail = parseInt(start.slice(-4) || '0', 16)
        for (let c = lo; c <= hi; c++) {
          const unit = (tail + (c - lo)).toString(16).padStart(4, '0')
          map.set(c, utf16HexToString(head + unit))
        }
      }
    }
  }
  return { map, bytes }
}

/* ---------- Simple-font encodings ---------- */

const WIN_ANSI_HIGH: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021,
  0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018,
  0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc,
  0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
}

function baseEncodingChar(code: number, encoding: string): string | null {
  if (code >= 0x20 && code <= 0x7e) {
    if (encoding === 'StandardEncoding' && code === 0x27) return '’'
    if (encoding === 'StandardEncoding' && code === 0x60) return '‘'
    return String.fromCharCode(code)
  }
  if (encoding !== 'WinAnsiEncoding') return null
  if (code >= 0xa0 && code <= 0xff) return String.fromCharCode(code)
  const u = WIN_ANSI_HIGH[code]
  return u ? String.fromCharCode(u) : null
}

const GLYPH_NAMES: Record<string, string> = {
  space: ' ', exclam: '!', quotedbl: '"', numbersign: '#', dollar: '$', percent: '%', ampersand: '&',
  quotesingle: "'", quoteright: '’', quoteleft: '‘', parenleft: '(', parenright: ')', asterisk: '*',
  plus: '+', comma: ',', hyphen: '-', minus: '−', period: '.', slash: '/', zero: '0', one: '1', two: '2',
  three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', colon: ':', semicolon: ';',
  less: '<', equal: '=', greater: '>', question: '?', at: '@', bracketleft: '[', backslash: '\\',
  bracketright: ']', asciicircum: '^', underscore: '_', grave: '`', braceleft: '{', bar: '|', braceright: '}',
  asciitilde: '~', endash: '–', emdash: '—', bullet: '•', ellipsis: '…',
  quotedblleft: '“', quotedblright: '”', degree: '°', copyright: '©',
  registered: '®', trademark: '™', Euro: '€', periodcentered: '·', multiply: '×',
  divide: '÷', plusminus: '±', section: '§', paragraph: '¶', nbspace: ' ',
}

function glyphNameToChar(name: string): string | null {
  if (name.length === 1 && /[A-Za-z]/.test(name)) return name
  if (GLYPH_NAMES[name]) return GLYPH_NAMES[name]
  const uni = /^uni([0-9A-Fa-f]{4})$/.exec(name) ?? /^u([0-9A-Fa-f]{4,6})$/.exec(name)
  if (uni) return String.fromCodePoint(parseInt(uni[1], 16))
  return null
}

/* ---------- Font dictionary discovery ---------- */

function* fontDicts(
  doc: PDFDocument,
  resources: PDFDict | undefined,
  depth = 0,
  seen = new Set<PDFDict>(),
): Generator<{ ref: PDFRef | null; dict: PDFDict }> {
  if (!resources || seen.has(resources) || depth > 4) return
  seen.add(resources)
  const fonts = resources.lookupMaybe(N('Font'), PDFDict)
  if (fonts) {
    for (const [, value] of fonts.entries()) {
      const dict = doc.context.lookup(value)
      if (dict instanceof PDFDict) yield { ref: value instanceof PDFRef ? value : null, dict }
    }
  }
  const xobjects = resources.lookupMaybe(N('XObject'), PDFDict)
  if (xobjects) {
    for (const [, value] of xobjects.entries()) {
      const xo = doc.context.lookup(value)
      if (!(xo instanceof PDFStream)) continue
      if (nameOf(xo.dict.get(N('Subtype'))) !== 'Form') continue
      yield* fontDicts(doc, xo.dict.lookupMaybe(N('Resources'), PDFDict), depth + 1, seen)
    }
  }
}

/* ---------- Encoders ---------- */

interface Encoder {
  bytes: 1 | 2
  codeOf: Map<string, number>
  width(code: number): number
}

function isEmbedded(descriptor: PDFDict | undefined): boolean {
  if (!descriptor) return false
  return ['FontFile', 'FontFile2', 'FontFile3'].some((k) => !!descriptor.get(N(k)))
}

function readToUnicode(doc: PDFDocument, dict: PDFDict) {
  const tu = dict.get(N('ToUnicode'))
  if (!tu) return null
  const s = doc.context.lookup(tu)
  if (!(s instanceof PDFStream)) return null
  const bytes = streamBytes(s)
  if (!bytes) return null
  return parseToUnicode(new TextDecoder('latin1').decode(bytes))
}

function simpleEncoder(doc: PDFDocument, dict: PDFDict, baseFont: string, knownChars: Set<string>): Encoder | null {
  const first = dict.lookupMaybe(N('FirstChar'), PDFNumber)?.asNumber() ?? 0
  const widthsArr = dict.lookupMaybe(N('Widths'), PDFArray)
  if (!widthsArr) return null
  const widths = widthsArr.asArray().map((w) => {
    const v = doc.context.lookup(w)
    return v instanceof PDFNumber ? v.asNumber() : 0
  })
  const descriptor = dict.lookupMaybe(N('FontDescriptor'), PDFDict)
  const missing = descriptor?.lookupMaybe(N('MissingWidth'), PDFNumber)?.asNumber() ?? 0
  const width = (code: number) => {
    const w = widths[code - first]
    return typeof w === 'number' ? w : missing
  }

  // code → unicode, from ToUnicode first, then the declared encoding
  const toUni = readToUnicode(doc, dict)
  const codeToChar = new Map<number, string>()
  let baseEnc = 'StandardEncoding'
  const enc = dict.get(N('Encoding'))
  const encObj = enc ? doc.context.lookup(enc) : undefined
  const differences = new Map<number, string>()
  if (encObj instanceof PDFName) baseEnc = encObj.decodeText()
  else if (encObj instanceof PDFDict) {
    baseEnc = nameOf(encObj.get(N('BaseEncoding'))) ?? 'StandardEncoding'
    const diffs = encObj.lookupMaybe(N('Differences'), PDFArray)
    let code = 0
    for (const item of diffs?.asArray() ?? []) {
      const v = doc.context.lookup(item)
      if (v instanceof PDFNumber) code = v.asNumber()
      else if (v instanceof PDFName) differences.set(code++, v.decodeText())
    }
  }
  for (let code = 0; code < 256; code++) {
    const fromTu = toUni?.map.get(code)
    if (fromTu && [...fromTu].length === 1) {
      codeToChar.set(code, fromTu)
      continue
    }
    const glyph = differences.get(code)
    const ch = glyph ? glyphNameToChar(glyph) : baseEncodingChar(code, baseEnc)
    if (ch) codeToChar.set(code, ch)
  }

  const embedded = isEmbedded(descriptor)
  const subset = /^[A-Z]{6}\+/.test(baseFont)
  const codeOf = new Map<string, number>()
  for (const [code, ch] of codeToChar) {
    if (codeOf.has(ch)) continue
    const inProgram = !embedded
      ? width(code) > 0
      : subset
        ? knownChars.has(ch) || (!!toUni && toUni.map.has(code))
        : width(code) > 0 || ch === ' '
    if (inProgram) codeOf.set(ch, code)
  }
  return { bytes: 1, codeOf, width }
}

function type0Encoder(doc: PDFDocument, dict: PDFDict): Encoder | null {
  const enc = nameOf(dict.get(N('Encoding')))
  if (enc !== 'Identity-H') return null
  const toUni = readToUnicode(doc, dict)
  if (!toUni) return null
  const descendants = dict.lookupMaybe(N('DescendantFonts'), PDFArray)
  const cidFont = descendants ? doc.context.lookup(descendants.get(0)) : undefined
  if (!(cidFont instanceof PDFDict)) return null
  const dw = cidFont.lookupMaybe(N('DW'), PDFNumber)?.asNumber() ?? 1000
  const widths = new Map<number, number>()
  const w = cidFont.lookupMaybe(N('W'), PDFArray)
  if (w) {
    const items = w.asArray().map((o) => doc.context.lookup(o))
    for (let i = 0; i < items.length; ) {
      const a = items[i]
      const b = items[i + 1]
      if (!(a instanceof PDFNumber)) break
      if (b instanceof PDFArray) {
        const start = a.asNumber()
        b.asArray().forEach((v, k) => {
          const n = doc.context.lookup(v)
          if (n instanceof PDFNumber) widths.set(start + k, n.asNumber())
        })
        i += 2
      } else {
        const c = items[i + 2]
        if (!(b instanceof PDFNumber) || !(c instanceof PDFNumber)) break
        for (let cid = a.asNumber(); cid <= b.asNumber() && cid - a.asNumber() < 65536; cid++)
          widths.set(cid, c.asNumber())
        i += 3
      }
    }
  }
  const codeOf = new Map<string, number>()
  for (const [code, str] of toUni.map) {
    if (code === 0 || [...str].length !== 1) continue
    if (!codeOf.has(str)) codeOf.set(str, code)
  }
  return { bytes: 2, codeOf, width: (code) => widths.get(code) ?? dw }
}

function buildEncoder(doc: PDFDocument, dict: PDFDict, baseFont: string, knownChars: Set<string>): Encoder | null {
  const subtype = nameOf(dict.get(N('Subtype')))
  if (subtype === 'Type0') return type0Encoder(doc, dict)
  if (subtype === 'Type1' || subtype === 'TrueType' || subtype === 'MMType1')
    return simpleEncoder(doc, dict, baseFont, knownChars)
  return null
}

/* ---------- Public API ---------- */

/**
 * Find the font a page draws `baseFont` with and wrap it as an encoder.
 * `knownChars` are characters pdf.js saw drawn with this font anywhere in the
 * document — for subset fonts without a ToUnicode CMap, the only reliable
 * evidence a glyph exists. `wanted` breaks ties between same-named fonts.
 */
export function resolveOriginalFont(
  doc: PDFDocument,
  pageIndex: number,
  baseFont: string,
  knownChars: Set<string>,
  wanted: string,
): OriginalFont | null {
  const page = doc.getPages()[pageIndex]
  if (!page || !baseFont) return null
  const target = stripSubsetTag(baseFont)
  let best: { ref: PDFRef | null; dict: PDFDict; enc: Encoder; score: number; name: string } | null = null
  for (const { ref, dict } of fontDicts(doc, page.node.Resources())) {
    const name = nameOf(dict.get(N('BaseFont'))) ?? ''
    if (name !== baseFont && stripSubsetTag(name) !== target) continue
    const enc = buildEncoder(doc, dict, name, knownChars)
    if (!enc) continue
    let score = name === baseFont ? 0.5 : 0
    for (const ch of wanted) if (enc.codeOf.has(ch)) score++
    if (!best || score > best.score) best = { ref, dict, enc, score, name }
  }
  if (!best) return null
  const ref = best.ref ?? doc.context.register(best.dict)
  const { enc } = best
  const hexWidth = enc.bytes * 2
  return {
    ref,
    baseFont: best.name,
    canEncode: (ch) => enc.codeOf.has(ch),
    encode: (text) => {
      let hex = ''
      for (const ch of text) {
        const code = enc.codeOf.get(ch)
        if (code !== undefined) hex += code.toString(16).padStart(hexWidth, '0')
      }
      return PDFHexString.of(hex)
    },
    widthOfTextAtSize: (text, size) => {
      let total = 0
      for (const ch of text) {
        const code = enc.codeOf.get(ch)
        if (code !== undefined) total += enc.width(code)
      }
      return (total / 1000) * size
    },
  }
}

/** True when `ref` in `doc` still points at a font dict named `baseFont`. */
export function fontRefStillValid(doc: PDFDocument, ref: PDFRef, baseFont: string): boolean {
  const obj = doc.context.lookup(ref)
  return obj instanceof PDFDict && nameOf(obj.get(N('BaseFont'))) === baseFont
}
