import { loadPdfJs } from './pdfOps'

export interface PageText {
  pageNumber: number
  text: string
  items: TextItem[]
}

export interface TextItem {
  str: string
  x: number
  y: number
  width: number
  height: number
  fontSize: number
}

export async function extractText(
  file: File,
  onProgress?: (current: number, total: number) => void,
): Promise<PageText[]> {
  const pdf = await loadPdfJs(file)
  const total = pdf.numPages
  const results: PageText[] = []

  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const items: TextItem[] = []
    const lineMap = new Map<number, string[]>()

    for (const it of textContent.items as Array<{
      str: string
      transform: number[]
      width: number
      height: number
    }>) {
      const x = it.transform[4]
      const y = it.transform[5]
      const fontSize = Math.abs(it.transform[3]) || Math.abs(it.transform[0])
      items.push({ str: it.str, x, y, width: it.width, height: it.height, fontSize })
      const key = Math.round(y)
      if (!lineMap.has(key)) lineMap.set(key, [])
      lineMap.get(key)!.push(it.str)
    }

    const sortedLines = [...lineMap.keys()].sort((a, b) => b - a)
    const text = sortedLines.map((y) => lineMap.get(y)!.join(' ')).join('\n')

    results.push({ pageNumber: i, text, items })
    page.cleanup()
    onProgress?.(i, total)
  }

  return results
}

export function joinPlainText(pages: PageText[], separator = '\n\n'): string {
  return pages.map((p) => p.text.trim()).filter(Boolean).join(separator)
}

/* ---------- Markdown ---------- */

export function pagesToMarkdown(pages: PageText[], baseName: string): string {
  let md = `# ${baseName}\n\n`
  for (const p of pages) {
    md += `## Page ${p.pageNumber}\n\n`
    const lines = p.text.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) {
      md += '_(empty)_\n\n'
      continue
    }
    // Heuristic: if a line is significantly larger than median fontSize, treat as heading
    const sizes = p.items.map((it) => it.fontSize).filter((s) => s > 0)
    const median = sizes.length > 0 ? sizes.sort((a, b) => a - b)[Math.floor(sizes.length / 2)] : 12

    // Build line → max font size map
    const lineSize = new Map<string, number>()
    const lineMap = new Map<number, { strs: string[]; maxSize: number }>()
    for (const it of p.items) {
      const k = Math.round(it.y)
      if (!lineMap.has(k)) lineMap.set(k, { strs: [], maxSize: 0 })
      const e = lineMap.get(k)!
      e.strs.push(it.str)
      e.maxSize = Math.max(e.maxSize, it.fontSize)
    }
    for (const e of lineMap.values()) {
      lineSize.set(e.strs.join(' ').trim(), e.maxSize)
    }

    for (const line of lines) {
      const size = lineSize.get(line) ?? median
      if (size >= median * 1.6) md += `### ${line}\n\n`
      else if (size >= median * 1.3) md += `**${line}**\n\n`
      else md += `${line}\n\n`
    }
  }
  return md
}

/* ---------- Image extraction ---------- */

export interface ExtractedImage {
  pageNumber: number
  index: number
  blob: Blob
  width: number
  height: number
  filename: string
}

/**
 * Extracts embedded images by inspecting the page's operator list and serving
 * each XObject image through canvas to produce a PNG blob.
 */
export async function extractImages(
  file: File,
  baseName: string,
  onProgress?: (current: number, total: number) => void,
): Promise<ExtractedImage[]> {
  const pdf = await loadPdfJs(file)
  const total = pdf.numPages
  const out: ExtractedImage[] = []
  const padLength = String(total).length

  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i)
    const ops = await page.getOperatorList()
    const fns = ops.fnArray
    const args = ops.argsArray
    let index = 0

    for (let k = 0; k < fns.length; k++) {
      const fn = fns[k]
      // OPS.paintImageXObject = 85, OPS.paintInlineImageXObject = 86 (in pdfjs internals;
      // safer: query by image name via objs.has)
      if (fn === pdfjsOps.paintImageXObject || fn === pdfjsOps.paintInlineImageXObject) {
        const imgName = args[k]?.[0]
        if (typeof imgName !== 'string') continue
        try {
          const obj: any = await new Promise((resolve) => {
            const tryGet = () => {
              if (page.objs.has(imgName)) resolve(page.objs.get(imgName))
              else setTimeout(tryGet, 30)
            }
            tryGet()
          })
          if (!obj?.data || !obj.width || !obj.height) continue
          const canvas = document.createElement('canvas')
          canvas.width = obj.width
          canvas.height = obj.height
          const ctx = canvas.getContext('2d')!
          // RGB or RGBA?
          const stride = obj.data.length / (obj.width * obj.height)
          if (stride === 4) {
            const id = ctx.createImageData(obj.width, obj.height)
            id.data.set(obj.data)
            ctx.putImageData(id, 0, 0)
          } else if (stride === 3) {
            const id = ctx.createImageData(obj.width, obj.height)
            for (let p = 0, q = 0; p < obj.data.length; p += 3, q += 4) {
              id.data[q] = obj.data[p]
              id.data[q + 1] = obj.data[p + 1]
              id.data[q + 2] = obj.data[p + 2]
              id.data[q + 3] = 255
            }
            ctx.putImageData(id, 0, 0)
          } else {
            // Grayscale fallback
            const id = ctx.createImageData(obj.width, obj.height)
            for (let p = 0, q = 0; p < obj.data.length; p++, q += 4) {
              id.data[q] = id.data[q + 1] = id.data[q + 2] = obj.data[p]
              id.data[q + 3] = 255
            }
            ctx.putImageData(id, 0, 0)
          }
          const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
              'image/png',
            ),
          )
          index += 1
          out.push({
            pageNumber: i,
            index,
            blob,
            width: obj.width,
            height: obj.height,
            filename: `${baseName}_p${String(i).padStart(padLength, '0')}_img${index}.png`,
          })
        } catch {
          // ignore unreadable images
        }
      }
    }
    page.cleanup()
    onProgress?.(i, total)
  }
  return out
}

// Approximate constants from pdfjs-dist (stable across recent versions)
const pdfjsOps = {
  paintImageXObject: 85,
  paintInlineImageXObject: 86,
}
