import { useState } from 'react'
import { Sparkles, Copy } from 'lucide-react'
import { ToolHeader } from '../components/shared/ToolHeader'
import { FileDrop } from '../components/shared/FileDrop'
import { FilePill } from '../components/shared/FilePill'
import { StatusPanel } from '../components/shared/StatusPanel'
import { ProgressBar } from '../components/ProgressBar'
import { extractText, pagesToMarkdown } from '../lib/extract'
import { downloadBlob, formatBytes } from '../lib/download'
import { stripExtension } from '../lib/converter'
import { TOOLS } from './registry'

const meta = TOOLS.find((t) => t.id === 'pdf-to-markdown')!

export function PdfToMarkdown() {
  const [file, setFile] = useState<File | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ c: number; t: number } | null>(null)
  const [markdown, setMarkdown] = useState<string | null>(null)

  const onFiles = (files: File[]) => {
    setFile(files[0])
    setMarkdown(null)
  }

  const run = async () => {
    if (!file) return
    setRunning(true)
    setMarkdown(null)
    try {
      const pages = await extractText(file, (c, t) => setProgress({ c, t }))
      const md = pagesToMarkdown(pages, stripExtension(file.name))
      setMarkdown(md)
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
        <ToolHeader icon={meta.icon} title={meta.name} description={meta.description} />
        <FileDrop onFiles={onFiles} multiple={false} />
      </div>
    )
  }

  const baseName = stripExtension(file.name)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ToolHeader
        icon={meta.icon}
        title={meta.name}
        description={meta.description}
        rightSlot={
          <button onClick={run} disabled={running} className="btn-primary">
            <Sparkles className={`w-4 h-4 ${running ? 'animate-pulse' : ''}`} />
            {running ? 'Converting...' : 'Convert to Markdown'}
          </button>
        }
      />
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-80 shrink-0 border-r border-border bg-bg-subtle/30 overflow-y-auto p-5 space-y-4">
          <FilePill file={file} onRemove={() => { setFile(null); setMarkdown(null) }} />
          {markdown && (
            <div className="space-y-2">
              <button
                onClick={() => navigator.clipboard.writeText(markdown)}
                className="btn-secondary w-full"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy markdown
              </button>
              <button
                onClick={() => downloadBlob(new Blob([markdown], { type: 'text/markdown' }), `${baseName}.md`)}
                className="btn-primary w-full"
              >
                Download .md
              </button>
            </div>
          )}
          <p className="text-[11px] text-fg-subtle leading-relaxed">
            Heading levels are inferred by font size. Plain prose is preserved.
          </p>
        </aside>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {progress && <ProgressBar current={progress.c} total={progress.t} label="Extracting pages..." />}
          {markdown && (
            <>
              <StatusPanel
                variant="success"
                title="Markdown generated"
                message={`${formatBytes(new Blob([markdown]).size)} · ${markdown.split('\n').length} lines`}
              />
              <div className="card p-4">
                <pre className="text-xs whitespace-pre-wrap font-mono text-fg-muted max-h-[60vh] overflow-y-auto">
                  {markdown.slice(0, 20000)}
                  {markdown.length > 20000 && '\n\n... (truncated in preview)'}
                </pre>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
