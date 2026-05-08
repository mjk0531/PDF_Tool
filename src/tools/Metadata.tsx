import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { ToolHeader } from '../components/shared/ToolHeader'
import { FileDrop } from '../components/shared/FileDrop'
import { FilePill } from '../components/shared/FilePill'
import { StatusPanel } from '../components/shared/StatusPanel'
import { readMetadata, writeMetadata, type PdfMetadata } from '../lib/pdfOps'
import { downloadBlob, formatBytes, bytesToBlob } from '../lib/download'
import { stripExtension } from '../lib/converter'
import { TOOLS } from './registry'

const meta = TOOLS.find((t) => t.id === 'metadata')!

const EMPTY: PdfMetadata = {
  title: '',
  author: '',
  subject: '',
  keywords: '',
  creator: '',
  producer: '',
  creationDate: null,
  modificationDate: null,
}

const FIELDS: { key: keyof PdfMetadata; label: string; readOnly?: boolean }[] = [
  { key: 'title', label: 'Title' },
  { key: 'author', label: 'Author' },
  { key: 'subject', label: 'Subject' },
  { key: 'keywords', label: 'Keywords (comma-separated)' },
  { key: 'creator', label: 'Creator' },
  { key: 'producer', label: 'Producer' },
  { key: 'creationDate', label: 'Created', readOnly: true },
  { key: 'modificationDate', label: 'Modified', readOnly: true },
]

export function Metadata() {
  const [file, setFile] = useState<File | null>(null)
  const [original, setOriginal] = useState<PdfMetadata>(EMPTY)
  const [edited, setEdited] = useState<PdfMetadata>(EMPTY)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<Blob | null>(null)

  useEffect(() => {
    if (!file) return
    ;(async () => {
      try {
        const m = await readMetadata(file)
        setOriginal(m)
        setEdited(m)
      } catch (e) {
        console.error(e)
      }
    })()
  }, [file])

  const onFiles = (files: File[]) => {
    setFile(files[0])
    setResult(null)
  }

  const run = async () => {
    if (!file) return
    setRunning(true)
    setResult(null)
    try {
      const bytes = await writeMetadata(file, edited)
      setResult(bytesToBlob(bytes, 'application/pdf'))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setRunning(false)
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

  const dirty = JSON.stringify(original) !== JSON.stringify(edited)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ToolHeader
        icon={meta.icon}
        title={meta.name}
        description={meta.description}
        rightSlot={
          <button onClick={run} disabled={running || !dirty} className="btn-primary">
            <Sparkles className={`w-4 h-4 ${running ? 'animate-pulse' : ''}`} />
            {running ? 'Saving...' : 'Save metadata'}
          </button>
        }
      />
      <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full space-y-5">
        <FilePill file={file} onRemove={() => { setFile(null); setResult(null) }} />

        <div className="card p-5 space-y-4">
          {FIELDS.map((f) => {
            const v = edited[f.key]
            const display =
              f.key === 'creationDate' || f.key === 'modificationDate'
                ? v
                  ? new Date(v as string).toLocaleString()
                  : '—'
                : (v as string)
            return (
              <div key={f.key} className="space-y-1.5">
                <label className="text-xs font-medium text-fg-muted">{f.label}</label>
                <input
                  type="text"
                  value={display}
                  readOnly={f.readOnly}
                  onChange={(e) => setEdited({ ...edited, [f.key]: e.target.value })}
                  disabled={running}
                  className="input w-full text-sm"
                  placeholder={f.readOnly ? '' : 'Empty'}
                />
              </div>
            )
          })}
        </div>

        {result && (
          <StatusPanel
            variant="success"
            title="Metadata saved"
            message={`${formatBytes(result.size)}`}
          >
            <button
              onClick={() => downloadBlob(result, `${stripExtension(file.name)}_metadata.pdf`)}
              className="btn-primary"
            >
              Download
            </button>
          </StatusPanel>
        )}
      </div>
    </div>
  )
}
