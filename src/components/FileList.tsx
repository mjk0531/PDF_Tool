import { FileText, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { formatBytes } from '../lib/download'
import type { PdfFile } from '../types'

interface Props {
  files: PdfFile[]
  selectedId: string | null
  onSelect: (id: string) => void
  onRemove: (id: string) => void
}

export function FileList({ files, selectedId, onSelect, onRemove }: Props) {
  if (files.length === 0) return null

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
          Files ({files.length})
        </span>
      </div>
      <ul className="space-y-1">
        {files.map((f) => {
          const isSelected = f.id === selectedId
          return (
            <li key={f.id}>
              <div
                onClick={() => onSelect(f.id)}
                className={`
                  group relative flex items-center gap-3 p-2.5 rounded-lg cursor-pointer
                  transition-all duration-150 border
                  ${
                    isSelected
                      ? 'bg-accent/10 border-accent/30'
                      : 'bg-bg-elevated border-border hover:border-border-strong'
                  }
                `}
              >
                <div
                  className={`
                    w-9 h-9 rounded-md flex items-center justify-center shrink-0
                    ${isSelected ? 'bg-accent/15 text-accent' : 'bg-bg-subtle text-fg-muted'}
                  `}
                >
                  {f.status === 'loading' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : f.status === 'error' ? (
                    <AlertCircle className="w-4 h-4 text-red-500" />
                  ) : f.status === 'converting' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : f.status === 'done' ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{f.file.name}</div>
                  <div className="text-[11px] text-fg-subtle flex items-center gap-2">
                    <span>{formatBytes(f.file.size)}</span>
                    {f.totalPages !== null && (
                      <>
                        <span className="text-fg-subtle/50">·</span>
                        <span>{f.totalPages} pages</span>
                      </>
                    )}
                    {f.error && (
                      <>
                        <span className="text-fg-subtle/50">·</span>
                        <span className="text-red-500 truncate">{f.error}</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemove(f.id)
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-bg-subtle"
                  aria-label="Remove file"
                >
                  <X className="w-3.5 h-3.5 text-fg-muted" />
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
