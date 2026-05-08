import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  PageBreak,
} from 'docx'
import * as XLSX from 'xlsx'
import pptxgen from 'pptxgenjs'
import type { PageText } from './extract'
import { loadPdfJs } from './pdfOps'

/* ---------- PDF -> Word (.docx) ---------- */

export async function pagesToDocx(pages: PageText[], baseName: string): Promise<Blob> {
  const children: Paragraph[] = []
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: baseName, bold: true })],
    }),
  )

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i]
    if (i > 0) {
      children.push(new Paragraph({ children: [new PageBreak()] }))
    }
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: `Page ${p.pageNumber}` })],
      }),
    )
    const sizes = p.items.map((it) => it.fontSize).filter((s) => s > 0)
    const median = sizes.length > 0 ? sizes.sort((a, b) => a - b)[Math.floor(sizes.length / 2)] : 12
    const lineMap = new Map<number, { strs: string[]; size: number }>()
    for (const it of p.items) {
      const k = Math.round(it.y)
      if (!lineMap.has(k)) lineMap.set(k, { strs: [], size: 0 })
      const e = lineMap.get(k)!
      e.strs.push(it.str)
      e.size = Math.max(e.size, it.fontSize)
    }
    const lines = [...lineMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([_, v]) => ({ text: v.strs.join(' ').trim(), size: v.size }))
      .filter((l) => l.text.length > 0)

    for (const line of lines) {
      if (line.size >= median * 1.6) {
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            children: [new TextRun({ text: line.text })],
          }),
        )
      } else if (line.size >= median * 1.3) {
        children.push(
          new Paragraph({ children: [new TextRun({ text: line.text, bold: true })] }),
        )
      } else {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: line.text, size: 22 })],
          }),
        )
      }
    }
  }

  const doc = new Document({
    creator: 'PDF Tool (browser)',
    title: baseName,
    sections: [{ properties: {}, children }],
  })

  return await Packer.toBlob(doc)
}

/* ---------- PDF -> Excel (.xlsx) ---------- */

/**
 * Heuristic table detection:
 * 1. For each page, cluster text items by their Y coordinate (rows).
 * 2. Within each row, sort items by X. Treat each item as a cell.
 * 3. Determine column boundaries by clustering X positions across all rows.
 * 4. Place cells into the nearest column.
 *
 * Result: one worksheet per page; rows reflect visual layout.
 */
export function pagesToWorkbook(pages: PageText[], baseName: string) {
  const wb = XLSX.utils.book_new()

  for (const p of pages) {
    if (p.items.length === 0) {
      const ws = XLSX.utils.aoa_to_sheet([['(empty page)']])
      XLSX.utils.book_append_sheet(wb, ws, `Page ${p.pageNumber}`)
      continue
    }

    // Cluster rows by Y (with tolerance based on median font size)
    const sizes = p.items.map((it) => it.fontSize).filter((s) => s > 0)
    const medianSize = sizes.length
      ? sizes.sort((a, b) => a - b)[Math.floor(sizes.length / 2)]
      : 12
    const yTol = Math.max(2, medianSize * 0.5)

    const sortedByY = [...p.items].sort((a, b) => b.y - a.y)
    const rows: typeof p.items[] = []
    let currentRow: typeof p.items = []
    let currentY = sortedByY[0]?.y ?? 0
    for (const it of sortedByY) {
      if (Math.abs(it.y - currentY) <= yTol) {
        currentRow.push(it)
      } else {
        if (currentRow.length) rows.push(currentRow)
        currentRow = [it]
        currentY = it.y
      }
    }
    if (currentRow.length) rows.push(currentRow)

    // Column clustering: collect all X positions and group similar values
    const xs = p.items.map((it) => it.x).sort((a, b) => a - b)
    const xTol = Math.max(8, medianSize * 1.5)
    const cols: number[] = []
    for (const x of xs) {
      if (cols.length === 0 || x - cols[cols.length - 1] > xTol) cols.push(x)
    }
    cols.sort((a, b) => a - b)

    const aoa: string[][] = []
    for (const row of rows) {
      const sortedRow = row.sort((a, b) => a.x - b.x)
      const cells: string[] = new Array(cols.length).fill('')
      for (const it of sortedRow) {
        let best = 0
        let bestDist = Infinity
        for (let c = 0; c < cols.length; c++) {
          const d = Math.abs(it.x - cols[c])
          if (d < bestDist) {
            bestDist = d
            best = c
          }
        }
        cells[best] = (cells[best] ? cells[best] + ' ' : '') + it.str
      }
      aoa.push(cells.map((c) => c.trim()))
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    XLSX.utils.book_append_sheet(wb, ws, `Page ${p.pageNumber}`.slice(0, 31))
  }

  // Cover sheet
  const cover = XLSX.utils.aoa_to_sheet([
    [`${baseName} — extracted by browser`],
    ['Method: heuristic table detection'],
    ['Quality: best-effort. Verify before use.'],
  ])
  XLSX.utils.book_append_sheet(wb, cover, '_About')

  return wb
}

export function workbookToBlob(wb: XLSX.WorkBook): Blob {
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/* ---------- PDF -> PowerPoint (.pptx) ---------- */

export async function pdfToPptx(
  file: File,
  baseName: string,
  dpi: number,
  onProgress?: (current: number, total: number) => void,
): Promise<Blob> {
  const pdf = await loadPdfJs(file)
  const total = pdf.numPages
  const pres = new pptxgen()
  pres.author = 'PDF Tool (browser)'
  pres.title = baseName

  // Set first page's aspect to determine slide size
  const firstPage = await pdf.getPage(1)
  const firstViewport = firstPage.getViewport({ scale: 1 })
  const aspect = firstViewport.width / firstViewport.height
  // Default 10 inches wide
  const slideW = 10
  const slideH = slideW / aspect
  pres.defineLayout({ name: 'PDF_PAGE', width: slideW, height: slideH })
  pres.layout = 'PDF_PAGE'
  firstPage.cleanup()

  const scale = dpi / 72
  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    const slide = pres.addSlide()
    slide.addImage({ data: dataUrl, x: 0, y: 0, w: slideW, h: slideH })
    page.cleanup()
    onProgress?.(i, total)
  }

  return (await pres.write({ outputType: 'blob' })) as Blob
}
