import { createWorker, type Worker } from 'tesseract.js'
import { loadPdfJs } from './pdfOps'

export interface OcrResult {
  pageNumber: number
  text: string
  confidence: number
}

let cachedWorker: Worker | null = null

async function getWorker(language: string): Promise<Worker> {
  if (cachedWorker) {
    await cachedWorker.terminate()
    cachedWorker = null
  }
  const worker = await createWorker(language)
  cachedWorker = worker
  return worker
}

export async function ocrPdf(
  file: File,
  language: string,
  dpi: number,
  onProgress?: (current: number, total: number, status: string) => void,
): Promise<OcrResult[]> {
  onProgress?.(0, 0, 'Loading OCR engine...')
  const worker = await getWorker(language)

  const pdf = await loadPdfJs(file)
  const total = pdf.numPages
  const results: OcrResult[] = []

  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i)
    const scale = dpi / 72
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise

    onProgress?.(i - 1, total, `Recognizing page ${i} of ${total}...`)
    const result = await worker.recognize(canvas)
    results.push({
      pageNumber: i,
      text: result.data.text,
      confidence: result.data.confidence,
    })

    page.cleanup()
    onProgress?.(i, total, `Recognized page ${i} of ${total}`)
  }

  await worker.terminate()
  cachedWorker = null
  return results
}

export const OCR_LANGUAGES: { code: string; label: string }[] = [
  { code: 'eng', label: 'English' },
  { code: 'kor', label: 'Korean (한국어)' },
  { code: 'jpn', label: 'Japanese (日本語)' },
  { code: 'chi_sim', label: 'Chinese Simplified (简体中文)' },
  { code: 'chi_tra', label: 'Chinese Traditional (繁體中文)' },
  { code: 'spa', label: 'Spanish' },
  { code: 'fra', label: 'French' },
  { code: 'deu', label: 'German' },
  { code: 'ita', label: 'Italian' },
  { code: 'por', label: 'Portuguese' },
  { code: 'rus', label: 'Russian' },
  { code: 'ara', label: 'Arabic' },
]
