/**
 * Lightweight PDF operations built on pdf-lib + pdf.js.
 *
 * Compression-specific code lives in `./compress.ts`. This module covers the
 * small page-level operations (merge, split, rotate, reorder, image-to-pdf,
 * metadata, password) that the rest of the app needs.
 */

import { PDFDocument, degrees } from 'pdf-lib'
import { pdfjsLib } from './pdfWorker'

/* ---------- Loading helpers ---------- */

export async function loadPdfLib(file: File, password?: string): Promise<PDFDocument> {
  const buf = await file.arrayBuffer()
  return await PDFDocument.load(buf, { ignoreEncryption: !!password })
}

export async function loadPdfJs(file: File, password?: string) {
  const buf = await file.arrayBuffer()
  return await pdfjsLib.getDocument({ data: buf, password }).promise
}

/* ---------- Page count ---------- */

export async function getPageCount(file: File): Promise<number> {
  const pdf = await loadPdfLib(file)
  return pdf.getPageCount()
}

/* ---------- Render thumbnail ---------- */

export async function renderThumbnail(
  file: File,
  pageNumber: number,
  maxSize = 200,
): Promise<string> {
  const pdf = await loadPdfJs(file)
  const page = await pdf.getPage(pageNumber)
  const base = page.getViewport({ scale: 1 })
  const scale = Math.min(maxSize / base.width, maxSize / base.height)
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  page.cleanup()
  return canvas.toDataURL('image/jpeg', 0.7)
}

/* ---------- Merge ---------- */

export async function mergePdfs(files: File[]): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  for (const file of files) {
    const src = await loadPdfLib(file)
    const copied = await out.copyPages(src, src.getPageIndices())
    copied.forEach((p) => out.addPage(p))
  }
  return await out.save()
}

/* ---------- Split ---------- */

export interface SplitGroup {
  name: string
  pages: number[] // 1-indexed
}

export async function splitPdf(
  file: File,
  groups: SplitGroup[],
): Promise<{ name: string; bytes: Uint8Array }[]> {
  const src = await loadPdfLib(file)
  const results: { name: string; bytes: Uint8Array }[] = []
  for (const g of groups) {
    const out = await PDFDocument.create()
    const indices = g.pages.map((p) => p - 1)
    const copied = await out.copyPages(src, indices)
    copied.forEach((p) => out.addPage(p))
    results.push({ name: g.name, bytes: await out.save() })
  }
  return results
}

export function buildSplitGroupsByEvery(
  total: number,
  every: number,
  baseName: string,
): SplitGroup[] {
  const groups: SplitGroup[] = []
  let start = 1
  let idx = 1
  while (start <= total) {
    const end = Math.min(start + every - 1, total)
    const pages: number[] = []
    for (let p = start; p <= end; p++) pages.push(p)
    groups.push({ name: `${baseName}_part_${idx}.pdf`, pages })
    start = end + 1
    idx += 1
  }
  return groups
}

/* ---------- Rotate ---------- */

export async function rotatePages(
  file: File,
  rotation: 90 | 180 | 270,
  pages: 'all' | number[],
): Promise<Uint8Array> {
  const pdf = await loadPdfLib(file)
  const indices = pages === 'all' ? pdf.getPageIndices() : pages.map((p) => p - 1)
  for (const i of indices) {
    const page = pdf.getPage(i)
    page.setRotation(degrees((page.getRotation().angle + rotation) % 360))
  }
  return await pdf.save()
}

/* ---------- Reorder / Delete ---------- */

export async function reorderPages(file: File, newOrder: number[]): Promise<Uint8Array> {
  const src = await loadPdfLib(file)
  const out = await PDFDocument.create()
  const copied = await out.copyPages(
    src,
    newOrder.map((p) => p - 1),
  )
  copied.forEach((p) => out.addPage(p))
  return await out.save()
}

/* ---------- Image to PDF ---------- */

export type ImageFitMode = 'fit' | 'fill' | 'original'

export interface ImageToPdfOptions {
  pageSize: 'a4' | 'letter' | 'auto'
  orientation: 'portrait' | 'landscape' | 'auto'
  margin: number // points
  fit: ImageFitMode
}

const PAGE_SIZES: Record<'a4' | 'letter', [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
}

export async function imagesToPdf(files: File[], options: ImageToPdfOptions): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()

  for (const file of files) {
    const buf = await file.arrayBuffer()
    const lower = file.name.toLowerCase()
    const img =
      file.type === 'image/png' || lower.endsWith('.png')
        ? await pdf.embedPng(buf)
        : await pdf.embedJpg(buf)

    let [pageW, pageH] = derivePageSize(img.width, img.height, options)
    const page = pdf.addPage([pageW, pageH])
    const [drawW, drawH] = deriveDrawSize(img.width, img.height, pageW, pageH, options)
    const x = (pageW - drawW) / 2
    const y = (pageH - drawH) / 2
    page.drawImage(img, { x, y, width: drawW, height: drawH })
  }

  return await pdf.save()
}

function derivePageSize(
  imgW: number,
  imgH: number,
  opts: ImageToPdfOptions,
): [number, number] {
  if (opts.pageSize === 'auto') return [imgW, imgH]
  let [w, h] = PAGE_SIZES[opts.pageSize]
  if (opts.orientation === 'landscape') [w, h] = [h, w]
  if (opts.orientation === 'auto' && imgW > imgH) [w, h] = [h, w]
  return [w, h]
}

function deriveDrawSize(
  imgW: number,
  imgH: number,
  pageW: number,
  pageH: number,
  opts: ImageToPdfOptions,
): [number, number] {
  const availW = pageW - 2 * opts.margin
  const availH = pageH - 2 * opts.margin
  if (opts.fit === 'original') return [imgW, imgH]
  const scale =
    opts.fit === 'fill'
      ? Math.max(availW / imgW, availH / imgH)
      : Math.min(availW / imgW, availH / imgH)
  return [imgW * scale, imgH * scale]
}

/* ---------- Password ---------- */

/**
 * Strip encryption from a PDF. pdf-lib doesn't decrypt — but if a PDF is only
 * restricted (not user-password-protected), loading with `ignoreEncryption`
 * and re-saving yields an unencrypted copy. For real password-protected PDFs
 * this won't actually read the content.
 *
 * NOTE: there's no `addPassword` companion — adding password protection
 * requires native AES/RC4 encryption that browser-side libraries don't ship.
 */
export async function removePassword(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer()
  const pdf = await PDFDocument.load(buf, { ignoreEncryption: true })
  return await pdf.save()
}

/* ---------- Metadata ---------- */

export interface PdfMetadata {
  title: string
  author: string
  subject: string
  keywords: string
  creator: string
  producer: string
  creationDate: string | null
  modificationDate: string | null
}

export async function readMetadata(file: File): Promise<PdfMetadata> {
  const pdf = await loadPdfLib(file)
  return {
    title: pdf.getTitle() ?? '',
    author: pdf.getAuthor() ?? '',
    subject: pdf.getSubject() ?? '',
    keywords: (pdf.getKeywords() ?? '') as string,
    creator: pdf.getCreator() ?? '',
    producer: pdf.getProducer() ?? '',
    creationDate: pdf.getCreationDate()?.toISOString() ?? null,
    modificationDate: pdf.getModificationDate()?.toISOString() ?? null,
  }
}

export async function writeMetadata(file: File, m: PdfMetadata): Promise<Uint8Array> {
  const pdf = await loadPdfLib(file)
  pdf.setTitle(m.title)
  pdf.setAuthor(m.author)
  pdf.setSubject(m.subject)
  pdf.setKeywords(m.keywords ? m.keywords.split(',').map((s) => s.trim()) : [])
  pdf.setCreator(m.creator)
  pdf.setProducer(m.producer)
  pdf.setModificationDate(new Date())
  return await pdf.save()
}
