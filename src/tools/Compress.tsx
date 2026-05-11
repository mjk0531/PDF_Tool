import { useState } from 'react'
import { Sparkles, FileText, AlertCircle, Minimize2, Layers } from 'lucide-react'
import { ToolHeader } from '../components/shared/ToolHeader'
import { FileDrop } from '../components/shared/FileDrop'
import { FilePill } from '../components/shared/FilePill'
import { ProgressBar } from '../components/ProgressBar'
import { StatusPanel } from '../components/shared/StatusPanel'
import {
  compressPdfByRasterization,
  compressPdfHybrid,
  compressPdfSmart,
  getPageCount,
  HYBRID_COMPRESS_PRESET,
  SMART_COMPRESS_PRESET,
  type HybridCompressResult,
  type SmartCompressResult,
} from '../lib/pdfOps'
import { downloadBlob, formatBytes, bytesToBlob } from '../lib/download'
import { stripExtension } from '../lib/converter'
import { TOOLS } from './registry'

const meta = TOOLS.find((t) => t.id === 'compress')!

// "Good enough" = output ≤ 80% of original
const POOR_RESULT_THRESHOLD = 0.8

type Mode = 'smart' | 'hybrid' | 'maximum'

interface CompressionResult {
  blob: Blob
  size: number
  oldSize: number
  mode: Mode
  smartDetails?: SmartCompressResult
  hybridDetails?: HybridCompressResult
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
      setResult({
        blob,
        size: blob.size,
        oldSize: out.originalSize,
        mode: 'smart',
        smartDetails: out,
      })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Compression failed')
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  const runHybrid = async () => {
    if (!file) return
    setRunning(true)
    setResult(null)
    try {
      const out = await compressPdfHybrid(file, HYBRID_COMPRESS_PRESET, (c, t, label) =>
        setProgress({ c, t, label }),
      )
      const blob = bytesToBlob(out.bytes, 'application/pdf')
      setResult({
        blob,
        size: blob.size,
        oldSize: out.originalSize,
        mode: 'hybrid',
        hybridDetails: out,
      })
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
                  downloadBlob(
                    result.blob,
                    `${stripExtension(file.name)}_${result.mode === 'maximum' ? 'rasterized' : result.mode === 'hybrid' ? 'compact' : 'compressed'}.pdf`,
                  )
                }
                className="btn-primary"
              >
                Download compressed PDF
              </button>
            </StatusPanel>

            {result.mode === 'smart' && result.smartDetails && (
              <div className="card p-4 text-xs text-fg-muted space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle mb-1">
                  What was processed
                </div>
                <div className="flex justify-between">
                  <span>Embedded images found</span>
                  <span className="font-mono text-fg">{result.smartDetails.imagesFound}</span>
                </div>
                <div className="flex justify-between">
                  <span>Recompressed (JPEG / PNG)</span>
                  <span className="font-mono text-fg">
                    {result.smartDetails.imagesFormats.jpeg} / {result.smartDetails.imagesFormats.flate}
                  </span>
                </div>
                {result.smartDetails.imagesFormats.other > 0 && (
                  <div className="flex justify-between text-fg-subtle">
                    <span>Skipped (unsupported format)</span>
                    <span className="font-mono">{result.smartDetails.imagesFormats.other}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Replaced (output smaller)</span>
                  <span className="font-mono text-fg">{result.smartDetails.imagesReplaced}</span>
                </div>
                {result.smartDetails.metadataStripped && (
                  <div className="flex justify-between text-fg-subtle">
                    <span>Metadata / thumbnails / attachments</span>
                    <span className="font-mono">stripped</span>
                  </div>
                )}
              </div>
            )}

            {result.mode === 'hybrid' && result.hybridDetails && (
              <div className="card p-4 text-xs text-fg-muted space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle mb-1">
                  Compact mode details
                </div>
                <div className="flex justify-between">
                  <span>Pages rasterized</span>
                  <span className="font-mono text-fg">{result.hybridDetails.pages}</span>
                </div>
                <div className="flex justify-between">
                  <span>Text items kept selectable</span>
                  <span className="font-mono text-fg">
                    {result.hybridDetails.textItemsOverlaid.toLocaleString()}
                  </span>
                </div>
                {result.hybridDetails.textItemsSkipped > 0 && (
                  <div className="flex justify-between text-fg-subtle">
                    <span>Text items visual-only (non-Latin)</span>
                    <span className="font-mono">
                      {result.hybridDetails.textItemsSkipped.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            )}

            {isPoorSmart && (
              <div className="card p-4 border-amber-500/30 bg-amber-500/5 space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-xs text-fg-muted leading-relaxed">
                    <strong className="text-fg">Not much in the images.</strong>{' '}
                    {result.smartDetails && result.smartDetails.imagesFound === 0
                      ? "This PDF has no embedded raster images."
                      : 'The embedded images were small. The bulk is likely fonts (especially CJK) or content streams.'}{' '}
                    Try a more aggressive mode below.
                  </div>
                </div>

                <div className="space-y-2">
                  <button
                    onClick={runHybrid}
                    disabled={running}
                    className="btn-secondary w-full"
                  >
                    <Layers className="w-4 h-4" />
                    Compact (text stays selectable, much smaller)
                  </button>
                  <p className="text-[11px] text-fg-subtle leading-relaxed pl-1">
                    Renders each page as an image at 144 DPI and overlays the original text behind it so you can still select & copy. Works regardless of which fonts the PDF uses — that's why it shrinks CJK-heavy files dramatically.
                  </p>
                </div>

                <div className="space-y-2 pt-1">
                  <button
                    onClick={runMaximum}
                    disabled={running}
                    className="btn-secondary w-full"
                  >
                    <Minimize2 className="w-4 h-4" />
                    Maximum (text becomes raster)
                  </button>
                  <p className="text-[11px] text-fg-subtle leading-relaxed pl-1">
                    Smallest possible file but no selectable text. Last resort.
                  </p>
                </div>
              </div>
            )}

            {result.mode === 'hybrid' && (
              <div className="card p-3 flex items-start gap-2">
                <FileText className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <p className="text-[11px] text-fg-muted leading-relaxed">
                  Each page is now a 144 DPI JPEG with the original text invisible behind it.
                  Most text is selectable & searchable. Non-Latin characters remain visible in
                  the image but aren't selectable.
                </p>
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
