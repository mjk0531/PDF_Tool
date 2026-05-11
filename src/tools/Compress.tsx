import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { ToolHeader } from '../components/shared/ToolHeader'
import { FileDrop } from '../components/shared/FileDrop'
import { FilePill } from '../components/shared/FilePill'
import { StatusPanel } from '../components/shared/StatusPanel'
import { compressPdf, getPageCount } from '../lib/pdfOps'
import { downloadBlob, formatBytes, bytesToBlob } from '../lib/download'
import { stripExtension } from '../lib/converter'
import { TOOLS } from './registry'

const meta = TOOLS.find((t) => t.id === 'compress')!

export function Compress() {
  const [file, setFile] = useState<File | null>(null)
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ blob: Blob; size: number; oldSize: number } | null>(null)

  const onFiles = async (files: File[]) => {
    const f = files[0]
    setFile(f)
    setResult(null)
    try {
      setPageCount(await getPageCount(f))
    } catch {
      setPageCount(null)
    }
  }

  const run = async () => {
    if (!file) return
    setRunning(true)
    setResult(null)
    try {
      const out = await compressPdf(file, setStatus)
      const blob = bytesToBlob(out.bytes, 'application/pdf')
      setResult({ blob, size: blob.size, oldSize: out.originalSize })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Compression failed')
    } finally {
      setRunning(false)
      setStatus(null)
    }
  }

  if (!file) {
    return (
      <div className="flex-1 flex flex-col">
        <ToolHeader icon={meta.icon} title={meta.name} description={meta.description} />
        <FileDrop onFiles={onFiles} multiple={false} />
      </div>
    )
  }

  const ratio = result ? result.size / result.oldSize : 0
  const saved = result ? result.oldSize - result.size : 0

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ToolHeader
        icon={meta.icon}
        title={meta.name}
        description={meta.description}
        rightSlot={
          <button onClick={run} disabled={running} className="btn-primary">
            <Sparkles className={`w-4 h-4 ${running ? 'animate-pulse' : ''}`} />
            {running ? 'Compressing...' : 'Compress'}
          </button>
        }
      />
      <div className="flex-1 overflow-y-auto p-8 max-w-2xl mx-auto w-full space-y-5">
        <FilePill
          file={file}
          detail={pageCount ? `${pageCount} pages` : undefined}
          onRemove={() => {
            setFile(null)
            setResult(null)
          }}
        />

        {!result && !running && (
          <StatusPanel
            variant="info"
            title="Ready to compress"
            message={`${formatBytes(file.size)} · ${pageCount ?? '?'} pages. Press Compress in the top right.`}
          >
            <div className="text-[11px] text-fg-subtle leading-relaxed">
              Uses MuPDF (the engine behind many commercial PDF tools). Performs font subsetting, image recompression, garbage collection, and stream optimization. First click downloads the engine (~12 MB, cached after).
            </div>
          </StatusPanel>
        )}

        {running && (
          <div className="card p-4 animate-fade-in">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-accent animate-spin shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{status ?? 'Working...'}</div>
                <div className="text-xs text-fg-muted mt-0.5">
                  Large files may take 30 seconds or more.
                </div>
              </div>
            </div>
          </div>
        )}

        {result && (
          <StatusPanel
            variant={ratio < 1 ? 'success' : 'info'}
            title={
              ratio < 1
                ? `Compressed to ${(ratio * 100).toFixed(1)}% of original`
                : 'No size reduction possible'
            }
            message={
              ratio < 1
                ? `Saved ${formatBytes(saved)} · ${formatBytes(result.oldSize)} → ${formatBytes(result.size)}`
                : `${formatBytes(result.oldSize)} → ${formatBytes(result.size)} — this PDF is already optimized.`
            }
          >
            <button
              onClick={() =>
                downloadBlob(result.blob, `${stripExtension(file.name)}_compressed.pdf`)
              }
              className="btn-primary"
            >
              Download compressed PDF
            </button>
          </StatusPanel>
        )}
      </div>
    </div>
  )
}
