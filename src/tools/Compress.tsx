import { useState } from 'react'
import { AlertCircle, Loader2, Sparkles } from 'lucide-react'
import { ToolHeader } from '../components/shared/ToolHeader'
import { FileDrop } from '../components/shared/FileDrop'
import { FilePill } from '../components/shared/FilePill'
import { ProgressBar } from '../components/ProgressBar'
import { StatusPanel } from '../components/shared/StatusPanel'
import { Segmented } from '../components/shared/OptionGroup'
import { BreakdownBar } from './compress/BreakdownBar'
import { ImageStatsCard } from './compress/ImageStatsCard'
import { LimitReachedCard } from './compress/LimitReachedCard'
import {
  compressPdf,
  DEFAULT_COMPRESSION_LEVEL,
  forceCompressPdf,
  type CompressionLevel,
  type ImageRecompressStats,
  type StructureBreakdown,
} from '../lib/compress'
import { getPageCount } from '../lib/pdfOps'
import { bytesToBlob, downloadBlob, formatBytes } from '../lib/download'
import { stripExtension } from '../lib/converter'
import { useToolMeta } from './registry'
import { useMessages } from '../i18n'
import commonMessages from '../i18n/messages/common'
import compressMessages from '../i18n/messages/compress'

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
  const meta = useToolMeta('compress')
  const t = useMessages(compressMessages)
  const c = useMessages(commonMessages)
  const [file, setFile] = useState<File | null>(null)
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [level, setLevel] = useState<CompressionLevel>(DEFAULT_COMPRESSION_LEVEL)
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
      const out = await compressPdf(file, level, (status) =>
        setProgress({ kind: 'spinner', status }),
      )
      setResult({
        blob: bytesToBlob(out.bytes, 'application/pdf'),
        outputSize: out.outputSize,
        inputSize: out.originalSize,
        mode: 'smart',
        breakdown: out.breakdown,
        imageStats: out.imageStats,
      })
    } catch (e) {
      alert(e instanceof Error ? e.message : t.failed)
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
      alert(e instanceof Error ? e.message : t.failed)
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
            {running ? t.compressing : t.compress}
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-8 max-w-2xl mx-auto w-full space-y-5">
        <FilePill
          file={file}
          detail={pageCount ? c.pages(pageCount) : undefined}
          onRemove={reset}
        />

        <LevelSelector value={level} onChange={setLevel} disabled={running} />

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
  const t = useMessages(compressMessages).ready
  return (
    <StatusPanel
      variant="info"
      title={t.title}
      message={t.message(formatBytes(inputSize), pageCount)}
    >
      <div className="text-[11px] text-fg-subtle leading-relaxed">
        {t.pipeline}
      </div>
    </StatusPanel>
  )
}

function LevelSelector({
  value,
  onChange,
  disabled,
}: {
  value: CompressionLevel
  onChange: (v: CompressionLevel) => void
  disabled?: boolean
}) {
  const levels = useMessages(compressMessages).levels
  return (
    <div className="space-y-2">
      <Segmented
        value={value}
        options={[
          { value: 'higher-quality', label: levels['higher-quality'].label },
          { value: 'recommended', label: levels.recommended.label },
          { value: 'smaller-size', label: levels['smaller-size'].label },
        ]}
        onChange={onChange}
        disabled={disabled}
      />
      <p className="text-[11px] text-fg-subtle leading-relaxed px-1">{levels[value].hint}</p>
    </div>
  )
}

function ProgressView({ progress }: { progress: Progress }) {
  const t = useMessages(compressMessages)
  if (progress.kind === 'bar') {
    return <ProgressBar current={progress.current} total={progress.total || 1} label={progress.label} />
  }
  return (
    <div className="card p-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <Loader2 className="w-5 h-5 text-accent animate-spin shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">{progress.status}</div>
          <div className="text-xs text-fg-muted mt-0.5">{t.largeFileHint}</div>
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
  const t = useMessages(compressMessages).result
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
        title={shrank ? t.compressedTo((ratio * 100).toFixed(1)) : t.noReduction}
        message={
          shrank
            ? t.saved(formatBytes(saved), formatBytes(result.inputSize), formatBytes(result.outputSize))
            : t.alreadyOptimized(formatBytes(result.inputSize), formatBytes(result.outputSize))
        }
      >
        <button onClick={() => downloadBlob(result.blob, downloadName)} className="btn-primary">
          {t.download}
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
  const t = useMessages(compressMessages)
  return (
    <div className="card p-3 flex items-start gap-2">
      <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
      <p className="text-[11px] text-fg-muted leading-relaxed">
        {t.rasterizedNote}
      </p>
    </div>
  )
}

