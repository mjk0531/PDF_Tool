import { useState } from 'react'
import { Sparkles, AlertCircle } from 'lucide-react'
import { ToolHeader } from '../components/shared/ToolHeader'
import { FileDrop } from '../components/shared/FileDrop'
import { FilePill } from '../components/shared/FilePill'
import { StatusPanel } from '../components/shared/StatusPanel'
import { ProgressBar } from '../components/ProgressBar'
import { extractText } from '../lib/extract'
import { pagesToDocx } from '../lib/office'
import { downloadBlob, formatBytes } from '../lib/download'
import { stripExtension } from '../lib/converter'
import { TOOLS } from './registry'

const meta = TOOLS.find((t) => t.id === 'pdf-to-word')!

export function PdfToWord() {
  const [file, setFile] = useState<File | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ c: number; t: number } | null>(null)
  const [result, setResult] = useState<Blob | null>(null)

  const onFiles = (files: File[]) => {
    setFile(files[0])
    setResult(null)
  }

  const run = async () => {
    if (!file) return
    setRunning(true)
    setResult(null)
    try {
      const pages = await extractText(file, (c, t) => setProgress({ c, t }))
      const blob = await pagesToDocx(pages, stripExtension(file.name))
      setResult(blob)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Conversion failed')
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  if (!file) {
    return (
      <div className="flex-1 flex flex-col">
        <ToolHeader icon={meta.icon} title={meta.name} description={meta.description} beta />
        <FileDrop onFiles={onFiles} multiple={false} />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ToolHeader
        icon={meta.icon}
        title={meta.name}
        description={meta.description}
        beta
        rightSlot={
          <button onClick={run} disabled={running} className="btn-primary">
            <Sparkles className={`w-4 h-4 ${running ? 'animate-pulse' : ''}`} />
            {running ? 'Converting...' : 'Convert to .docx'}
          </button>
        }
      />
      <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full space-y-4">
        <FilePill file={file} onRemove={() => { setFile(null); setResult(null) }} />

        <div className="card p-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs text-fg-muted leading-relaxed">
            <strong className="text-fg">Best-effort conversion.</strong> The output preserves text, paragraphs, and a heading hierarchy inferred from font size — but multi-column layouts, tables, and complex formatting will not survive. For scanned PDFs, run OCR first.
          </div>
        </div>

        {progress && <ProgressBar current={progress.c} total={progress.t} label="Extracting text..." />}

        {result && (
          <StatusPanel
            variant="success"
            title="Word document generated"
            message={`${formatBytes(result.size)}`}
          >
            <button
              onClick={() => downloadBlob(result, `${stripExtension(file.name)}.docx`)}
              className="btn-primary"
            >
              Download .docx
            </button>
          </StatusPanel>
        )}
      </div>
    </div>
  )
}
