import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Upload } from 'lucide-react'

interface Props {
  onFiles: (files: File[]) => void
  accept?: string
  acceptLabel?: string
  multiple?: boolean
  filterFn?: (file: File) => boolean
  className?: string
  children: ReactNode
}

/**
 * Wraps an arbitrary region and turns the whole area into a file drop target.
 * A dashed overlay is shown while files are dragged over it. Unlike FileDrop,
 * this renders no button of its own — it just makes an existing section (e.g. a
 * file list) accept drops. Pair it with a `noDrag` FileDrop for click-to-browse.
 */
export function DropOverlay({
  onFiles,
  accept = 'application/pdf,.pdf',
  acceptLabel = 'files',
  multiple = true,
  filterFn,
  className = '',
  children,
}: Props) {
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)

  const matchAccept = useCallback(
    (f: File) => {
      if (filterFn) return filterFn(f)
      const lower = f.name.toLowerCase()
      const exts = accept.split(',').map((s) => s.trim()).filter((s) => s.startsWith('.'))
      const mimes = accept.split(',').map((s) => s.trim()).filter((s) => !s.startsWith('.'))
      if (mimes.some((m) => f.type === m)) return true
      if (exts.some((e) => lower.endsWith(e))) return true
      return false
    },
    [accept, filterFn],
  )

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current += 1
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current -= 1
    if (dragCounter.current <= 0) {
      dragCounter.current = 0
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current = 0
      setIsDragging(false)
      const files = Array.from(e.dataTransfer.files).filter(matchAccept)
      if (files.length > 0) onFiles(multiple ? files : [files[0]])
    },
    [multiple, onFiles, matchAccept],
  )

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`relative ${className}`}
    >
      {children}
      {isDragging && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent/10 backdrop-blur-[2px] pointer-events-none animate-fade-in">
          <div className="flex flex-col items-center gap-2 text-accent">
            <Upload className="w-8 h-8" strokeWidth={2.25} />
            <span className="text-sm font-semibold">Drop {acceptLabel} to add</span>
          </div>
        </div>
      )}
    </div>
  )
}
