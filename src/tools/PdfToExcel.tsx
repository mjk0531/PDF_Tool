import { useState } from 'react'
import { Sparkles, AlertCircle } from 'lucide-react'
import { ToolHeader } from '../components/shared/ToolHeader'
import { FileDrop } from '../components/shared/FileDrop'
import { FilePill } from '../components/shared/FilePill'
import { StatusPanel } from '../components/shared/StatusPanel'
import { ProgressBar } from '../components/ProgressBar'
import { extractText } from '../lib/extract'
import { pagesToWorkbook, workbookToBlob } from '../lib/office'
import { downloadBlob, formatBytes } from '../lib/download'
import { stripExtension } from '../lib/converter'
import { useToolMeta } from './registry'
import { useMessages } from '../i18n'
import officeMessages from '../i18n/messages/office'

export function PdfToExcel() {
  const meta = useToolMeta('pdf-to-excel')
  const t = useMessages(officeMessages)
  const [file, setFile] = useState<File | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ c: number; t: number } | null>(null)
  const [result, setResult] = useState<Blob | null>(null)
  const [pageCount, setPageCount] = useState<number | null>(null)

  const onFiles = (files: File[]) => {
    setFile(files[0])
    setResult(null)
    setPageCount(null)
  }

  const run = async () => {
    if (!file) return
    setRunning(true)
    setResult(null)
    try {
      const pages = await extractText(file, (c, t) => setProgress({ c, t }))
      setPageCount(pages.length)
      const wb = pagesToWorkbook(pages, stripExtension(file.name))
      setResult(workbookToBlob(wb))
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
            {running ? t.excel.detecting : t.excel.convert}
          </button>
        }
      />
      <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full space-y-4">
        <FilePill file={file} onReplace={(f) => onFiles([f])} onRemove={() => { setFile(null); setResult(null) }} />

        <div className="card p-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs text-fg-muted leading-relaxed">
            <strong className="text-fg">{t.excel.noticeTitle}</strong> {t.excel.noticeBody}
          </div>
        </div>

        {progress && <ProgressBar current={progress.c} total={progress.t} label={t.excel.extracting} />}

        {result && (
          <StatusPanel
            variant="success"
            title={t.excel.done}
            message={`${formatBytes(result.size)}${pageCount ? ` · ${t.excel.sheets(pageCount)}` : ''}`}
          >
            <button
              onClick={() => downloadBlob(result, `${stripExtension(file.name)}.xlsx`)}
              className="btn-primary"
            >
              {t.downloadExt('.xlsx')}
            </button>
          </StatusPanel>
        )}
      </div>
    </div>
  )
}
