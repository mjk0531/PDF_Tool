import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, FolderOpen, Upload, X } from 'lucide-react'
import { formatBytes } from '../../lib/download'
import { useMessages } from '../../i18n'
import commonMessages from '../../i18n/messages/common'

interface Props {
  file: File
  /** Close the file and go back to the drop zone. */
  onRemove?: () => void
  /**
   * Open another file in its place — from the "Open another file" button or
   * by dropping one anywhere in the window.
   */
  onReplace?: (file: File) => void
  /** What a replacement may be (input `accept` syntax); PDFs by default. */
  accept?: string
  /** Asked before closing or replacing (e.g. unsaved edits); return false to cancel. */
  confirm?: () => boolean
  detail?: string
}

function matches(file: File, accept: string): boolean {
  const lower = file.name.toLowerCase()
  return accept
    .split(',')
    .map((s) => s.trim())
    .some((a) => (a.startsWith('.') ? lower.endsWith(a) : a.endsWith('/*') ? file.type.startsWith(a.slice(0, -1)) : file.type === a))
}

export function FilePill({ file, onRemove, onReplace, accept = 'application/pdf,.pdf', confirm, detail }: Props) {
  const c = useMessages(commonMessages)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const replace = useCallback(
    (next: File | undefined) => {
      if (!next || !onReplace || !matches(next, accept)) return
      if (confirm && !confirm()) return
      onReplace(next)
    },
    [onReplace, accept, confirm],
  )

  // With a file open, a file dropped anywhere opens in its place (instead of
  // the browser navigating away to show the dropped PDF itself).
  useEffect(() => {
    if (!onReplace) return
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files')
    const onEnter = (e: DragEvent) => {
      if (hasFiles(e)) setDragging(true)
    }
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      setDragging(false)
      replace(e.dataTransfer?.files[0])
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [onReplace, replace])

  return (
    <div className="rounded-lg bg-bg-elevated border border-border">
      <div className="flex items-center gap-3 p-2.5">
        <div className="w-9 h-9 rounded-md bg-bg-subtle flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4 text-fg-muted" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate" title={file.name}>
            {file.name}
          </div>
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
      </div>

      {(onReplace || onRemove) && (
        <div className="flex border-t border-border">
          {onReplace && (
            <button
              onClick={() => inputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-fg-muted hover:text-fg hover:bg-bg-subtle rounded-bl-lg transition-colors"
              title={c.openAnotherHint}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              {c.openAnother}
            </button>
          )}
          {onRemove && (
            <button
              onClick={() => {
                if (confirm && !confirm()) return
                onRemove()
              }}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-3 text-[11px] font-medium text-fg-muted hover:text-red-600 hover:bg-bg-subtle transition-colors ${
                onReplace ? 'border-l border-border rounded-br-lg' : 'flex-1 rounded-b-lg'
              }`}
              aria-label={c.removeFile}
              title={c.removeFile}
            >
              <X className="w-3.5 h-3.5" />
              {c.closeFile}
            </button>
          )}
        </div>
      )}

      {onReplace && (
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            replace(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      )}

      {dragging && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-accent/10 backdrop-blur-[2px] animate-fade-in"
          onClick={() => setDragging(false)}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => {
            // Left the window (no element under the pointer any more)
            if (!e.relatedTarget) setDragging(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setDragging(false)
            replace(e.dataTransfer.files[0])
          }}
        >
          <div className="pointer-events-none m-6 w-full max-w-xl rounded-2xl border-2 border-dashed border-accent bg-bg-elevated/90 p-10 text-center text-accent shadow-lg">
            <Upload className="w-9 h-9 mx-auto mb-3" strokeWidth={2.25} />
            <div className="text-base font-semibold">{c.dropToReplace}</div>
            <div className="text-xs text-fg-muted mt-1.5 truncate">{c.replacing(file.name)}</div>
          </div>
        </div>
      )}
    </div>
  )
}
