import { useState } from 'react'
import { AlertCircle, Loader2, Sparkles } from 'lucide-react'
import { ToolHeader } from '../components/shared/ToolHeader'
import { FileDrop } from '../components/shared/FileDrop'
import { FilePill } from '../components/shared/FilePill'
import { ProgressBar } from '../components/ProgressBar'
import { StatusPanel } from '../components/shared/StatusPanel'
import { BreakdownBar } from './compress/BreakdownBar'
import { ImageStatsCard } from './compress/ImageStatsCard'
import { LimitReachedCard } from './compress/LimitReachedCard'
import {
  compressPdf,
  forceCompressPdf,
  type ImageRecompressStats,
  type StructureBreakdown,
} from '../lib/compress'
import { getPageCount } from '../lib/pdfOps'
import { bytesToBlob, downloadBlob, formatBytes } from '../lib/download'
import { stripExtension } from '../lib/converter'
import { TOOLS } from './registry'

const meta = TOOLS.find((t) => t.id === 'compress')!

/** Smart-compress result is considered "poor" if output is >80% of input. */
const POOR_RESULT_THRESHOLD = 0.8

type Mode = 'smart' | 'force'

interface CompressionState {
  blob: Blob
  outputSize: number
  inputSize: number
  mode: Mode
  breakdown?: StructureBreakdown
  imageStats?: ImageRecompressStats
}

interface SpinnerProgress {
  kind: 'spinner'
  status: string
}
interface BarProgress {
  kind: 'bar'
  current: number
  total: number
  label: string
}
type Progress = SpinnerProgress | BarProgress

export function Compress() {
  const [file, setFile] = useState<File | null>(null)
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
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

  const reset = () => {
    setFile(null)
    setResult(null)
    setPageCount(null)
  }

  const runSmart = async () => {
    if (!file) return
    setRunning(true)
    setResult(null)
    try {
      const out = await compressPdf(file, (status) => setProgress({ kind: 'spinner', status }))
      setResult({
        blob: bytesToBlob(out.bytes, 'application/pdf'),
        outputSize: out.outputSize,
        inputSize: out.originalSize,
        mode: 'smart',
        breakdown: out.breakdown,
        imageStats: out.imageStats,
      })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Compression failed')
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  const runForce = async () => {
    if (!file) return
    setRunning(true)
    setResult(null)
    try {
      const out = await forceCompressPdf(file, undefined, (current, total, label) =>
        setProgress({ kind: 'bar', current, total, label }),
      )
      setResult({
        blob: bytesToBlob(out.bytes, 'application/pdf'),
        outputSize: out.outputSize,
        inputSize: out.originalSize,
        mode: 'force',
      })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Compression failed')
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  /* ---------- Render ---------- */

  if (!file) {
    return (
      <div className="flex-1 flex flex-col">
        <ToolHeader icon={meta.icon} title={meta.name} description={meta.description} />
        <FileDrop onFiles={onFiles} multiple={false} />
      </div>
    )
  }

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
          onRemove={reset}
        />

        {!result && !running && (
          <ReadyPanel inputSize={file.size} pageCount={pageCount} />
        )}

        {progress && <ProgressView progress={progress} />}

        {result && (
          <ResultView
            file={file}
            result={result}
            running={running}
            onForceCompress={runForce}
          />
        )}
      </div>
    </div>
  )
}

/* ---------- Sub-views ---------- */

function ReadyPanel({ inputSize, pageCount }: { inputSize: number; pageCount: number | null }) {
  return (
    <StatusPanel
      variant="info"
      title="Ready to compress"
      message={`${formatBytes(inputSize)} · ${pageCount ?? '?'} pages. Press Compress in the top right.`}
    >
      <div className="text-[11px] text-fg-subtle leading-relaxed">
        Two-phase pipeline: image recompression in pdf-lib, then a MuPDF structural pass
        (font subsetting, garbage collection, stream cleanup). MuPDF's ~12 MB WASM engine
        downloads the first time you compress and is cached afterward.
      </div>
    </StatusPanel>
  )
}

function ProgressView({ progress }: { progress: Progress }) {
  if (progress.kind === 'bar') {
    return <ProgressBar current={progress.current} total={progress.total || 1} label={progress.label} />
  }
  return (
    <div className="card p-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <Loader2 className="w-5 h-5 text-accent animate-spin shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">{progress.status}</div>
          <div className="text-xs text-fg-muted mt-0.5">Large files may take 30 seconds or more.</div>
        </div>
      </div>
    </div>
  )
}

function ResultView({
  file,
  result,
  running,
  onForceCompress,
}: {
  file: File
  result: CompressionState
  running: boolean
  onForceCompress: () => void
}) {
  const ratio = result.outputSize / result.inputSize
  const saved = result.inputSize - result.outputSize
  const shrank = ratio < 1
  const isPoorSmart = result.mode === 'smart' && ratio > POOR_RESULT_THRESHOLD
  const downloadName = `${stripExtension(file.name)}_${
    result.mode === 'force' ? 'rasterized' : 'compressed'
  }.pdf`

  return (
    <>
      <StatusPanel
        variant={shrank ? 'success' : 'info'}
        title={
          shrank
            ? `Compressed to ${(ratio * 100).toFixed(1)}% of original`
            : 'No size reduction possible'
        }
        message={
          shrank
            ? `Saved ${formatBytes(saved)} · ${formatBytes(result.inputSize)} → ${formatBytes(result.outputSize)}`
            : `${formatBytes(result.inputSize)} → ${formatBytes(result.outputSize)} — this PDF is already optimized.`
        }
      >
        <button onClick={() => downloadBlob(result.blob, downloadName)} className="btn-primary">
          Download compressed PDF
        </button>
      </StatusPanel>

      {result.imageStats && <ImageStatsCard stats={result.imageStats} />}
      {result.breakdown && <BreakdownBar breakdown={result.breakdown} />}

      {isPoorSmart && result.breakdown && (
        <LimitReachedCard
          breakdown={result.breakdown}
          onForceCompress={onForceCompress}
          disabled={running}
        />
      )}

      {result.mode === 'force' && <RasterizedNote />}
    </>
  )
}

function RasterizedNote() {
  return (
    <div className="card p-3 flex items-start gap-2">
      <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
      <p className="text-[11px] text-fg-muted leading-relaxed">
        Output is image-only. Text is no longer selectable. Any digital signatures or form fields
        from the original are not in this file.
      </p>
    </div>
  )
}

