import { useCallback, useRef, useState } from 'react'
import { Upload, FileText } from 'lucide-react'

interface Props {
  onFiles: (files: File[]) => void
  hasFiles: boolean
}

export function DropZone({ onFiles, hasFiles }: Props) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current += 1
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true)
    }
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
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current = 0
      setIsDragging(false)
      const files = Array.from(e.dataTransfer.files).filter(
        (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
      )
      if (files.length > 0) onFiles(files)
    },
    [onFiles],
  )

  const handleSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : []
      if (files.length > 0) onFiles(files)
      e.target.value = ''
    },
    [onFiles],
  )

  if (hasFiles) {
    return (
      <button
        onClick={() => inputRef.current?.click()}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`
          w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg
          border border-dashed transition-all duration-200
          ${
            isDragging
              ? 'border-accent bg-accent/5 text-accent'
              : 'border-border hover:border-border-strong text-fg-muted hover:text-fg hover:bg-bg-subtle'
          }
        `}
      >
        <Upload className="w-4 h-4" />
        <span className="text-sm font-medium">Add more PDFs</span>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          onChange={handleSelect}
          className="hidden"
        />
      </button>
    )
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="h-full flex items-center justify-center p-6"
    >
      <button
        onClick={() => inputRef.current?.click()}
        className={`
          w-full max-w-2xl rounded-2xl border-2 border-dashed
          flex flex-col items-center justify-center gap-4 py-20 px-8
          transition-all duration-200
          ${
            isDragging
              ? 'border-accent bg-accent/5 scale-[1.01]'
              : 'border-border hover:border-border-strong hover:bg-bg-subtle/50'
          }
        `}
      >
        <div
          className={`
            w-16 h-16 rounded-2xl flex items-center justify-center transition-all
            ${isDragging ? 'bg-accent text-accent-fg scale-110' : 'bg-bg-subtle text-fg-muted'}
          `}
        >
          {isDragging ? (
            <Upload className="w-7 h-7" strokeWidth={2.25} />
          ) : (
            <FileText className="w-7 h-7" strokeWidth={2.25} />
          )}
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold mb-1">
            {isDragging ? 'Drop your PDFs here' : 'Drag & drop PDF files'}
          </h2>
          <p className="text-sm text-fg-muted">
            or <span className="text-accent font-medium">click to browse</span>
          </p>
          <p className="text-xs text-fg-subtle mt-3">
            Supports multiple files · Files never leave your browser
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          onChange={handleSelect}
          className="hidden"
        />
      </button>
    </div>
  )
}
