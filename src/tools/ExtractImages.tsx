import { useState } from 'react'
import { Sparkles, Download } from 'lucide-react'
import { ToolHeader } from '../components/shared/ToolHeader'
import { FileDrop } from '../components/shared/FileDrop'
import { FilePill } from '../components/shared/FilePill'
import { StatusPanel } from '../components/shared/StatusPanel'
import { ProgressBar } from '../components/ProgressBar'
import { extractImages, type ExtractedImage } from '../lib/extract'
import { downloadAsZip, downloadBlob, formatBytes } from '../lib/download'
import { stripExtension } from '../lib/converter'
import { TOOLS } from './registry'

const meta = TOOLS.find((t) => t.id === 'extract-images')!

export function ExtractImages() {
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState<{ c: number; t: number } | null>(null)
  const [running, setRunning] = useState(false)
  const [images, setImages] = useState<ExtractedImage[] | null>(null)

  const onFiles = (files: File[]) => {
    setFile(files[0])
    setImages(null)
  }

  const run = async () => {
    if (!file) return
    setRunning(true)
    setImages(null)
    try {
      const baseName = stripExtension(file.name)
      const result = await extractImages(file, baseName, (c, t) => setProgress({ c, t }))
      setImages(result)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Extraction failed')
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
            {running ? 'Scanning...' : 'Extract images'}
          </button>
        }
      />
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-80 shrink-0 border-r border-border bg-bg-subtle/30 overflow-y-auto p-5 space-y-4">
          <FilePill file={file} onRemove={() => { setFile(null); setImages(null) }} />
          {images && images.length > 0 && (
            <button
              onClick={async () => {
                const pages = images.map((img) => ({
                  pageNumber: img.pageNumber,
                  blob: img.blob,
                  width: img.width,
                  height: img.height,
                  filename: img.filename,
                }))
                await downloadAsZip(pages, `${baseName}_images`)
              }}
              className="btn-primary w-full"
            >
              Download all as ZIP
            </button>
          )}
        </aside>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {progress && <ProgressBar current={progress.c} total={progress.t} label="Scanning pages..." />}
          {images && images.length === 0 && (
            <StatusPanel variant="info" title="No images found" message="This PDF has no embedded raster images." />
          )}
          {images && images.length > 0 && (
            <>
              <StatusPanel
                variant="success"
                title={`Found ${images.length} image${images.length === 1 ? '' : 's'}`}
                message={`Total ${formatBytes(images.reduce((s, i) => s + i.blob.size, 0))}`}
              />
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                {images.map((img) => {
                  const url = URL.createObjectURL(img.blob)
                  return (
                    <div key={`${img.pageNumber}-${img.index}`} className="card overflow-hidden group animate-slide-up">
                      <div className="aspect-square bg-bg-subtle relative overflow-hidden">
                        <img src={url} alt={img.filename} className="w-full h-full object-contain" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                          <button
                            onClick={() => downloadBlob(img.blob, img.filename)}
                            className="btn-primary py-1.5 px-3 text-xs w-full"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download
                          </button>
                        </div>
                      </div>
                      <div className="p-2 text-[10px] text-fg-subtle space-y-0.5">
                        <div className="truncate" title={img.filename}>{img.filename}</div>
                        <div className="font-mono">{img.width}×{img.height} · {formatBytes(img.blob.size)}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
