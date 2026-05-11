import { useState } from 'react'
import {
  Sparkles,
  Sliders,
  Image as ImageIcon,
  Palette,
  FileText,
  Layers,
  AlertCircle,
} from 'lucide-react'
import { ToolHeader } from '../components/shared/ToolHeader'
import { FileDrop } from '../components/shared/FileDrop'
import { FilePill } from '../components/shared/FilePill'
import { OptionGroup, Segmented } from '../components/shared/OptionGroup'
import { ProgressBar } from '../components/ProgressBar'
import { StatusPanel } from '../components/shared/StatusPanel'
import {
  compressPdfByRasterization,
  compressPdfSmart,
  getPageCount,
  type CompressOptions,
  type SmartCompressOptions,
  type SmartCompressResult,
} from '../lib/pdfOps'
import { downloadBlob, formatBytes, bytesToBlob } from '../lib/download'
import { stripExtension } from '../lib/converter'
import { TOOLS } from './registry'

const meta = TOOLS.find((t) => t.id === 'compress')!

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
  const [mode, setMode] = useState<Mode>('smart')
  const [smartOpts, setSmartOpts] = useState<SmartCompressOptions>({
    imageQuality: 0.7,
    maxImagePx: 1600,
    onlyShrink: true,
  })
  const [maxOpts, setMaxOpts] = useState<CompressOptions>({
    imageDpi: 150,
    imageQuality: 0.7,
    grayscale: false,
  })
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

  const run = async () => {
    if (!file) return
    setRunning(true)
    setResult(null)
    try {
      if (mode === 'smart') {
        const out = await compressPdfSmart(file, smartOpts, (c, t) =>
          setProgress({ c, t, label: `Recompressing image ${c} of ${t}...` }),
        )
        const blob = bytesToBlob(out.bytes, 'application/pdf')
        setResult({
          blob,
          size: blob.size,
          oldSize: out.originalSize,
          mode: 'smart',
          details: out,
        })
      } else {
        const bytes = await compressPdfByRasterization(file, maxOpts, (c, t) =>
          setProgress({ c, t, label: `Rasterizing page ${c} of ${t}...` }),
        )
        const blob = bytesToBlob(bytes, 'application/pdf')
        setResult({ blob, size: blob.size, oldSize: file.size, mode: 'maximum' })
      }
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
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-80 shrink-0 border-r border-border bg-bg-subtle/30 overflow-y-auto p-5 space-y-6">
          <FilePill
            file={file}
            detail={pageCount ? `${pageCount} pages` : undefined}
            onRemove={() => {
              setFile(null)
              setResult(null)
            }}
          />

          <OptionGroup
            icon={Layers}
            title="Mode"
            hint={
              mode === 'smart'
                ? 'Keeps text selectable. Only recompresses embedded images.'
                : 'Maximum size reduction. Text becomes raster (not selectable).'
            }
          >
            <Segmented
              value={mode}
              options={[
                { value: 'smart', label: 'Smart' },
                { value: 'maximum', label: 'Maximum' },
              ]}
              onChange={(v) => {
                setMode(v as Mode)
                setResult(null)
              }}
              disabled={running}
            />
          </OptionGroup>

          {mode === 'smart' ? (
            <>
              <OptionGroup icon={ImageIcon} title="Image Quality">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-fg-muted">JPEG quality</span>
                  <span className="font-mono text-fg">
                    {Math.round(smartOpts.imageQuality * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.3}
                  max={0.95}
                  step={0.05}
                  value={smartOpts.imageQuality}
                  onChange={(e) =>
                    setSmartOpts({ ...smartOpts, imageQuality: Number(e.target.value) })
                  }
                  disabled={running}
                  className="w-full"
                />
              </OptionGroup>

              <OptionGroup
                icon={Sliders}
                title="Max Image Dimension"
                hint="Downsamples oversized images (largest side, in pixels). 0 = no limit."
              >
                <Segmented
                  value={smartOpts.maxImagePx}
                  options={[
                    { value: 0, label: 'None' },
                    { value: 1200, label: '1200' },
                    { value: 1600, label: '1600' },
                    { value: 2400, label: '2400' },
                  ]}
                  onChange={(v) => setSmartOpts({ ...smartOpts, maxImagePx: v })}
                  disabled={running}
                />
              </OptionGroup>

              <div className="card p-3 flex items-start gap-2">
                <FileText className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <p className="text-[11px] text-fg-muted leading-relaxed">
                  <strong className="text-fg">Smart mode</strong> preserves text, fonts, and vectors. Only embedded photos and screenshots get recompressed. PDFs without big images won't shrink much — that's a feature, not a bug.
                </p>
              </div>
            </>
          ) : (
            <>
              <OptionGroup icon={Sliders} title="Image DPI" hint="Lower = smaller file, lower visual quality">
                <Segmented
                  value={maxOpts.imageDpi}
                  options={[72, 96, 150, 200, 300].map((v) => ({ value: v, label: `${v}` }))}
                  onChange={(v) => setMaxOpts({ ...maxOpts, imageDpi: v })}
                  disabled={running}
                />
              </OptionGroup>

              <OptionGroup icon={ImageIcon} title="JPEG Quality">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-fg-muted">Quality</span>
                  <span className="font-mono text-fg">{Math.round(maxOpts.imageQuality * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.3}
                  max={0.95}
                  step={0.05}
                  value={maxOpts.imageQuality}
                  onChange={(e) => setMaxOpts({ ...maxOpts, imageQuality: Number(e.target.value) })}
                  disabled={running}
                  className="w-full"
                />
              </OptionGroup>

              <OptionGroup icon={Palette} title="Color">
                <Segmented
                  value={maxOpts.grayscale ? 'gray' : 'color'}
                  options={[
                    { value: 'color', label: 'Color' },
                    { value: 'gray', label: 'Grayscale' },
                  ]}
                  onChange={(v) => setMaxOpts({ ...maxOpts, grayscale: v === 'gray' })}
                  disabled={running}
                />
              </OptionGroup>

              <div className="card p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-fg-muted leading-relaxed">
                  <strong className="text-fg">Maximum mode</strong> rasterizes every page. Text in the output is no longer selectable or searchable. Use only when smart mode doesn't shrink enough and you don't need text.
                </p>
              </div>
            </>
          )}
        </aside>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {progress && <ProgressBar current={progress.c} total={progress.t || 1} label={progress.label} />}
          {result && (
            <StatusPanel
              variant={ratio < 1 ? 'success' : 'info'}
              title={
                ratio < 1
                  ? `Compressed to ${(ratio * 100).toFixed(1)}% of original`
                  : 'No size reduction this time'
              }
              message={
                ratio < 1
                  ? `Saved ${formatBytes(saved)} (${formatBytes(result.oldSize)} → ${formatBytes(result.size)})${
                      result.details
                        ? ` · ${result.details.imagesReplaced}/${result.details.imagesFound} images replaced`
                        : ''
                    }`
                  : result.mode === 'smart' && result.details && result.details.imagesFound === 0
                    ? "This PDF has no embedded images to recompress. Try Maximum mode if you need a smaller file (but text will become raster)."
                    : `${formatBytes(result.oldSize)} → ${formatBytes(result.size)}. Try lower quality or switch modes.`
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
          {!result && !running && (
            <StatusPanel
              variant="info"
              title="Ready to compress"
              message={`${formatBytes(file.size)} · ${pageCount ?? '?'} pages. ${
                mode === 'smart'
                  ? 'Smart mode preserves text and only shrinks embedded images.'
                  : 'Maximum mode rasterizes the whole document.'
              }`}
            />
          )}
        </div>
      </div>
    </div>
  )
}
