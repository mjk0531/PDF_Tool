import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Minus, Plus, Redo2, Save, Trash2, Undo2 } from 'lucide-react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { ToolHeader } from '../components/shared/ToolHeader'
import { FileDrop } from '../components/shared/FileDrop'
import { FilePill } from '../components/shared/FilePill'
import { StatusPanel } from '../components/shared/StatusPanel'
import { Toggle } from '../components/shared/Toggle'
import { Label, Toolbar } from './edit/Toolbar'
import { PageView, type OcrState, type Tool } from './edit/PageView'
import { PropertiesPanel } from './edit/PropertiesPanel'
import { FindReplace } from './edit/FindReplace'
import { useHistory } from './edit/useHistory'
import { entriesSignature, previewEntries, type PagePreview } from './edit/keys'
import { exportEditedPdf, renderEditedPage, type Annotation, type EditSession, type TextStyle } from '../lib/editor'
import { editFromLines, editedLineIds, isKoreanPage, linesForClick, type EditUnit, type FindHit } from '../lib/editorEdits'
import { loadPage, PatchMaker, type PageInfo } from '../lib/editorLoad'
import { EDITOR_OCR_LANGS, ocrPage, terminateEditorOcr } from '../lib/editorOcr'
import { preloadEditorFont } from '../lib/editorFonts'
import { lineBox, type PageText } from '../lib/editorLayout'
import { apply, invert, makeViewport, overlapArea, type PageGeom, type Rect } from '../lib/editorGeometry'
import 'pretendard/dist/web/static/Pretendard-Regular.css'
import 'pretendard/dist/web/static/Pretendard-Bold.css'
import { pdfjsLib } from '../lib/pdfWorker'
import { bytesToBlob, downloadBlob } from '../lib/download'
import { stripExtension } from '../lib/converter'
import { useToolMeta } from './registry'
import { pick, useLang, useMessages, type Lang } from '../i18n'
import commonMessages from '../i18n/messages/common'
import editMessages from '../i18n/messages/edit'

/** CSS pixels per PDF point at 100% zoom. */
const BASE_SCALE = 1.4
/** Page renders (original and previews) are made at this scale for crisp zooming. */
const RENDER_SCALE = 2.1
const ZOOMS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 1.75, 2]

function defaultOcrLang(lang: Lang) {
  return lang === 'ko' ? 'kor+eng' : lang === 'es' ? 'spa+eng' : 'eng'
}

const DEFAULT_TEXT_STYLE: TextStyle = {
  fontSize: 12,
  color: '#000000',
  bold: false,
  italic: false,
  family: 'sans',
  align: 'left',
  lineHeight: 1.25,
  hScale: 1,
}

export function Edit() {
  const meta = useToolMeta('edit')
  const t = useMessages(editMessages)
  const c = useMessages(commonMessages)
  const { lang } = useLang()

  const [file, setFile] = useState<File | null>(null)
  const sessionRef = useRef<EditSession | null>(null)
  const pdfRef = useRef<PDFDocumentProxy | null>(null)
  const patchMakerRef = useRef<PatchMaker | null>(null)

  const [pages, setPages] = useState<PageInfo[]>([])
  const [pageTexts, setPageTexts] = useState<Map<number, PageText>>(new Map())
  const [ocr, setOcr] = useState<Map<number, OcrState>>(new Map())
  const history = useHistory<Annotation[]>([])
  const annotations = history.value
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [tool, setTool] = useState<Tool>('select')
  const [unit, setUnit] = useState<EditUnit>('line')
  const [showTextHints, setShowTextHints] = useState(false)
  const [eraseFill, setEraseFill] = useState<'auto' | 'white'>('auto')
  const [newTextStyle, setNewTextStyle] = useState<TextStyle>(DEFAULT_TEXT_STYLE)
  const [pendingImage, setPendingImage] = useState<{ dataUrl: string; aspect: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [previews, setPreviews] = useState<Map<number, PagePreview>>(new Map())
  const [patchStamp, setPatchStamp] = useState<Map<number, number>>(new Map())
  const [loadProgress, setLoadProgress] = useState<{ done: number; total: number } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [ocrLang, setOcrLang] = useState(() => defaultOcrLang(lang))
  const [autoOcr, setAutoOcr] = useState(true)
  const [flashId, setFlashId] = useState<string | null>(null)
  const pageRefs = useRef(new Map<number, HTMLDivElement>())

  const scale = BASE_SCALE * zoom
  const pagesRef = useRef(pages)
  pagesRef.current = pages
  const annotationsRef = useRef(annotations)
  annotationsRef.current = annotations
  const editingRef = useRef(editingId)
  editingRef.current = editingId
  const ocrLangRef = useRef(ocrLang)
  ocrLangRef.current = ocrLang

  useEffect(() => {
    preloadEditorFont()
    return () => {
      terminateEditorOcr()
    }
  }, [])

  /* ----- Load ----- */

  // Loading is keyed to the File object: re-running the effect for the same
  // file (e.g. a dev hot reload) must not throw away the edits made on it.
  const loadedFor = useRef<File | null>(null)

  useEffect(() => {
    if (!file || loadedFor.current === file) return
    loadedFor.current = file
    const cancelled = () => loadedFor.current !== file
    pdfRef.current?.destroy()
    pdfRef.current = null
    setPages([])
    setPageTexts(new Map())
    setOcr(new Map())
    setPreviews(new Map())
    setPatchStamp(new Map())
    history.reset([])
    setSelectedId(null)
    setEditingId(null)
    setWarnings([])
    ;(async () => {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise
        if (cancelled()) {
          await pdf.destroy()
          return
        }
        pdfRef.current = pdf
        const session: EditSession = { bytes, knownChars: new Map(), patches: new Map(), rotation: new Map() }
        sessionRef.current = session
        const geoms = new Map<number, PageGeom>()
        patchMakerRef.current = new PatchMaker(pdf, geoms, session.patches)
        setLoadProgress({ done: 0, total: pdf.numPages })
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled()) return
          const { info, text } = await loadPage(pdf, i, RENDER_SCALE, session.knownChars)
          if (cancelled()) return
          geoms.set(i, info.geom)
          session.rotation.set(i, info.geom.rotate)
          setPages((prev) => [...prev, info])
          setPageTexts((prev) => new Map(prev).set(i, text))
          setLoadProgress({ done: i, total: pdf.numPages })
        }
      } catch (err) {
        console.error(err)
        if (!cancelled()) setWarnings([err instanceof Error ? err.message : pick(editMessages).errors.loadFailed])
      } finally {
        if (!cancelled()) setLoadProgress(null)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  const closeFile = useCallback(() => {
    loadedFor.current = null
    sessionRef.current = null
    patchMakerRef.current = null
    pdfRef.current?.destroy()
    pdfRef.current = null
    setFile(null)
    setPages([])
    history.reset([])
  }, [history])

  // Unsaved edits: confirm before leaving the page.
  useEffect(() => {
    if (!annotations.length) return
    const onBefore = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBefore)
    return () => window.removeEventListener('beforeunload', onBefore)
  }, [annotations.length])

  /* ----- OCR ----- */

  const runOcr = useCallback(async (n: number) => {
    const pdf = pdfRef.current
    const info = pagesRef.current.find((p) => p.number === n)
    if (!pdf || !info) return
    setOcr((prev) => new Map(prev).set(n, { state: 'queued' }))
    try {
      const res = await ocrPage(pdf, n, info.geom, ocrLangRef.current, (status) =>
        setOcr((prev) => new Map(prev).set(n, { state: 'running', status })),
      )
      if (pdfRef.current !== pdf) return
      setPageTexts((prev) => {
        const cur = prev.get(n) ?? { lines: [], paragraphs: [] }
        const layer = cur.lines.filter((l) => l.origin !== 'ocr')
        const layerParas = cur.paragraphs.filter((p) => !p.id.startsWith('OP'))
        // On mixed pages keep only text the text layer doesn't already have.
        const layerBoxes = layer.map(lineBox)
        const keep = res.lines.filter((o) => {
          const b = lineBox(o)
          return !layerBoxes.some((lb) => overlapArea(lb, b) > 0.3 * b.width * b.height)
        })
        const keepIds = new Set(keep.map((l) => l.id))
        const paras = res.paragraphs
          .map((p) => ({ ...p, lineIds: p.lineIds.filter((id) => keepIds.has(id)) }))
          .filter((p) => p.lineIds.length)
        return new Map(prev).set(n, { lines: [...layer, ...keep], paragraphs: [...layerParas, ...paras] })
      })
      setOcr((prev) => new Map(prev).set(n, { state: 'done', status: t.ocr.found(res.lines.length) }))
    } catch (e) {
      console.error(e)
      setOcr((prev) => new Map(prev).set(n, { state: 'error', status: e instanceof Error ? e.message : t.errors.ocrFailed }))
    }
  }, [t])

  // Scanned pages: recognise automatically as they load.
  useEffect(() => {
    if (!autoOcr) return
    for (const p of pages) if (p.kind === 'scan' && !ocr.has(p.number)) runOcr(p.number)
  }, [pages, ocr, autoOcr, runOcr])

  const changeOcrLang = (code: string) => {
    setOcrLang(code)
    ocrLangRef.current = code
    // Re-read pages that were recognised automatically.
    setOcr((prev) => {
      const next = new Map(prev)
      for (const p of pagesRef.current) if (p.kind === 'scan' && next.get(p.number)?.state !== 'running') next.delete(p.number)
      return next
    })
  }

  /* ----- Edits ----- */

  const addAnnotation = useCallback(
    (a: Annotation) => {
      history.set((prev) => [...prev, a])
      setSelectedId(a.id)
      if (a.kind === 'text') setEditingId(a.id)
    },
    [history],
  )

  const patchAnnotation = useCallback(
    (id: string, patch: Partial<Annotation>, coalesce?: string) => {
      history.set((prev) => prev.map((a) => (a.id === id ? ({ ...a, ...patch } as Annotation) : a)), coalesce)
    },
    [history],
  )

  const deleteAnnotation = useCallback(
    (id: string) => {
      history.set((prev) => prev.filter((a) => a.id !== id))
      setSelectedId((s) => (s === id ? null : s))
      setEditingId((s) => (s === id ? null : s))
    },
    [history],
  )

  const stopEditing = useCallback(() => {
    const id = editingRef.current
    setEditingId(null)
    const a = annotationsRef.current.find((x) => x.id === id)
    // A new text box left empty disappears.
    if (a && a.kind === 'text' && !a.source && !a.text.trim()) deleteAnnotation(a.id)
  }, [deleteAnnotation])

  const editLine = useCallback(
    (page: number, lineId: string) => {
      const pt = pageTexts.get(page)
      if (!pt) return
      const picked = linesForClick(pt, lineId, unit)
      if (!picked) return
      const edited = editedLineIds(annotationsRef.current)
      const fresh = picked.lines.filter((l) => !edited.has(l.id))
      if (!fresh.length) {
        const existing = annotationsRef.current.find(
          (a) => a.kind === 'text' && a.source?.lineIds.includes(lineId),
        )
        if (existing) {
          setSelectedId(existing.id)
          setEditingId(existing.id)
        }
        return
      }
      const ann = editFromLines(fresh, picked.para, fresh.length > 1 ? 'paragraph' : 'line', isKoreanPage(pt))
      addAnnotation(ann)
    },
    [pageTexts, unit, addAnnotation],
  )

  // The save pipeline needs line geometry for erase boxes.
  useEffect(() => {
    const session = sessionRef.current
    if (session) session.lines = new Map([...pageTexts].map(([p, pt]) => [p, pt.lines]))
  }, [pageTexts])

  const hiddenByPage = useMemo(() => {
    const m = new Map<number, Set<string>>()
    for (const a of annotations) {
      if (a.kind !== 'text' || !a.source) continue
      const s = m.get(a.page) ?? new Set<string>()
      a.source.lineIds.forEach((id) => s.add(id))
      m.set(a.page, s)
    }
    return m
  }, [annotations])

  /* ----- Background patches for repainted areas ----- */

  const ensurePatches = useCallback(async (anns: Annotation[]) => {
    const maker = patchMakerRef.current
    if (!maker) return
    const byPage = new Map<number, Rect[]>()
    const push = (p: number, r: Rect) => byPage.set(p, [...(byPage.get(p) ?? []), r])
    for (const a of anns) {
      if (a.kind === 'text' && a.source) a.source.coverRects.forEach((r) => push(a.page, r))
      if (a.kind === 'whiteout' && a.fill === 'auto') push(a.page, a)
    }
    for (const [page, rects] of byPage) {
      try {
        const added = await maker.make(page, rects)
        if (added.length && patchMakerRef.current === maker)
          setPatchStamp((prev) => new Map(prev).set(page, (prev.get(page) ?? 0) + 1))
      } catch (e) {
        console.warn('patch failed', e)
      }
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => ensurePatches(annotations), 250)
    return () => clearTimeout(timer)
  }, [annotations, ensurePatches])

  /* ----- Live preview through the real save pipeline ----- */

  const previewQueue = useRef(new Set<number>())
  const previewBusy = useRef(false)
  const requested = useRef(new Map<number, string>())
  const patchStampRef = useRef(patchStamp)
  patchStampRef.current = patchStamp

  const pump = useCallback(async () => {
    if (previewBusy.current) return
    previewBusy.current = true
    try {
      while (previewQueue.current.size) {
        const p = previewQueue.current.values().next().value as number
        previewQueue.current.delete(p)
        const session = sessionRef.current
        if (!session) break
        const anns = annotationsRef.current.filter((a) => a.page === p)
        if (!anns.length) continue
        const entries = previewEntries(anns, editingRef.current)
        const hidden = new Set([...entries].filter(([, v]) => v === 'hidden').map(([k]) => k))
        try {
          const { url } = await renderEditedPage(session, p, anns, RENDER_SCALE, hidden)
          if (sessionRef.current !== session) break
          setPreviews((prev) => new Map(prev).set(p, { url, entries }))
        } catch (e) {
          console.warn('preview failed', e)
        }
      }
    } finally {
      previewBusy.current = false
    }
  }, [])

  useEffect(() => {
    const withEdits = new Set(annotations.map((a) => a.page))
    setPreviews((prev) => {
      let changed = false
      const next = new Map(prev)
      for (const p of prev.keys())
        if (!withEdits.has(p)) {
          next.delete(p)
          requested.current.delete(p)
          changed = true
        }
      return changed ? next : prev
    })
    const timer = setTimeout(() => {
      for (const p of withEdits) {
        const anns = annotations.filter((a) => a.page === p)
        const sig = entriesSignature(previewEntries(anns, editingId), patchStamp.get(p) ?? 0)
        if (requested.current.get(p) !== sig) {
          requested.current.set(p, sig)
          previewQueue.current.add(p)
        }
      }
      pump()
    }, 180)
    return () => clearTimeout(timer)
  }, [annotations, editingId, patchStamp, pump])

  /* ----- Image picker ----- */

  const pickImage = useCallback(async (imgFile: File) => {
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(imgFile)
    })
    const img = new Image()
    img.src = url
    await img.decode()
    let dataUrl = url
    if (!/^data:image\/(png|jpeg)/.test(url)) {
      const cv = document.createElement('canvas')
      cv.width = img.naturalWidth
      cv.height = img.naturalHeight
      cv.getContext('2d')!.drawImage(img, 0, 0)
      dataUrl = cv.toDataURL('image/png')
    }
    setPendingImage({ dataUrl, aspect: img.naturalWidth / Math.max(1, img.naturalHeight) })
  }, [])

  /* ----- Save ----- */

  const handleSave = useCallback(async () => {
    const session = sessionRef.current
    if (!file || !session) return
    setEditingId(null)
    setIsSaving(true)
    setWarnings([])
    try {
      const anns = annotationsRef.current
      await ensurePatches(anns)
      const result = await exportEditedPdf(session, anns)
      downloadBlob(bytesToBlob(result.bytes, 'application/pdf'), `${stripExtension(file.name)}_edited.pdf`)
      if (result.warnings.length) setWarnings([...new Set(result.warnings)])
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : pick(editMessages).errors.exportFailed)
    } finally {
      setIsSaving(false)
    }
  }, [file, ensurePatches])

  /* ----- Keyboard ----- */

  useEffect(() => {
    if (!file) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      const typing = el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) history.redo()
        else history.undo()
        return
      }
      if (mod && key === 'y') {
        e.preventDefault()
        history.redo()
        return
      }
      if (mod && key === 's') {
        e.preventDefault()
        handleSave()
        return
      }
      if (typing || mod || e.altKey) return
      const sel = annotationsRef.current.find((a) => a.id === selectedId)
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        e.preventDefault()
        deleteAnnotation(sel.id)
      } else if (e.key === 'Escape') {
        setSelectedId(null)
        setTool('select')
      } else if (e.key.startsWith('Arrow') && sel) {
        e.preventDefault()
        const info = pagesRef.current.find((p) => p.number === sel.page)
        if (!info) return
        const step = e.shiftKey ? 10 : 1
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
        if (!d) return
        const inv = invert(makeViewport(info.geom, 1).transform)
        const [x0, y0] = apply(inv, 0, 0)
        const [x1, y1] = apply(inv, d[0], d[1])
        patchAnnotation(sel.id, { x: sel.x + (x1 - x0), y: sel.y + (y1 - y0) }, `nudge:${sel.id}`)
      } else if (key === 'v') setTool('select')
      else if (key === 't') setTool('add-text')
      else if (key === 'e') setTool('whiteout')
      else if (key === 'i') setTool('image')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [file, history, selectedId, deleteAnnotation, patchAnnotation, handleSave])

  /* ----- Find & replace jump ----- */

  const jumpTo = useCallback((hit: FindHit) => {
    setTool('select')
    pageRefs.current.get(hit.page)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (hit.kind === 'edit') {
      setSelectedId(hit.targetId)
    } else {
      setFlashId(hit.targetId)
      setTimeout(() => setFlashId((f) => (f === hit.targetId ? null : f)), 1800)
    }
  }, [])

  /* ----- Render ----- */

  if (!file) {
    return (
      <div className="flex-1 flex flex-col">
        <ToolHeader icon={meta.icon} title={meta.name} description={meta.description} beta />
        <FileDrop onFiles={(fs) => setFile(fs[0])} multiple={false} />
      </div>
    )
  }

  const selected = annotations.find((a) => a.id === selectedId) ?? null
  const zoomIndex = ZOOMS.indexOf(zoom)
  const ocrBusy = [...ocr.values()].some((o) => o.state === 'running' || o.state === 'queued')

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ToolHeader
        icon={meta.icon}
        title={meta.name}
        description={meta.description}
        beta
        rightSlot={
          <div className="flex items-center gap-1.5">
            <button onClick={history.undo} disabled={!history.canUndo} className="btn-ghost px-2" title={t.undo}>
              <Undo2 className="w-4 h-4" />
            </button>
            <button onClick={history.redo} disabled={!history.canRedo} className="btn-ghost px-2" title={t.redo}>
              <Redo2 className="w-4 h-4" />
            </button>
            <div className="flex items-center rounded-lg border border-border mx-1">
              <button
                onClick={() => setZoom(ZOOMS[Math.max(0, zoomIndex - 1)])}
                disabled={zoomIndex <= 0}
                className="btn-ghost px-1.5 py-1.5"
                title={t.zoomOut}
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setZoom(1)} className="text-xs tabular-nums w-12 text-center text-fg-muted" title={t.zoomReset}>
                {Math.round(zoom * 100)}%
              </button>
              <button
                onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, zoomIndex + 1)])}
                disabled={zoomIndex >= ZOOMS.length - 1}
                className="btn-ghost px-1.5 py-1.5"
                title={t.zoomIn}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            {annotations.length > 0 && (
              <button onClick={() => history.set([])} disabled={isSaving} className="btn-ghost text-xs" title={t.discardAll}>
                <Trash2 className="w-3.5 h-3.5" />
                {t.clearEdits(annotations.length)}
              </button>
            )}
            <button onClick={handleSave} disabled={isSaving || !!loadProgress} className="btn-primary">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSaving ? t.saving : t.save}
            </button>
          </div>
        }
      />

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-72 shrink-0 border-r border-border bg-bg-subtle/30 overflow-y-auto p-4 space-y-5">
          <FilePill
            file={file}
            detail={pages.length > 0 ? c.pages(pages.length) : undefined}
            onRemove={() => {
              if (annotations.length && !confirm(t.confirmClose)) return
              closeFile()
            }}
          />
          <Toolbar
            tool={tool}
            onToolChange={setTool}
            unit={unit}
            onUnitChange={setUnit}
            eraseFill={eraseFill}
            onEraseFillChange={setEraseFill}
            newTextStyle={newTextStyle}
            onNewTextStyleChange={setNewTextStyle}
            onPickImage={pickImage}
            pendingImagePresent={!!pendingImage}
            showTextHints={showTextHints}
            onShowTextHintsChange={setShowTextHints}
          />
          <PropertiesPanel
            ann={selected}
            onPatch={(patch, coalesce) => selected && patchAnnotation(selected.id, patch, coalesce)}
            onDelete={() => selected && deleteAnnotation(selected.id)}
          />
          <FindReplace
            pageTexts={pageTexts}
            annotations={annotations}
            onReplaceAll={(next) => history.set(next)}
            onJump={jumpTo}
          />
          <div className="space-y-2">
            <Label>{t.ocr.title}</Label>
            <select value={ocrLang} onChange={(e) => changeOcrLang(e.target.value)} className="input w-full text-xs py-1.5">
              {EDITOR_OCR_LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            <Toggle checked={autoOcr} onChange={setAutoOcr} label={t.ocr.auto} hint={t.ocr.autoHint} />
            {ocrBusy && (
              <p className="text-[11px] text-fg-muted flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                {t.ocr.working}
              </p>
            )}
          </div>
          <div className="card p-3 text-[11px] text-fg-subtle leading-relaxed space-y-1.5">{t.tips}</div>
        </aside>

        <div
          className="flex-1 overflow-auto bg-bg-subtle/20 p-6"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setSelectedId(null)
          }}
        >
          {loadProgress && (
            <div className="flex items-center justify-center gap-2 pb-4 text-xs text-fg-muted">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t.renderingProgress(loadProgress.done, loadProgress.total)}
            </div>
          )}
          <div className="space-y-6 w-max min-w-full">
            {pages.map((p) => (
              <div
                key={p.number}
                ref={(el) => {
                  if (el) pageRefs.current.set(p.number, el)
                  else pageRefs.current.delete(p.number)
                }}
              >
                <PageView
                  page={p}
                  scale={scale}
                  preview={previews.get(p.number) ?? null}
                  text={pageTexts.get(p.number)}
                  hiddenLineIds={hiddenByPage.get(p.number) ?? EMPTY}
                  annotations={annotations.filter((a) => a.page === p.number)}
                  tool={tool}
                  unit={unit}
                  showTextHints={showTextHints}
                  selectedId={selectedId}
                  editingId={editingId}
                  flashId={flashId}
                  pendingImage={pendingImage}
                  patches={sessionRef.current?.patches ?? EMPTY_PATCHES}
                  newTextStyle={newTextStyle}
                  eraseFill={eraseFill}
                  ocr={ocr.get(p.number)}
                  onRunOcr={() => runOcr(p.number)}
                  onEditLine={(id) => editLine(p.number, id)}
                  onAdd={addAnnotation}
                  onPatch={patchAnnotation}
                  onDelete={deleteAnnotation}
                  onSelect={setSelectedId}
                  onStartEdit={setEditingId}
                  onStopEdit={stopEditing}
                  onImagePlaced={() => setPendingImage(null)}
                />
              </div>
            ))}
          </div>

          {warnings.length > 0 && (
            <div className="mt-4 max-w-2xl mx-auto">
              <StatusPanel variant="info" title={t.warnings.title(warnings.length)} message={t.warnings.intro}>
                <ul className="text-[11px] text-fg-muted space-y-1 list-disc pl-4">
                  {warnings.slice(0, 8).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </StatusPanel>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const EMPTY = new Set<string>()
const EMPTY_PATCHES = new Map()
