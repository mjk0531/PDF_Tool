import { useState } from 'react'
import { Sparkles, GripVertical, X, ArrowUp, ArrowDown } from 'lucide-react'
import { ToolHeader } from '../components/shared/ToolHeader'
import { FileDrop } from '../components/shared/FileDrop'
import { StatusPanel } from '../components/shared/StatusPanel'
import { mergePdfs, getPageCount } from '../lib/pdfOps'
import { downloadBlob, formatBytes, bytesToBlob } from '../lib/download'
import { TOOLS } from './registry'

const meta = TOOLS.find((t) => t.id === 'merge')!

interface FileEntry {
  file: File
  pageCount: number | null
  id: string
}

export function Merge() {
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<Blob | null>(null)

  const addFiles = async (files: File[]) => {
    const newEntries: FileEntry[] = files.map((file) => ({
      file,
      pageCount: null,
      id: Math.random().toString(36).slice(2),
    }))
    setEntries((prev) => [...prev, ...newEntries])
    setResult(null)
    for (const e of newEntries) {
      try {
        const pc = await getPageCount(e.file)
        setEntries((prev) => prev.map((x) => (x.id === e.id ? { ...x, pageCount: pc } : x)))
      } catch {
        // skip
      }
    }
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
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }

  const run = async () => {
    if (entries.length < 2) return
    setRunning(true)
    setResult(null)
    try {
      const bytes = await mergePdfs(entries.map((e) => e.file))
      setResult(bytesToBlob(bytes, 'application/pdf'))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Merge failed')
    } finally {
      setRunning(false)
    }
  }

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex flex-col">
        <ToolHeader icon={meta.icon} title={meta.name} description={meta.description} />
        <FileDrop onFiles={addFiles} description="Drop two or more PDFs to merge in order" />
      </div>
    )
  }

  const totalPages = entries.reduce((s, e) => s + (e.pageCount ?? 0), 0)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ToolHeader
        icon={meta.icon}
        title={meta.name}
        description={meta.description}
        rightSlot={
          <button onClick={run} disabled={entries.length < 2 || running} className="btn-primary">
            <Sparkles className={`w-4 h-4 ${running ? 'animate-pulse' : ''}`} />
            {running ? 'Merging...' : `Merge ${entries.length} files`}
          </button>
        }
      />
      <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-4xl mx-auto w-full">
        <FileDrop onFiles={addFiles} compact />

        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted mb-2 px-1">
            Order ({entries.length} files · {totalPages} total pages)
          </div>
          <ul className="space-y-1.5">
            {entries.map((e, idx) => (
              <li
                key={e.id}
                className="card p-3 flex items-center gap-3 animate-slide-up"
              >
                <GripVertical className="w-4 h-4 text-fg-subtle shrink-0" />
                <div className="w-7 h-7 rounded-md bg-accent/10 text-accent flex items-center justify-center text-xs font-bold shrink-0">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{e.file.name}</div>
                  <div className="text-[11px] text-fg-subtle">
                    {formatBytes(e.file.size)}
                    {e.pageCount !== null && ` · ${e.pageCount} pages`}
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    className="btn-ghost p-1.5"
                    aria-label="Move up"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => move(idx, 1)}
                    disabled={idx === entries.length - 1}
                    className="btn-ghost p-1.5"
                    aria-label="Move down"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => remove(e.id)}
                    className="btn-ghost p-1.5"
                    aria-label="Remove"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {result && (
          <StatusPanel
            variant="success"
            title="Merged successfully"
            message={`${formatBytes(result.size)} · ${entries.length} files combined`}
          >
            <button
              onClick={() => downloadBlob(result, 'merged.pdf')}
              className="btn-primary"
            >
              Download merged.pdf
            </button>
          </StatusPanel>
        )}
      </div>
    </div>
  )
}
