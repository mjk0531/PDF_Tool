import { useState } from 'react'
import { Sparkles, Sliders, Image as ImageIcon, Palette } from 'lucide-react'
import { ToolHeader } from '../components/shared/ToolHeader'
import { FileDrop } from '../components/shared/FileDrop'
import { FilePill } from '../components/shared/FilePill'
import { OptionGroup, Segmented } from '../components/shared/OptionGroup'
import { ProgressBar } from '../components/ProgressBar'
import { StatusPanel } from '../components/shared/StatusPanel'
import { compressPdfByRasterization, getPageCount, type CompressOptions } from '../lib/pdfOps'
import { downloadBlob, formatBytes, bytesToBlob } from '../lib/download'
import { stripExtension } from '../lib/converter'
import { TOOLS } from './registry'

const meta = TOOLS.find((t) => t.id === 'compress')!

export function Compress() {
  const [file, setFile] = useState<File | null>(null)
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [opts, setOpts] = useState<CompressOptions>({
    imageDpi: 150,
    imageQuality: 0.7,
    grayscale: false,
  })
  const [progress, setProgress] = useState<{ c: number; t: number } | null>(null)
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
      const bytes = await compressPdfByRasterization(file, opts, (c, t) => setProgress({ c, t }))
      const blob = bytesToBlob(bytes, 'application/pdf')
      setResult({ blob, size: blob.size, oldSize: file.size })
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

  const ratio = result ? (result.size / result.oldSize) : 0
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
          <FilePill file={file} detail={pageCount ? `${pageCount} pages` : undefined} onRemove={() => { setFile(null); setResult(null) }} />

          <OptionGroup icon={Sliders} title="Image DPI" hint="Lower = smaller file, lower visual quality">
            <Segmented
              value={opts.imageDpi}
              options={[72, 96, 150, 200, 300].map((v) => ({ value: v, label: `${v}` }))}
              onChange={(v) => setOpts({ ...opts, imageDpi: v })}
              disabled={running}
            />
          </OptionGroup>

          <OptionGroup icon={ImageIcon} title="JPEG Quality">
            <div className="flex items-center justify-between text-xs">
              <span className="text-fg-muted">Quality</span>
              <span className="font-mono text-fg">{Math.round(opts.imageQuality * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.3}
              max={0.95}
              step={0.05}
              value={opts.imageQuality}
              onChange={(e) => setOpts({ ...opts, imageQuality: Number(e.target.value) })}
              disabled={running}
              className="w-full"
            />
          </OptionGroup>

          <OptionGroup icon={Palette} title="Color">
            <Segmented
              value={opts.grayscale ? 'gray' : 'color'}
              options={[
                { value: 'color', label: 'Color' },
                { value: 'gray', label: 'Grayscale' },
              ]}
              onChange={(v) => setOpts({ ...opts, grayscale: v === 'gray' })}
              disabled={running}
            />
          </OptionGroup>

          <p className="text-[11px] text-fg-subtle leading-relaxed">
            Compression rasterizes pages as JPEG. Best for image-heavy or scanned PDFs. Text becomes raster (not selectable in output).
          </p>
        </aside>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {progress && <ProgressBar current={progress.c} total={progress.t} label="Compressing pages..." />}
          {result && (
            <StatusPanel
              variant={ratio < 1 ? 'success' : 'info'}
              title={ratio < 1 ? `Compressed to ${(ratio * 100).toFixed(1)}% of original` : 'Result is larger than the original'}
              message={
                ratio < 1
                  ? `Saved ${formatBytes(saved)} (${formatBytes(result.oldSize)} → ${formatBytes(result.size)})`
                  : `Try lower DPI or quality. Original ${formatBytes(result.oldSize)} → ${formatBytes(result.size)}`
              }
            >
              <button
                onClick={() => downloadBlob(result.blob, `${stripExtension(file.name)}_compressed.pdf`)}
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
              message={`${formatBytes(file.size)} · ${pageCount ?? '?'} pages. Adjust DPI and quality, then click Compress.`}
            />
          )}
        </div>
      </div>
    </div>
  )
}
