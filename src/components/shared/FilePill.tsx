import { FileText, X } from 'lucide-react'
import { formatBytes } from '../../lib/download'

interface Props {
  file: File
  onRemove?: () => void
  detail?: string
}

export function FilePill({ file, onRemove, detail }: Props) {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-bg-elevated border border-border group">
      <div className="w-9 h-9 rounded-md bg-bg-subtle flex items-center justify-center shrink-0">
        <FileText className="w-4 h-4 text-fg-muted" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{file.name}</div>
        <div className="text-[11px] text-fg-subtle">
          {formatBytes(file.size)}
          {detail && (
            <>
              <span className="text-fg-subtle/50 mx-1.5">·</span>
              {detail}
            </>
          )}
        </div>
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-bg-subtle"
        >
          <X className="w-3.5 h-3.5 text-fg-muted" />
        </button>
      )}
    </div>
  )
}
