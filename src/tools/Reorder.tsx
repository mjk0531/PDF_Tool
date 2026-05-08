import { useEffect, useState } from 'react'
import { Sparkles, ArrowLeft, ArrowRight, X, Loader2 } from 'lucide-react'
import { ToolHeader } from '../components/shared/ToolHeader'
import { FileDrop } from '../components/shared/FileDrop'
import { FilePill } from '../components/shared/FilePill'
import { StatusPanel } from '../components/shared/StatusPanel'
import { getPageCount, renderThumbnail, reorderPages } from '../lib/pdfOps'
import { downloadBlob, formatBytes, bytesToBlob } from '../lib/download'
import { stripExtension } from '../lib/converter'
import { TOOLS } from './registry'

const meta = TOOLS.find((t) => t.id === 'reorder')!

interface PageItem {
  id: string
  originalNumber: number
  thumbnail: string | null
  removed: boolean
}

export function Reorder() {
  const [file, setFile] = useState<File | null>(null)
  const [pages, setPages] = useState<PageItem[]>([])
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<Blob | null>(null)

  useEffect(() => {
    if (!file) return
    let cancelled = false
    ;(async () => {
      try {
        const total = await getPageCount(file)
        const items: PageItem[] = Array.from({ length: total }, (_, i) => ({
          id: `${i}-${Math.random().toString(36).slice(2, 6)}`,
          originalNumber: i + 1,
          thumbnail: null,
          removed: false,
        }))
        if (cancelled) return
        setPages(items)
        for (let i = 0; i < total; i++) {
          if (cancelled) return
          try {
            const thumb = await renderThumbnail(file, i + 1, 160)
            if (cancelled) return
            setPages((prev) =>
              prev.map((p) => (p.originalNumber === i + 1 ? { ...p, thumbnail: thumb } : p)),
            )
          } catch {
            // skip
          }
        }
      } catch {
        // skip
      }
    })()
    return () => {
      cancelled = true
    }
  }, [file])

  const onFiles = (files: File[]) => {
    setFile(files[0])
    setResult(null)
    setPages([])
  }

  const move = (idx: number, dir: -1 | 1) => {
    setPages((prev) => {
      const next = [...prev]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  const toggleRemove = (id: string) => {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, removed: !p.removed } : p)))
  }

  const reset = () => {
    setPages((prev) =>
      [...prev]
        .sort((a, b) => a.originalNumber - b.originalNumber)
        .map((p) => ({ ...p, removed: false })),
    )
  }

  const run = async () => {
    if (!file) return
    const order = pages.filter((p) => !p.removed).map((p) => p.originalNumber)
    if (order.length === 0) {
      alert('At least one page must remain')
      return
    }
    setRunning(true)
    setResult(null)
    try {
      const bytes = await reorderPages(file, order)
      setResult(bytesToBlob(bytes, 'application/pdf'))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Reorder failed')
    } finally {
      setRunning(false)
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

  const kept = pages.filter((p) => !p.removed).length

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ToolHeader
        icon={meta.icon}
        title={meta.name}
        description={meta.description}
        rightSlot={
          <div className="flex items-center gap-2">
            <button onClick={reset} disabled={running} className="btn-secondary text-xs">
              Reset
            </button>
            <button onClick={run} disabled={running || pages.length === 0} className="btn-primary">
              <Sparkles className={`w-4 h-4 ${running ? 'animate-pulse' : ''}`} />
              {running ? 'Building...' : `Save (${kept}/${pages.length})`}
            </button>
          </div>
        }
      />

      <div className="px-6 py-3 border-b border-border bg-bg-subtle/30">
        <FilePill
          file={file}
          detail={`${kept}/${pages.length} pages kept`}
          onRemove={() => { setFile(null); setPages([]) }}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {pages.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-fg-muted text-sm">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Loading pages...
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
            {pages.map((p, idx) => (
              <div
                key={p.id}
                className={`
                  card overflow-hidden transition-all relative group
                  ${p.removed ? 'opacity-30' : 'hover:border-border-strong'}
                `}
              >
                <div className="aspect-[3/4] bg-bg-subtle flex items-center justify-center">
                  {p.thumbnail ? (
                    <img
                      src={p.thumbnail}
                      alt={`Page ${p.originalNumber}`}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <Loader2 className="w-5 h-5 text-fg-subtle animate-spin" />
                  )}
                </div>
                <div className="p-2 flex items-center justify-between text-xs">
                  <span className="font-mono text-fg-muted">#{idx + 1}</span>
                  <span className="text-fg-subtle">orig p{p.originalNumber}</span>
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-between">
                  <div className="flex justify-end">
                    <button
                      onClick={() => toggleRemove(p.id)}
                      className="btn bg-red-500/90 text-white p-1.5 rounded-md"
                      title={p.removed ? 'Restore' : 'Remove'}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                      className="btn-primary flex-1 py-1 text-xs disabled:opacity-30"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => move(idx, 1)}
                      disabled={idx === pages.length - 1}
                      className="btn-primary flex-1 py-1 text-xs disabled:opacity-30"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {result && (
          <div className="mt-6">
            <StatusPanel
              variant="success"
              title="Saved successfully"
              message={`${formatBytes(result.size)} · ${kept} pages`}
            >
              <button
                onClick={() => downloadBlob(result, `${stripExtension(file.name)}_reordered.pdf`)}
                className="btn-primary"
              >
                Download
              </button>
            </StatusPanel>
          </div>
        )}
      </div>
    </div>
  )
}
