import { useState } from 'react'
import { Sparkles, Sliders } from 'lucide-react'
import { ToolHeader } from '../components/shared/ToolHeader'
import { FileDrop } from '../components/shared/FileDrop'
import { FilePill } from '../components/shared/FilePill'
import { OptionGroup, Segmented } from '../components/shared/OptionGroup'
import { StatusPanel } from '../components/shared/StatusPanel'
import { ProgressBar } from '../components/ProgressBar'
import { pdfToPptx } from '../lib/office'
import { downloadBlob, formatBytes } from '../lib/download'
import { stripExtension } from '../lib/converter'
import { useToolMeta } from './registry'
import { useMessages } from '../i18n'
import officeMessages from '../i18n/messages/office'

export function PdfToPpt() {
  const meta = useToolMeta('pdf-to-ppt')
  const t = useMessages(officeMessages)
  const [file, setFile] = useState<File | null>(null)
  const [dpi, setDpi] = useState(150)
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
      const blob = await pdfToPptx(file, stripExtension(file.name), dpi, (c, t) =>
        setProgress({ c, t }),
      )
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
            {running ? t.ppt.building : t.ppt.convert}
          </button>
        }
      />
      <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full space-y-4">
        <FilePill file={file} onRemove={() => { setFile(null); setResult(null) }} />

        <OptionGroup
          icon={Sliders}
          title={t.ppt.dpiTitle}
          hint={t.ppt.dpiHint}
        >
          <Segmented
            value={dpi}
            options={[72, 96, 150, 200, 300].map((v) => ({ value: v, label: `${v}` }))}
            onChange={(v) => setDpi(v)}
            disabled={running}
          />
        </OptionGroup>

        {progress && <ProgressBar current={progress.c} total={progress.t} label={t.ppt.rendering} />}

        {result && (
          <StatusPanel
            variant="success"
            title={t.ppt.done}
            message={`${formatBytes(result.size)}`}
          >
            <button
              onClick={() => downloadBlob(result, `${stripExtension(file.name)}.pptx`)}
              className="btn-primary"
            >
              {t.downloadExt('.pptx')}
            </button>
          </StatusPanel>
        )}
      </div>
    </div>
  )
}
