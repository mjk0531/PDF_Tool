import { useCallback, useMemo, useState } from 'react'
import {
  Sparkles,
  Download,
  Trash2,
  Package,
  Sliders,
  Image as ImageIcon,
  Palette,
  RotateCw,
  FileText as FileTextIcon,
} from 'lucide-react'
import { ToolHeader } from '../components/shared/ToolHeader'
import { FileDrop } from '../components/shared/FileDrop'
import { DropOverlay } from '../components/shared/DropOverlay'
import { OptionGroup, Segmented } from '../components/shared/OptionGroup'
import { FileList } from '../components/FileList'
import { PreviewGrid } from '../components/PreviewGrid'
import { ProgressBar } from '../components/ProgressBar'
import {
  buildFilename,
  loadPdfDocument,
  renderPageToBlob,
  stripExtension,
  type ConvertOptions,
  type ConvertedPage,
  type ImageFormat,
} from '../lib/converter'
import { downloadAsZip } from '../lib/download'
import { parsePageRange } from '../lib/pageRange'
import type { PdfFile } from '../types'
import { TOOLS } from './registry'

const DEFAULT_OPTIONS: Omit<ConvertOptions, 'pages'> = {
  dpi: 150,
  format: 'png',
  quality: 0.92,
  backgroundColor: null,
  rotation: 0,
  filenamePattern: '{name}_page_{n}',
}

const DPI_PRESETS = [72, 150, 300, 600] as const
const FORMATS: { value: ImageFormat; label: string }[] = [
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'webp', label: 'WebP' },
]

function genId() {
  return Math.random().toString(36).slice(2, 10)
}

const meta = TOOLS.find((t) => t.id === 'pdf-to-image')!

export function PdfToImage() {
  const [files, setFiles] = useState<PdfFile[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [options, setOptions] = useState(DEFAULT_OPTIONS)
  const [pageRangeText, setPageRangeText] = useState('')
  const [progress, setProgress] = useState<{ current: number; total: number; fileName: string } | null>(
    null,
  )
  const [isConverting, setIsConverting] = useState(false)

  const updateOption = useCallback(
    <K extends keyof typeof options>(key: K, value: (typeof options)[K]) => {
      setOptions((prev) => ({ ...prev, [key]: value }))
    },
    [],
  )

  const handleFiles = useCallback(
    async (newFiles: File[]) => {
      const entries: PdfFile[] = newFiles.map((file) => ({
        id: genId(),
        file,
        status: 'loading',
        totalPages: null,
        convertedPages: [],
        error: null,
      }))
      setFiles((prev) => [...prev, ...entries])
      if (selectedId === null && entries.length > 0) setSelectedId(entries[0].id)

      for (const entry of entries) {
        try {
          const pdf = await loadPdfDocument(entry.file)
          setFiles((prev) =>
            prev.map((f) =>
              f.id === entry.id ? { ...f, status: 'ready', totalPages: pdf.numPages } : f,
            ),
          )
        } catch (err) {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === entry.id
                ? {
                    ...f,
                    status: 'error',
                    error: err instanceof Error ? err.message : 'Failed to load PDF',
                  }
                : f,
            ),
          )
        }
      }
    },
    [selectedId],
  )

  const removeFile = useCallback(
    (id: string) => {
      setFiles((prev) => {
        const next = prev.filter((f) => f.id !== id)
        if (selectedId === id) setSelectedId(next.length > 0 ? next[0].id : null)
        return next
      })
    },
    [selectedId],
  )

  const clearAll = useCallback(() => {
    setFiles([])
    setSelectedId(null)
  }, [])

  const selectedFile = useMemo(
    () => files.find((f) => f.id === selectedId) ?? null,
    [files, selectedId],
  )

  const pageRangePreview = useMemo(() => {
    if (!selectedFile?.totalPages) return null
    const pages = parsePageRange(pageRangeText, selectedFile.totalPages)
    return { pages, valid: pages !== null }
  }, [pageRangeText, selectedFile?.totalPages])

  const readyFiles = files.filter((f) => f.status === 'ready' || f.status === 'done')
  const canConvert =
    readyFiles.length > 0 && !isConverting && (pageRangePreview === null || pageRangePreview.valid)

  const convertAll = useCallback(async () => {
    if (!canConvert) return
    setIsConverting(true)
    try {
      const filesToConvert = files.filter((f) => f.status === 'ready' || f.status === 'done')
      let plannedTotal = 0
      const plans: { file: PdfFile; pages: number[] }[] = []
      for (const f of filesToConvert) {
        if (!f.totalPages) continue
        const pages = parsePageRange(pageRangeText, f.totalPages)
        if (!pages) continue
        plans.push({ file: f, pages })
        plannedTotal += pages.length
      }

      let done = 0
      for (const plan of plans) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === plan.file.id ? { ...f, status: 'converting', convertedPages: [] } : f,
          ),
        )
        setProgress({ current: done, total: plannedTotal, fileName: plan.file.file.name })

        const pdf = await loadPdfDocument(plan.file.file)
        const baseName = stripExtension(plan.file.file.name)
        const totalPagesInDoc = pdf.numPages
        const converted: ConvertedPage[] = []

        for (const pageNumber of plan.pages) {
          const { blob, width, height } = await renderPageToBlob(pdf, pageNumber, options)
          const filename = buildFilename(
            options.filenamePattern,
            baseName,
            pageNumber,
            totalPagesInDoc,
            options.format,
          )
          converted.push({ pageNumber, blob, width, height, filename })
          done += 1
          setProgress({ current: done, total: plannedTotal, fileName: plan.file.file.name })
          setFiles((prev) =>
            prev.map((f) =>
              f.id === plan.file.id ? { ...f, convertedPages: [...converted] } : f,
            ),
          )
        }

        setFiles((prev) =>
          prev.map((f) =>
            f.id === plan.file.id ? { ...f, status: 'done', convertedPages: converted } : f,
          ),
        )
        await pdf.cleanup()
      }
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Conversion failed')
    } finally {
      setProgress(null)
      setIsConverting(false)
    }
  }, [canConvert, files, options, pageRangeText])

  const downloadAllAsZip = useCallback(async () => {
    const allDone = files.filter((f) => f.status === 'done' && f.convertedPages.length > 0)
    if (allDone.length === 0) return
    if (allDone.length === 1) {
      await downloadAsZip(allDone[0].convertedPages, stripExtension(allDone[0].file.name))
      return
    }
    const allPages = allDone.flatMap((f) =>
      f.convertedPages.map((p) => ({
        ...p,
        filename: `${stripExtension(f.file.name)}/${p.filename}`,
      })),
    )
    await downloadAsZip(allPages, 'pdf-tool-export')
  }, [files])

  const totalConverted = files.reduce((sum, f) => sum + f.convertedPages.length, 0)
  const hasFiles = files.length > 0

  if (!hasFiles) {
    return (
      <div className="flex-1 flex flex-col">
        <ToolHeader icon={meta.icon} title={meta.name} description={meta.description} />
        <FileDrop onFiles={handleFiles} />
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
          <div className="flex items-center gap-2">
            {totalConverted > 0 && (
              <button onClick={downloadAllAsZip} disabled={isConverting} className="btn-secondary">
                <Package className="w-4 h-4" />
                ZIP All
              </button>
            )}
            <button onClick={convertAll} disabled={!canConvert} className="btn-primary">
              <Sparkles className={`w-4 h-4 ${isConverting ? 'animate-pulse' : ''}`} />
              {isConverting ? 'Converting...' : 'Convert'}
            </button>
          </div>
        }
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Settings */}
        <aside className="w-72 shrink-0 border-r border-border bg-bg-subtle/30 overflow-y-auto p-5 space-y-6">
          <OptionGroup icon={Sliders} title="Resolution (DPI)">
            <Segmented
              value={DPI_PRESETS.includes(options.dpi as (typeof DPI_PRESETS)[number]) ? options.dpi : -1}
              options={DPI_PRESETS.map((d) => ({ value: d, label: String(d) }))}
              onChange={(v) => updateOption('dpi', v as number)}
              disabled={isConverting}
            />
            <input
              type="number"
              min={36}
              max={1200}
              step={6}
              value={options.dpi}
              onChange={(e) =>
                updateOption('dpi', Math.max(36, Math.min(1200, Number(e.target.value) || 150)))
              }
              disabled={isConverting}
              className="input w-full text-xs"
            />
          </OptionGroup>

          <OptionGroup icon={ImageIcon} title="Format">
            <Segmented
              value={options.format}
              options={FORMATS}
              onChange={(v) => updateOption('format', v)}
              disabled={isConverting}
            />
            {options.format !== 'png' && (
              <div className="space-y-1.5 pt-1 animate-fade-in">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-fg-muted">Quality</span>
                  <span className="text-fg font-mono">{Math.round(options.quality * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={options.quality}
                  onChange={(e) => updateOption('quality', Number(e.target.value))}
                  disabled={isConverting}
                  className="w-full"
                />
              </div>
            )}
          </OptionGroup>

          <OptionGroup icon={Palette} title="Background">
            <Segmented
              value={
                options.backgroundColor === null
                  ? 'transparent'
                  : options.backgroundColor === '#ffffff'
                    ? 'white'
                    : 'custom'
              }
              options={[
                { value: 'transparent', label: 'Transparent' },
                { value: 'white', label: 'White' },
                { value: 'custom', label: 'Custom' },
              ]}
              onChange={(v) => {
                if (v === 'transparent') updateOption('backgroundColor', null)
                else if (v === 'white') updateOption('backgroundColor', '#ffffff')
                else updateOption('backgroundColor', options.backgroundColor || '#000000')
              }}
              disabled={isConverting || options.format !== 'png'}
            />
            {options.backgroundColor !== null && options.backgroundColor !== '#ffffff' && (
              <div className="flex items-center gap-2 animate-fade-in">
                <input
                  type="color"
                  value={options.backgroundColor}
                  onChange={(e) => updateOption('backgroundColor', e.target.value)}
                  disabled={isConverting}
                  className="w-9 h-9 rounded-md cursor-pointer bg-transparent border border-border"
                />
                <input
                  type="text"
                  value={options.backgroundColor}
                  onChange={(e) => updateOption('backgroundColor', e.target.value)}
                  disabled={isConverting}
                  className="input flex-1 text-xs font-mono uppercase"
                />
              </div>
            )}
            {options.format !== 'png' && (
              <p className="text-[11px] text-fg-subtle">Transparent only available for PNG.</p>
            )}
          </OptionGroup>

          <OptionGroup icon={RotateCw} title="Rotation">
            <Segmented
              value={options.rotation}
              options={[0, 90, 180, 270].map((r) => ({
                value: r as ConvertOptions['rotation'],
                label: `${r}°`,
              }))}
              onChange={(v) => updateOption('rotation', v as ConvertOptions['rotation'])}
              disabled={isConverting}
            />
          </OptionGroup>

          <OptionGroup
            icon={FileTextIcon}
            title="Pages"
            hint="e.g. 1-5, 7, 10-12"
          >
            <input
              type="text"
              value={pageRangeText}
              onChange={(e) => setPageRangeText(e.target.value)}
              disabled={isConverting}
              placeholder="All pages"
              className="input w-full text-xs"
            />
          </OptionGroup>

          <OptionGroup
            icon={FileTextIcon}
            title="Filename Pattern"
            hint="{name} · {n} padded · {N} raw · {total}"
          >
            <input
              type="text"
              value={options.filenamePattern}
              onChange={(e) => updateOption('filenamePattern', e.target.value)}
              disabled={isConverting}
              className="input w-full text-xs font-mono"
            />
          </OptionGroup>
        </aside>

        {/* File sidebar */}
        <DropOverlay
          onFiles={handleFiles}
          acceptLabel="PDFs"
          className="w-80 shrink-0 border-r border-border"
        >
          <div className="h-full overflow-y-auto p-4 space-y-4">
          <FileDrop onFiles={handleFiles} compact noDrag />
          <FileList
            files={files}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onRemove={removeFile}
          />
          {files.length > 1 && (
            <button
              onClick={clearAll}
              disabled={isConverting}
              className="btn-ghost w-full justify-center text-xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear all
            </button>
          )}
          </div>
        </DropOverlay>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {progress && (
            <div className="border-b border-border px-5 py-3">
              <ProgressBar
                current={progress.current}
                total={progress.total}
                label={`Converting ${progress.fileName}...`}
              />
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-5">
            {selectedFile && (
              <>
                {selectedFile.convertedPages.length > 0 && (
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                      Converted Pages ({selectedFile.convertedPages.length})
                    </h3>
                    {selectedFile.status === 'done' && (
                      <button
                        onClick={() =>
                          downloadAsZip(
                            selectedFile.convertedPages,
                            stripExtension(selectedFile.file.name),
                          )
                        }
                        className="btn-ghost text-xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download all
                      </button>
                    )}
                  </div>
                )}
                <PreviewGrid pages={selectedFile.convertedPages} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
