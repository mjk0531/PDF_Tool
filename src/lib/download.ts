import JSZip from 'jszip'
import type { ConvertedPage } from './converter'

export function bytesToBlob(bytes: Uint8Array, type = 'application/octet-stream'): Blob {
  // Copy into a fresh ArrayBuffer to satisfy strict TS (avoid SharedArrayBuffer union)
  const ab = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(ab).set(bytes)
  return new Blob([ab], { type })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoke after a short delay so the download has time to start
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function downloadAsZip(
  pages: ConvertedPage[],
  zipName: string,
): Promise<void> {
  const zip = new JSZip()
  for (const p of pages) {
    zip.file(p.filename, p.blob)
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' })
  downloadBlob(blob, `${zipName}.zip`)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
