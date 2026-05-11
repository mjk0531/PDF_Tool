import { useState } from 'react'
import { Sparkles, FileText, AlertCircle, Minimize2 } from 'lucide-react'
import { ToolHeader } from '../components/shared/ToolHeader'
import { FileDrop } from '../components/shared/FileDrop'
import { FilePill } from '../components/shared/FilePill'
import { ProgressBar } from '../components/ProgressBar'
import { StatusPanel } from '../components/shared/StatusPanel'
import {
  compressPdfByRasterization,
  compressPdfSmart,
  getPageCount,
  SMART_COMPRESS_PRESET,
  type SmartCompressResult,
} from '../lib/pdfOps'
import { downloadBlob, formatBytes, bytesToBlob } from '../lib/download'
import { stripExtension } from '../lib/converter'
import { TOOLS } from './registry'

const meta = TOOLS.find((t) => t.id === 'compress')!

// Compression is "good enough" if the output is ≤ 90% of original
const POOR_RESULT_THRESHOLD = 0.9

type Mode = 'smart' | 'maximum'

interface CompressionResult {
  blob: Blob
  size: number
  oldSize: number
  mode: Mode
  details?: SmartCompressResult
}

export function Compress() {
  const [file, setFile] = useState<File | null>(null)
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [progress, setProgress] = useState<{ c: number; t: number; label: string } | null>(null)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<CompressionResult | null>(null)

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
      const out = await compressPdfSmart(file, SMART_COMPRESS_PRESET, (c, t, label) =>
        setProgress({ c, t, label }),
      )
      const blob = bytesToBlob(out.bytes, 'application/pdf')
      setResult({ blob, size: blob.size, oldSize: out.originalSize, mode: 'smart', details: out })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Compression failed')
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  const runMaximum = async () => {
    if (!file) return
    setRunning(true)
    setResult(null)
    try {
      const bytes = await compressPdfByRasterization(
        file,
        { imageDpi: 120, imageQuality: 0.6, grayscale: false },
        (c, t) => setProgress({ c, t, label: `Rasterizing page ${c} of ${t}...` }),
      )
      const blob = bytesToBlob(bytes, 'application/pdf')
      setResult({ blob, size: blob.size, oldSize: file.size, mode: 'maximum' })
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
  const isPoorResult =
    result?.mode === 'smart' && ratio > POOR_RESULT_THRESHOLD

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
              <strong className="text-fg-muted">How it works:</strong> embedded images get downsampled and re-encoded. Text, fonts, and vectors are preserved — your output stays selectable and searchable.
            </div>
          </StatusPanel>
        )}

        {progress && <ProgressBar current={progress.c} total={progress.t || 1} label={progress.label} />}

        {result && (
          <>
            <StatusPanel
              variant={ratio < 1 ? 'success' : 'info'}
              title={
                ratio < 1
                  ? `Compressed to ${(ratio * 100).toFixed(1)}% of original`
                  : 'No size reduction this time'
              }
              message={
                ratio < 1
                  ? `Saved ${formatBytes(saved)} · ${formatBytes(result.oldSize)} → ${formatBytes(result.size)}`
                  : `${formatBytes(result.oldSize)} → ${formatBytes(result.size)}`
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

            {result.mode === 'smart' && result.details && (
              <div className="card p-4 text-xs text-fg-muted space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle mb-1">
                  What was processed
                </div>
                <div className="flex justify-between">
                  <span>Embedded images found</span>
                  <span className="font-mono text-fg">{result.details.imagesFound}</span>
                </div>
                <div className="flex justify-between">
                  <span>Recompressed (JPEG / PNG)</span>
                  <span className="font-mono text-fg">
                    {result.details.imagesFormats.jpeg} / {result.details.imagesFormats.flate}
                  </span>
                </div>
                {result.details.imagesFormats.other > 0 && (
                  <div className="flex justify-between text-fg-subtle">
                    <span>Skipped (unsupported format)</span>
                    <span className="font-mono">{result.details.imagesFormats.other}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Replaced (output smaller)</span>
                  <span className="font-mono text-fg">{result.details.imagesReplaced}</span>
                </div>
                {result.details.metadataStripped && (
                  <div className="flex justify-between text-fg-subtle">
                    <span>Metadata / thumbnails / attachments</span>
                    <span className="font-mono">stripped</span>
                  </div>
                )}
              </div>
            )}

            {isPoorResult && (
              <div className="card p-4 border-amber-500/30 bg-amber-500/5">
                <div className="flex items-start gap-2.5 mb-3">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-xs text-fg-muted leading-relaxed">
                    <strong className="text-fg">Not much to compress.</strong>{' '}
                    {result.details && result.details.imagesFound === 0
                      ? "This PDF has no embedded raster images — its size is mostly fonts, vectors, or other content that smart compression can't touch."
                      : result.details && result.details.imagesReplaced === 0
                        ? "The embedded images were already heavily compressed — re-encoding wouldn't have made them smaller."
                        : 'The bulk of this file is fonts, vectors, or content streams — not images.'}
                  </div>
                </div>
                <div className="text-xs text-fg-muted leading-relaxed mb-3 flex items-start gap-2.5">
                  <Minimize2 className="w-4 h-4 text-fg-muted shrink-0 mt-0.5" />
                  <span>
                    For maximum reduction, you can rasterize every page to JPEG.{' '}
                    <strong className="text-fg">Text becomes raster</strong> (no longer selectable
                    or searchable) but the file will shrink significantly.
                  </span>
                </div>
                <button
                  onClick={runMaximum}
                  disabled={running}
                  className="btn-secondary w-full"
                >
                  <Minimize2 className="w-4 h-4" />
                  Rasterize everything (lose selectable text)
                </button>
              </div>
            )}

            {result.mode === 'maximum' && (
              <div className="card p-3 flex items-start gap-2">
                <FileText className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-fg-muted leading-relaxed">
                  Output was rasterized — text in the file is now an image and is no longer
                  selectable.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
