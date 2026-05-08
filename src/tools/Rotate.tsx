import { useState } from 'react'
import { Sparkles, RotateCw } from 'lucide-react'
import { ToolHeader } from '../components/shared/ToolHeader'
import { FileDrop } from '../components/shared/FileDrop'
import { FilePill } from '../components/shared/FilePill'
import { OptionGroup, Segmented } from '../components/shared/OptionGroup'
import { StatusPanel } from '../components/shared/StatusPanel'
import { getPageCount, rotatePages } from '../lib/pdfOps'
import { downloadBlob, formatBytes, bytesToBlob } from '../lib/download'
import { stripExtension } from '../lib/converter'
import { parsePageRange } from '../lib/pageRange'
import { TOOLS } from './registry'

const meta = TOOLS.find((t) => t.id === 'rotate')!

export function Rotate() {
  const [file, setFile] = useState<File | null>(null)
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [angle, setAngle] = useState<90 | 180 | 270>(90)
  const [pagesText, setPagesText] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<Blob | null>(null)

  const onFiles = async (files: File[]) => {
    const f = files[0]
    setFile(f)
    setResult(null)
    try {
      setPageCount(await getPageCount(f))
    } catch {
      setPageCount(null)
    }
  }

  const run = async () => {
    if (!file) return
    setRunning(true)
    setResult(null)
    try {
      let pages: 'all' | number[] = 'all'
      if (pagesText.trim() && pageCount) {
        const parsed = parsePageRange(pagesText, pageCount)
        if (!parsed) {
          alert('Invalid page range')
          setRunning(false)
          return
        }
        pages = parsed
      }
      const bytes = await rotatePages(file, angle, pages)
      setResult(bytesToBlob(bytes, 'application/pdf'))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Rotation failed')
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

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ToolHeader
        icon={meta.icon}
        title={meta.name}
        description={meta.description}
        rightSlot={
          <button onClick={run} disabled={running} className="btn-primary">
            <Sparkles className={`w-4 h-4 ${running ? 'animate-pulse' : ''}`} />
            {running ? 'Rotating...' : 'Rotate'}
          </button>
        }
      />
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-80 shrink-0 border-r border-border bg-bg-subtle/30 overflow-y-auto p-5 space-y-6">
          <FilePill
            file={file}
            detail={pageCount ? `${pageCount} pages` : undefined}
            onRemove={() => { setFile(null); setResult(null) }}
          />
          <OptionGroup icon={RotateCw} title="Angle">
            <Segmented
              value={angle}
              options={[
                { value: 90, label: '90°' },
                { value: 180, label: '180°' },
                { value: 270, label: '270°' },
              ]}
              onChange={(v) => setAngle(v as 90 | 180 | 270)}
              disabled={running}
            />
          </OptionGroup>
          <OptionGroup title="Pages" hint="Empty = all. e.g. 1-5, 7">
            <input
              type="text"
              value={pagesText}
              onChange={(e) => setPagesText(e.target.value)}
              disabled={running}
              placeholder="All pages"
              className="input w-full text-xs"
            />
          </OptionGroup>
        </aside>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {result && (
            <StatusPanel
              variant="success"
              title="Rotated successfully"
              message={`${formatBytes(result.size)} · pages rotated by ${angle}°`}
            >
              <button
                onClick={() => downloadBlob(result, `${stripExtension(file.name)}_rotated.pdf`)}
                className="btn-primary"
              >
                Download rotated PDF
              </button>
            </StatusPanel>
          )}
        </div>
      </div>
    </div>
  )
}
