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
import { useToolMeta } from './registry'
import { useMessages } from '../i18n'
import commonMessages from '../i18n/messages/common'
import officeMessages from '../i18n/messages/office'

export function PdfToWord() {
  const meta = useToolMeta('pdf-to-word')
  const t = useMessages(officeMessages)
  const c = useMessages(commonMessages)
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
      alert(e instanceof Error ? e.message : t.conversionFailed)
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
            {running ? c.converting : t.word.convert}
          </button>
        }
      />
      <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full space-y-4">
        <FilePill file={file} onReplace={(f) => onFiles([f])} onRemove={() => { setFile(null); setResult(null) }} />

        <div className="card p-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs text-fg-muted leading-relaxed">
            <strong className="text-fg">{t.word.noticeTitle}</strong> {t.word.noticeBody}
          </div>
        </div>

        {progress && <ProgressBar current={progress.c} total={progress.t} label={t.word.extracting} />}

        {result && (
          <StatusPanel
            variant="success"
            title={t.word.done}
            message={`${formatBytes(result.size)}`}
          >
            <button
              onClick={() => downloadBlob(result, `${stripExtension(file.name)}.docx`)}
              className="btn-primary"
            >
              {t.downloadExt('.docx')}
            </button>
          </StatusPanel>
        )}
      </div>
    </div>
  )
}
