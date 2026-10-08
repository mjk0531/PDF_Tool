import { useState } from 'react'
import { Sparkles, Copy, FileText } from 'lucide-react'
import { ToolHeader } from '../components/shared/ToolHeader'
import { FileDrop } from '../components/shared/FileDrop'
import { FilePill } from '../components/shared/FilePill'
import { OptionGroup, Segmented } from '../components/shared/OptionGroup'
import { StatusPanel } from '../components/shared/StatusPanel'
import { ProgressBar } from '../components/ProgressBar'
import { extractText, joinPlainText, type PageText } from '../lib/extract'
import { downloadBlob, formatBytes } from '../lib/download'
import { stripExtension } from '../lib/converter'
import { useToolMeta } from './registry'
import { useMessages } from '../i18n'
import commonMessages from '../i18n/messages/common'
import extractTextMessages from '../i18n/messages/extractText'

type Mode = 'single' | 'per-page'

export function ExtractText() {
  const meta = useToolMeta('extract-text')
  const t = useMessages(extractTextMessages)
  const c = useMessages(commonMessages)
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<Mode>('single')
  const [progress, setProgress] = useState<{ c: number; t: number } | null>(null)
  const [running, setRunning] = useState(false)
  const [pages, setPages] = useState<PageText[] | null>(null)

  const onFiles = (files: File[]) => {
    setFile(files[0])
    setPages(null)
  }

  const run = async () => {
    if (!file) return
    setRunning(true)
    setPages(null)
    try {
      const result = await extractText(file, (c, t) => setProgress({ c, t }))
      setPages(result)
    } catch (e) {
      alert(e instanceof Error ? e.message : t.failed)
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

  const fullText = pages ? joinPlainText(pages) : ''
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
            {running ? t.extracting : t.extract}
          </button>
        }
      />

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-80 shrink-0 border-r border-border bg-bg-subtle/30 overflow-y-auto p-5 space-y-6">
          <FilePill file={file} onRemove={() => { setFile(null); setPages(null) }} />
          <OptionGroup icon={FileText} title={t.output}>
            <Segmented
              value={mode}
              options={[
                { value: 'single', label: t.modes.single },
                { value: 'per-page', label: t.modes.perPage },
              ]}
              onChange={(v) => setMode(v as Mode)}
              disabled={running}
            />
          </OptionGroup>
          {pages && (
            <div className="space-y-2">
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(fullText)
                }}
                className="btn-secondary w-full"
              >
                <Copy className="w-3.5 h-3.5" />
                {t.copyAll}
              </button>
              <button
                onClick={() => {
                  if (mode === 'single') {
                    downloadBlob(new Blob([fullText], { type: 'text/plain' }), `${baseName}.txt`)
                  } else {
                    pages.forEach((p) => {
                      downloadBlob(
                        new Blob([p.text], { type: 'text/plain' }),
                        `${baseName}_page_${p.pageNumber}.txt`,
                      )
                    })
                  }
                }}
                className="btn-primary w-full"
              >
                {c.download}
              </button>
            </div>
          )}
        </aside>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {progress && <ProgressBar current={progress.c} total={progress.t} label={t.extractingPages} />}
          {pages ? (
            <div className="space-y-3">
              <StatusPanel
                variant="success"
                title={t.extracted(pages.length)}
                message={`${t.chars(fullText.length)} · ${formatBytes(new Blob([fullText]).size)}`}
              />
              <div className="card p-4">
                <pre className="text-xs whitespace-pre-wrap font-mono text-fg-muted max-h-[60vh] overflow-y-auto">
                  {fullText.slice(0, 20000)}
                  {fullText.length > 20000 && t.truncated}
                </pre>
              </div>
            </div>
          ) : (
            !running && (
              <StatusPanel
                variant="info"
                title={t.ready}
                message={t.readyMessage}
              />
            )
          )}
        </div>
      </div>
    </div>
  )
}
