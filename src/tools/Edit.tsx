import { useCallback, useEffect, useState } from 'react'
import { Download, Loader2, Save, ScanText, Trash2 } from 'lucide-react'
import { ToolHeader } from '../components/shared/ToolHeader'
import { FileDrop } from '../components/shared/FileDrop'
import { FilePill } from '../components/shared/FilePill'
import { StatusPanel } from '../components/shared/StatusPanel'
import { Toolbar } from './edit/Toolbar'
import { PageView, type ExistingTextItem, type PageInfo, type Tool } from './edit/PageView'
import {
  exportEditedPdf,
  genId,
  type Annotation,
  type TextAnnotation,
} from '../lib/editor'
import { preloadEditorFont } from '../lib/editorFonts'
import { ocrPageToEditableItems } from '../lib/editorOcr'
import 'pretendard/dist/web/static/Pretendard-Regular.css'
import { loadPdfJs } from '../lib/pdfOps'
import { bytesToBlob, downloadBlob, formatBytes } from '../lib/download'
import { stripExtension } from '../lib/converter'
import { TOOLS } from './registry'

const meta = TOOLS.find((t) => t.id === 'edit')!

/** CSS pixels per PDF point. ~1.4 ≈ fit-to-width for a ~600px container. */
const DISPLAY_SCALE = 1.4

export function Edit() {
  const [file, setFile] = useState<File | null>(null)
  const [pages, setPages] = useState<PageInfo[]>([])
  const [existingText, setExistingText] = useState<Map<number, ExistingTextItem[]>>(new Map())
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [tool, setTool] = useState<Tool>('select')
  const [textStyle, setTextStyle] = useState({ fontSize: 12, color: '#000000' })
  const [pendingImage, setPendingImage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [ocrRunning, setOcrRunning] = useState<{ page: number; status: string } | null>(null)

  // Pre-warm the editor font (Pretendard) so the first save doesn't pause
  // for a 1.6 MB fetch — runs once when the tool mounts.
  useEffect(() => {
    preloadEditorFont()
  }, [])

  /* ----- Load PDF + render each page + extract text positions ----- */

  useEffect(() => {
    if (!file) return
    let cancelled = false
    ;(async () => {
      setIsLoading(true)
      setPages([])
      setExistingText(new Map())
      setAnnotations([])
      setWarnings([])
      try {
        const pdf = await loadPdfJs(file)
        const newPages: PageInfo[] = []
        const newText = new Map<number, ExistingTextItem[]>()

        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return
          const page = await pdf.getPage(i)
          const baseViewport = page.getViewport({ scale: 1 })
          const renderScale = DISPLAY_SCALE * 1.5 // render at 1.5x display for crisp upscaling
          const renderViewport = page.getViewport({ scale: renderScale })

          const canvas = document.createElement('canvas')
          canvas.width = Math.ceil(renderViewport.width)
          canvas.height = Math.ceil(renderViewport.height)
          const ctx = canvas.getContext('2d')!
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          await page.render({ canvasContext: ctx, viewport: renderViewport }).promise

          if (cancelled) return
          newPages.push({
            number: i,
            width: baseViewport.width,
            height: baseViewport.height,
            thumbDataUrl: canvas.toDataURL('image/jpeg', 0.85),
          })

          // Extract text items as editable handles
          const textContent = await page.getTextContent()
          const items: ExistingTextItem[] = []
          for (const raw of textContent.items as Array<{
            str: string
            transform: number[]
            width: number
            height: number
          }>) {
            if (!raw.str || !raw.str.trim()) continue
            // raw.transform = [a, b, c, d, e, f] where (e, f) is baseline origin in user space
            const fontSize = Math.abs(raw.transform[3]) || Math.abs(raw.transform[0]) || 12
            items.push({
              id: `t-${i}-${items.length}`,
              text: raw.str,
              x: raw.transform[4],
              y: raw.transform[5],
              fontSize,
              width: raw.width,
              height: raw.height || fontSize,
            })
          }
          newText.set(i, items)
          page.cleanup()
        }

        if (!cancelled) {
          setPages(newPages)
          setExistingText(newText)
        }
      } catch (err) {
        console.error(err)
        setWarnings([err instanceof Error ? err.message : 'Failed to load PDF'])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [file])

  /* ----- Annotation mutators ----- */

  const addAnnotation = useCallback((a: Annotation) => {
    setAnnotations((prev) => [...prev, a])
  }, [])

  const updateAnnotation = useCallback((id: string, patch: Partial<Annotation>) => {
    setAnnotations((prev) => prev.map((a) => (a.id === id ? ({ ...a, ...patch } as Annotation) : a)))
  }, [])

  const deleteAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id))
  }, [])

  /* ----- Edit existing text via the whiteout + overlay trick ----- */

  const editExistingText = useCallback(
    (item: ExistingTextItem, pageNumber: number) => {
      const whiteoutId = genId()
      const textId = genId()
      // Bbox for the original text. PDF text y is the baseline; the whiteout
      // box should cover the line box from descender to ascender.
      const padding = Math.max(1, item.fontSize * 0.15)
      const whiteoutH = item.height + padding * 2
      setAnnotations((prev) => [
        ...prev,
        {
          id: whiteoutId,
          page: pageNumber,
          kind: 'whiteout',
          x: item.x - padding,
          y: item.y - padding,
          width: item.width + padding * 2,
          height: whiteoutH,
        },
        {
          id: textId,
          page: pageNumber,
          kind: 'text',
          x: item.x,
          y: item.y,
          // Generous default width — text fits without wrapping for the
          // original line, but the user can drag the handle to wrap.
          width: Math.max(item.width * 2, 200),
          text: item.text,
          fontSize: item.fontSize,
          color: textStyle.color,
        } as TextAnnotation,
      ])
    },
    [textStyle.color],
  )

  /* ----- OCR a page to make it editable ----- */

  const runOcrForPage = useCallback(
    async (pageNumber: number) => {
      if (!file) return
      setOcrRunning({ page: pageNumber, status: 'Starting...' })
      try {
        const result = await ocrPageToEditableItems(file, pageNumber, 'eng+kor', (status) =>
          setOcrRunning({ page: pageNumber, status }),
        )
        setExistingText((prev) => {
          const next = new Map(prev)
          next.set(pageNumber, result.items)
          return next
        })
      } catch (e) {
        alert(e instanceof Error ? e.message : 'OCR failed')
      } finally {
        setOcrRunning(null)
      }
    },
    [file],
  )

  /* ----- Image picker ----- */

  const pickImage = useCallback((imgFile: File) => {
    const reader = new FileReader()
    reader.onload = () => setPendingImage(typeof reader.result === 'string' ? reader.result : null)
    reader.readAsDataURL(imgFile)
  }, [])

  /* ----- Save / export ----- */

  const handleSave = useCallback(async () => {
    if (!file) return
    setIsSaving(true)
    setWarnings([])
    try {
      const result = await exportEditedPdf(file, annotations)
      const blob = bytesToBlob(result.bytes, 'application/pdf')
      downloadBlob(blob, `${stripExtension(file.name)}_edited.pdf`)
      if (result.warnings.length > 0) setWarnings(result.warnings)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setIsSaving(false)
    }
  }, [file, annotations])

  const totalAnnotations = annotations.length

  /* ----- Render ----- */

  if (!file) {
    return (
      <div className="flex-1 flex flex-col">
        <ToolHeader icon={meta.icon} title={meta.name} description={meta.description} beta />
        <FileDrop onFiles={(fs) => setFile(fs[0])} multiple={false} />
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
          <div className="flex items-center gap-2">
            {totalAnnotations > 0 && (
              <button
                onClick={() => setAnnotations([])}
                disabled={isSaving}
                className="btn-ghost text-xs"
                title="Discard all edits"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear edits ({totalAnnotations})
              </button>
            )}
            <button onClick={handleSave} disabled={isSaving} className="btn-primary">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSaving ? 'Saving...' : 'Save edited PDF'}
            </button>
          </div>
        }
      />

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-64 shrink-0 border-r border-border bg-bg-subtle/30 overflow-y-auto p-4 space-y-4">
          <FilePill
            file={file}
            detail={pages.length > 0 ? `${pages.length} pages` : undefined}
            onRemove={() => {
              setFile(null)
              setPages([])
              setAnnotations([])
            }}
          />
          <Toolbar
            tool={tool}
            onToolChange={setTool}
            textStyle={textStyle}
            onTextStyleChange={setTextStyle}
            onPickImage={pickImage}
            pendingImagePresent={!!pendingImage}
          />
          <div className="card p-3 text-[11px] text-fg-subtle leading-relaxed">
            Overlay text uses <strong className="text-fg">Pretendard</strong> (Korean + Latin + partial CJK). Lines wrap to the
            text box width — drag the right handle to set it. For scanned PDFs with no
            selectable text, use the OCR button below each page.
          </div>
        </aside>

        <div className="flex-1 overflow-y-auto bg-bg-subtle/20 p-6">
          {isLoading ? (
            <LoadingState />
          ) : (
            <div className="space-y-6 max-w-full">
              {pages.map((p) => {
                const items = existingText.get(p.number) ?? []
                const isOcrTarget = items.length === 0
                const isOcrThisPage = ocrRunning?.page === p.number
                return (
                  <div key={p.number} className="space-y-2">
                    <PageView
                      pageInfo={p}
                      displayScale={DISPLAY_SCALE}
                      existingText={items}
                      annotations={annotations}
                      tool={tool}
                      textStyle={textStyle}
                      pendingImageDataUrl={pendingImage}
                      onAddAnnotation={addAnnotation}
                      onUpdateAnnotation={updateAnnotation}
                      onDeleteAnnotation={deleteAnnotation}
                      onEditExistingText={(item) => editExistingText(item, p.number)}
                      onImagePlaced={() => setPendingImage(null)}
                    />
                    {isOcrTarget && (
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => runOcrForPage(p.number)}
                          disabled={!!ocrRunning}
                          className="btn-secondary text-xs"
                        >
                          {isOcrThisPage ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              {ocrRunning?.status}
                            </>
                          ) : (
                            <>
                              <ScanText className="w-3.5 h-3.5" />
                              Make page {p.number} editable with OCR
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="mt-4">
              <WarningsList warnings={warnings} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-16 text-fg-muted">
      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
      Rendering pages...
    </div>
  )
}

function WarningsList({ warnings }: { warnings: string[] }) {
  return (
    <StatusPanel
      variant="info"
      title={`${warnings.length} warning${warnings.length === 1 ? '' : 's'} from the last save`}
      message={`Total ${formatBytes(0)} skipped — see details.`}
    >
      <ul className="text-[11px] text-fg-muted space-y-1 list-disc pl-4">
        {warnings.slice(0, 8).map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </StatusPanel>
  )
}

// `Download` import kept for the future "download annotated JSON" feature
void Download
