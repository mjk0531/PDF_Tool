import { useState } from 'react'
import { Sparkles, ArrowUp, ArrowDown, X, Image as ImageIcon, Maximize2 } from 'lucide-react'
import { ToolHeader } from '../components/shared/ToolHeader'
import { FileDrop } from '../components/shared/FileDrop'
import { DropOverlay } from '../components/shared/DropOverlay'
import { OptionGroup, Segmented } from '../components/shared/OptionGroup'
import { StatusPanel } from '../components/shared/StatusPanel'
import { imagesToPdf, type ImageToPdfOptions } from '../lib/pdfOps'
import { downloadBlob, formatBytes, bytesToBlob } from '../lib/download'
import { TOOLS } from './registry'

const meta = TOOLS.find((t) => t.id === 'image-to-pdf')!

interface Entry {
  id: string
  file: File
  preview: string
}

export function ImageToPdf() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [opts, setOpts] = useState<ImageToPdfOptions>({
    pageSize: 'a4',
    orientation: 'auto',
    margin: 36,
    fit: 'fit',
  })
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<Blob | null>(null)

  const onFiles = (files: File[]) => {
    const newEntries: Entry[] = files.map((file) => ({
      id: Math.random().toString(36).slice(2),
      file,
      preview: URL.createObjectURL(file),
    }))
    setEntries((prev) => [...prev, ...newEntries])
    setResult(null)
  }

  const move = (idx: number, dir: -1 | 1) => {
    setEntries((prev) => {
      const next = [...prev]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  const remove = (id: string) => {
    setEntries((prev) => {
      const found = prev.find((e) => e.id === id)
      if (found) URL.revokeObjectURL(found.preview)
      return prev.filter((e) => e.id !== id)
    })
  }

  const run = async () => {
    if (entries.length === 0) return
    setRunning(true)
    setResult(null)
    try {
      const bytes = await imagesToPdf(
        entries.map((e) => e.file),
        opts,
      )
      setResult(bytesToBlob(bytes, 'application/pdf'))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Conversion failed')
    } finally {
      setRunning(false)
    }
  }

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex flex-col">
        <ToolHeader icon={meta.icon} title={meta.name} description={meta.description} />
        <FileDrop
          onFiles={onFiles}
          accept="image/jpeg,image/png,.jpg,.jpeg,.png"
          acceptLabel="image files"
          description="Drop JPG or PNG images. Order matches drop order."
        />
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
          <button onClick={run} disabled={running} className="btn-primary">
            <Sparkles className={`w-4 h-4 ${running ? 'animate-pulse' : ''}`} />
            {running ? 'Building...' : `Build PDF (${entries.length})`}
          </button>
        }
      />

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-80 shrink-0 border-r border-border bg-bg-subtle/30 overflow-y-auto p-5 space-y-6">
          <OptionGroup icon={ImageIcon} title="Page Size">
            <Segmented
              value={opts.pageSize}
              options={[
                { value: 'a4', label: 'A4' },
                { value: 'letter', label: 'Letter' },
                { value: 'auto', label: 'Image size' },
              ]}
              onChange={(v) => setOpts({ ...opts, pageSize: v as ImageToPdfOptions['pageSize'] })}
              disabled={running}
            />
          </OptionGroup>

          {opts.pageSize !== 'auto' && (
            <OptionGroup title="Orientation">
              <Segmented
                value={opts.orientation}
                options={[
                  { value: 'portrait', label: 'Portrait' },
                  { value: 'landscape', label: 'Landscape' },
                  { value: 'auto', label: 'Auto' },
                ]}
                onChange={(v) =>
                  setOpts({ ...opts, orientation: v as ImageToPdfOptions['orientation'] })
                }
                disabled={running}
              />
            </OptionGroup>
          )}

          <OptionGroup icon={Maximize2} title="Fit">
            <Segmented
              value={opts.fit}
              options={[
                { value: 'fit', label: 'Fit' },
                { value: 'fill', label: 'Fill' },
                { value: 'original', label: 'Original' },
              ]}
              onChange={(v) => setOpts({ ...opts, fit: v as ImageToPdfOptions['fit'] })}
              disabled={running}
            />
          </OptionGroup>

          <OptionGroup title="Margin (points)">
            <input
              type="number"
              min={0}
              max={144}
              value={opts.margin}
              onChange={(e) => setOpts({ ...opts, margin: Math.max(0, Number(e.target.value) || 0) })}
              disabled={running}
              className="input w-full text-xs"
            />
          </OptionGroup>
        </aside>

        <DropOverlay
          onFiles={onFiles}
          accept="image/jpeg,image/png,.jpg,.jpeg,.png"
          acceptLabel="images"
          className="flex-1 min-h-0"
        >
          <div className="h-full overflow-y-auto p-6 space-y-4">
          <FileDrop
            onFiles={onFiles}
            compact
            noDrag
            accept="image/jpeg,image/png,.jpg,.jpeg,.png"
            acceptLabel="more images"
          />
          <ul className="space-y-1.5">
            {entries.map((e, idx) => (
              <li key={e.id} className="card p-3 flex items-center gap-3 animate-slide-up">
                <div className="w-7 h-7 rounded-md bg-accent/10 text-accent flex items-center justify-center text-xs font-bold shrink-0">
                  {idx + 1}
                </div>
                <img
                  src={e.preview}
                  alt={e.file.name}
                  className="w-12 h-12 object-cover rounded-md bg-bg-subtle"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{e.file.name}</div>
                  <div className="text-[11px] text-fg-subtle">{formatBytes(e.file.size)}</div>
                </div>
                <div className="flex items-center gap-0.5">
                  <button onClick={() => move(idx, -1)} disabled={idx === 0} className="btn-ghost p-1.5">
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => move(idx, 1)}
                    disabled={idx === entries.length - 1}
                    className="btn-ghost p-1.5"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => remove(e.id)} className="btn-ghost p-1.5">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {result && (
            <StatusPanel
              variant="success"
              title="PDF created"
              message={`${formatBytes(result.size)} · ${entries.length} pages`}
            >
              <button onClick={() => downloadBlob(result, 'images.pdf')} className="btn-primary">
                Download images.pdf
              </button>
            </StatusPanel>
          )}
          </div>
        </DropOverlay>
      </div>
    </div>
  )
}
