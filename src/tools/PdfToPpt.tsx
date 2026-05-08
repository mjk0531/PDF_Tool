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
import { TOOLS } from './registry'

const meta = TOOLS.find((t) => t.id === 'pdf-to-ppt')!

export function PdfToPpt() {
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
            {running ? 'Building slides...' : 'Convert to .pptx'}
          </button>
        }
      />
      <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full space-y-4">
        <FilePill file={file} onRemove={() => { setFile(null); setResult(null) }} />

        <OptionGroup
          icon={Sliders}
          title="Slide image DPI"
          hint="Each PDF page becomes a slide image. Higher DPI = crisper, larger file."
        >
          <Segmented
            value={dpi}
            options={[72, 96, 150, 200, 300].map((v) => ({ value: v, label: `${v}` }))}
            onChange={(v) => setDpi(v)}
            disabled={running}
          />
        </OptionGroup>

        {progress && <ProgressBar current={progress.c} total={progress.t} label="Rendering slides..." />}

        {result && (
          <StatusPanel
            variant="success"
            title="Presentation generated"
            message={`${formatBytes(result.size)}`}
          >
            <button
              onClick={() => downloadBlob(result, `${stripExtension(file.name)}.pptx`)}
              className="btn-primary"
            >
              Download .pptx
            </button>
          </StatusPanel>
        )}
      </div>
    </div>
  )
}
