import { createWorker, type Worker } from 'tesseract.js'
import { loadPdfJs } from './pdfOps'

export interface OcrWord {
  text: string
  confidence: number
}

export interface OcrResult {
  pageNumber: number
  text: string
  confidence: number
  words: OcrWord[]
}

export interface PreprocessOptions {
  grayscale: boolean
  contrast: boolean
  binarize: boolean
}

export interface OcrOptions {
  languages: string[] // e.g. ['eng'] or ['eng', 'kor']
  dpi: number
  psm: string // page segmentation mode (Tesseract PSM number as string)
  whitelist: string // optional character whitelist; '' = no restriction
  preprocess: PreprocessOptions
}

let cachedWorker: Worker | null = null
let cachedKey: string | null = null

async function getWorker(languages: string[]): Promise<Worker> {
  const key = languages.join('+')
  if (cachedWorker && cachedKey === key) return cachedWorker
  if (cachedWorker) {
    await cachedWorker.terminate()
    cachedWorker = null
  }
  const worker = await createWorker(key)
  cachedWorker = worker
  cachedKey = key
  return worker
}

/* ---------- Image preprocessing ---------- */

function applyGrayscale(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const img = ctx.getImageData(0, 0, width, height)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    d[i] = d[i + 1] = d[i + 2] = g
  }
  ctx.putImageData(img, 0, 0)
}

function applyContrastStretch(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const img = ctx.getImageData(0, 0, width, height)
  const d = img.data
  let min = 255
  let max = 0
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i]
    if (v < min) min = v
    if (v > max) max = v
  }
  const range = max - min
  if (range < 4) return
  for (let i = 0; i < d.length; i += 4) {
    const v = ((d[i] - min) / range) * 255
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
}

function applyOtsuBinarize(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const img = ctx.getImageData(0, 0, width, height)
  const d = img.data
  const total = width * height
  const hist = new Uint32Array(256)
  for (let i = 0; i < d.length; i += 4) hist[d[i] | 0]++

  let sum = 0
  for (let t = 0; t < 256; t++) sum += t * hist[t]

  let sumB = 0
  let wB = 0
  let maxVar = -1
  let threshold = 127
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const diff = mB - mF
    const between = wB * wF * diff * diff
    if (between > maxVar) {
      maxVar = between
      threshold = t
    }
  }

  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] >= threshold ? 255 : 0
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
}

function preprocess(canvas: HTMLCanvasElement, opts: PreprocessOptions) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  if (opts.binarize) {
    // Otsu needs a grayscale histogram; apply unconditionally before binarizing
    applyGrayscale(ctx, canvas.width, canvas.height)
    if (opts.contrast) applyContrastStretch(ctx, canvas.width, canvas.height)
    applyOtsuBinarize(ctx, canvas.width, canvas.height)
    return
  }
  if (opts.grayscale) applyGrayscale(ctx, canvas.width, canvas.height)
  if (opts.contrast) applyContrastStretch(ctx, canvas.width, canvas.height)
}

/* ---------- Main OCR pipeline ---------- */

export async function ocrPdf(
  file: File,
  options: OcrOptions,
  onProgress?: (current: number, total: number, status: string) => void,
): Promise<OcrResult[]> {
  if (options.languages.length === 0) throw new Error('Pick at least one language')

  onProgress?.(0, 0, 'Loading OCR engine...')
  const worker = await getWorker(options.languages)
  await worker.setParameters({
    tessedit_pageseg_mode: options.psm as never,
    tessedit_char_whitelist: options.whitelist,
  })

  const pdf = await loadPdfJs(file)
  const total = pdf.numPages
  const results: OcrResult[] = []

  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i)
    const scale = options.dpi / 72
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise

    preprocess(canvas, options.preprocess)

    onProgress?.(i - 1, total, `Recognizing page ${i} of ${total}...`)
    const result = await worker.recognize(canvas)
    const data = result.data as {
      text: string
      confidence: number
      words?: { text: string; confidence: number }[]
    }

    const words: OcrWord[] = (data.words ?? []).map((w) => ({
      text: w.text,
      confidence: w.confidence,
    }))

    results.push({
      pageNumber: i,
      text: data.text,
      confidence: data.confidence,
      words,
    })

    page.cleanup()
    onProgress?.(i, total, `Recognized page ${i} of ${total}`)
  }

  return results
}

export async function terminateOcrWorker() {
  if (cachedWorker) {
    await cachedWorker.terminate()
    cachedWorker = null
    cachedKey = null
  }
}

export const OCR_LANGUAGES: { code: string; label: string }[] = [
  { code: 'eng', label: 'English' },
  { code: 'kor', label: '한국어' },
  { code: 'jpn', label: '日本語' },
  { code: 'chi_sim', label: '简中' },
  { code: 'chi_tra', label: '繁中' },
  { code: 'spa', label: 'Español' },
  { code: 'fra', label: 'Français' },
  { code: 'deu', label: 'Deutsch' },
  { code: 'ita', label: 'Italiano' },
  { code: 'por', label: 'Português' },
  { code: 'rus', label: 'Русский' },
  { code: 'ara', label: 'العربية' },
]

export const PSM_OPTIONS: { value: string; label: string; help: string }[] = [
  { value: '3', label: 'Auto', help: 'Default — auto layout analysis' },
  { value: '1', label: 'Auto + OSD', help: 'Auto with orientation/script detection' },
  { value: '4', label: 'Single column', help: 'Variable-sized text in one column' },
  { value: '6', label: 'Single block', help: 'A uniform block of text (good for screenshots)' },
  { value: '7', label: 'Single line', help: 'One text line (signs, titles)' },
  { value: '8', label: 'Single word', help: 'One word' },
  { value: '11', label: 'Sparse text', help: 'Find as much text as possible, no order' },
  { value: '12', label: 'Sparse + OSD', help: 'Sparse with orientation detection' },
  { value: '13', label: 'Raw line', help: 'Treat as a raw line, bypass layout' },
]

export const DEFAULT_OCR_OPTIONS: OcrOptions = {
  languages: ['eng'],
  dpi: 200,
  psm: '3',
  whitelist: '',
  preprocess: {
    grayscale: true,
    contrast: true,
    binarize: false,
  },
}
