import { useState } from 'react'
import { Sparkles, Loader2, AlertCircle, Minimize2 } from 'lucide-react'
import { ToolHeader } from '../components/shared/ToolHeader'
import { FileDrop } from '../components/shared/FileDrop'
import { FilePill } from '../components/shared/FilePill'
import { ProgressBar } from '../components/ProgressBar'
import { StatusPanel } from '../components/shared/StatusPanel'
import {
  compressPdf,
  forceCompressPdf,
  getPageCount,
  type StructureBreakdown,
} from '../lib/pdfOps'
import { downloadBlob, formatBytes, bytesToBlob } from '../lib/download'
import { stripExtension } from '../lib/converter'
import { TOOLS } from './registry'

const meta = TOOLS.find((t) => t.id === 'compress')!

// "Good enough" = output ≤ 80% of original
const POOR_RESULT_THRESHOLD = 0.8

type Mode = 'smart' | 'force'

interface CompressionState {
  blob: Blob
  size: number
  oldSize: number
  mode: Mode
  breakdown?: StructureBreakdown
}

function BreakdownBar({ b }: { b: StructureBreakdown }) {
  const rows: { label: string; bytes: number; color: string; count?: number }[] = [
    { label: 'Signatures', bytes: b.signatures, color: 'bg-red-500', count: b.signatureCount },
    { label: 'Fonts', bytes: b.fonts, color: 'bg-orange-500', count: b.fontCount },
    { label: 'Images', bytes: b.images, color: 'bg-blue-500', count: b.imageCount },
    { label: 'Content streams', bytes: b.contentStreams, color: 'bg-green-500' },
    { label: 'Metadata', bytes: b.metadata, color: 'bg-purple-500' },
    { label: 'Other (xref, dicts, …)', bytes: b.other, color: 'bg-fg-subtle' },
  ]
    .filter((r) => r.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes)

  return (
    <div className="card p-4 space-y-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
        Where the file size is
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-bg-subtle">
        {rows.map((r) => (
          <div
            key={r.label}
            className={r.color}
            style={{ width: `${(r.bytes / b.totalBytes) * 100}%` }}
            title={`${r.label}: ${formatBytes(r.bytes)}`}
          />
        ))}
      </div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-2 h-2 rounded-sm ${r.color} shrink-0`} />
              <span className="text-fg-muted truncate">
                {r.label}
                {r.count !== undefined && r.count > 0 && (
                  <span className="text-fg-subtle ml-1">({r.count})</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-mono text-fg">{formatBytes(r.bytes)}</span>
              <span className="font-mono text-fg-subtle text-[10px] w-9 text-right">
                {((r.bytes / b.totalBytes) * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Compress() {
  const [file, setFile] = useState<File | null>(null)
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ c: number; t: number; label: string } | null>(null)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<CompressionState | null>(null)

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

  const runSmart = async () => {
    if (!file) return
    setRunning(true)
    setResult(null)
    try {
      const out = await compressPdf(file, setStatus)
      const blob = bytesToBlob(out.bytes, 'application/pdf')
      setResult({
        blob,
        size: blob.size,
        oldSize: out.originalSize,
        mode: 'smart',
        breakdown: out.breakdown,
      })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Compression failed')
    } finally {
      setRunning(false)
      setStatus(null)
    }
  }

  const runForce = async () => {
    if (!file) return
    setRunning(true)
    setResult(null)
    try {
      const out = await forceCompressPdf(
        file,
        { dpi: 120, imageQuality: 0.6 },
        (c, t, label) => setProgress({ c, t, label }),
      )
      const blob = bytesToBlob(out.bytes, 'application/pdf')
      setResult({ blob, size: blob.size, oldSize: out.originalSize, mode: 'force' })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Compression failed')
    } finally {
      setRunning(false)
      setProgress(null)
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
  const isPoorSmart = result?.mode === 'smart' && ratio > POOR_RESULT_THRESHOLD

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ToolHeader
        icon={meta.icon}
        title={meta.name}
        description={meta.description}
        rightSlot={
          <button onClick={runSmart} disabled={running} className="btn-primary">
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
              Uses MuPDF (the engine behind many commercial PDF tools). First click downloads the engine (~12 MB, cached after).
            </div>
          </StatusPanel>
        )}

        {running && status && (
          <div className="card p-4 animate-fade-in">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-accent animate-spin shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{status}</div>
                <div className="text-xs text-fg-muted mt-0.5">
                  Large files may take 30 seconds or more.
                </div>
              </div>
            </div>
          </div>
        )}

        {running && progress && (
          <ProgressBar current={progress.c} total={progress.t || 1} label={progress.label} />
        )}

        {result && (
          <>
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
                  downloadBlob(
                    result.blob,
                    `${stripExtension(file.name)}_${result.mode === 'force' ? 'rasterized' : 'compressed'}.pdf`,
                  )
                }
                className="btn-primary"
              >
                Download compressed PDF
              </button>
            </StatusPanel>

            {result.breakdown && <BreakdownBar b={result.breakdown} />}

            {isPoorSmart && result.breakdown && (
              <div className="card p-4 border-amber-500/30 bg-amber-500/5 space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-xs text-fg-muted leading-relaxed">
                    <strong className="text-fg">This PDF is at its natural compression limit.</strong>
                    {result.breakdown.signatures > result.breakdown.totalBytes * 0.3 && (
                      <> Most of the size is <strong className="text-fg">digital signatures</strong> ({formatBytes(result.breakdown.signatures)}) — cryptographic data that can't be compressed without breaking signature validity.</>
                    )}
                    {result.breakdown.signatures <= result.breakdown.totalBytes * 0.3 &&
                      result.breakdown.fonts > result.breakdown.totalBytes * 0.3 && (
                        <> Most of the size is <strong className="text-fg">embedded fonts</strong> ({formatBytes(result.breakdown.fonts)}) that are already subsetted.</>
                      )}
                    {result.breakdown.signatures <= result.breakdown.totalBytes * 0.3 &&
                      result.breakdown.fonts <= result.breakdown.totalBytes * 0.3 && (
                        <> The remaining bulk is already-compressed content.</>
                      )}
                  </div>
                </div>

                <div className="text-xs text-fg-muted leading-relaxed flex items-start gap-2.5">
                  <Minimize2 className="w-4 h-4 text-fg-muted shrink-0 mt-0.5" />
                  <span>
                    To force a smaller file, you can rasterize every page to JPEG.{' '}
                    <strong className="text-fg">Text becomes raster</strong> (no longer selectable
                    or searchable) and any digital signatures will not transfer.
                  </span>
                </div>

                <button
                  onClick={runForce}
                  disabled={running}
                  className="btn-secondary w-full"
                >
                  <Minimize2 className="w-4 h-4" />
                  Force compress (rasterize, lose text & signatures)
                </button>
              </div>
            )}

            {result.mode === 'force' && (
              <div className="card p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-fg-muted leading-relaxed">
                  Output is image-only. Text is no longer selectable. Any digital signatures or
                  form fields from the original are not in this file.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
