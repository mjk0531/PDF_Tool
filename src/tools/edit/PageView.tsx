import { useMemo, useRef, useState } from 'react'
import { Loader2, ScanText, X } from 'lucide-react'
import type { Annotation, ImageAnnotation, TextAnnotation, TextStyle, WhiteoutAnnotation } from '../../lib/editor'
import {
  apply,
  boxToRect,
  invert,
  makeViewport,
  rectKey,
  rectToBox,
  textFrame,
  unionRect,
  type Box,
  type Matrix,
  type Rect,
} from '../../lib/editorGeometry'
import { lineBox, type PageText, type TextLine } from '../../lib/editorLayout'
import type { PageInfo } from '../../lib/editorLoad'
import type { EditUnit } from '../../lib/editorEdits'
import type { Patch } from '../../lib/editorPixels'
import { genId } from '../../lib/editor'
import { TextEditBox } from './TextEditBox'
import type { PagePreview } from './keys'
import { objKey } from './keys'
import { useMessages } from '../../i18n'
import commonMessages from '../../i18n/messages/common'
import editMessages from '../../i18n/messages/edit'

export type Tool = 'select' | 'add-text' | 'image' | 'whiteout'

export interface OcrState {
  state: 'queued' | 'running' | 'done' | 'error'
  status?: string
}

interface Props {
  page: PageInfo
  scale: number
  preview: PagePreview | null
  text: PageText | undefined
  hiddenLineIds: Set<string>
  annotations: Annotation[]
  tool: Tool
  unit: EditUnit
  showTextHints: boolean
  selectedId: string | null
  editingId: string | null
  flashId: string | null
  pendingImage: { dataUrl: string; aspect: number } | null
  patches: Map<string, Patch>
  newTextStyle: TextStyle
  eraseFill: 'auto' | 'white'
  ocr: OcrState | undefined
  onRunOcr: () => void
  onEditLine: (lineId: string) => void
  onAdd: (a: Annotation) => void
  onPatch: (id: string, patch: Partial<Annotation>, coalesce?: string) => void
  onDelete: (id: string) => void
  onSelect: (id: string | null) => void
  onStartEdit: (id: string) => void
  onStopEdit: () => void
  onImagePlaced: () => void
}

export function PageView(props: Props) {
  const {
    page,
    scale,
    preview,
    text,
    hiddenLineIds,
    annotations,
    tool,
    unit,
    showTextHints,
    selectedId,
    editingId,
    flashId,
    pendingImage,
    patches,
    newTextStyle,
    eraseFill,
    ocr,
  } = props
  const t = useMessages(editMessages)
  const c = useMessages(commonMessages)
  const ref = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<{ a: [number, number]; b: [number, number] } | null>(null)

  const vp = useMemo(() => makeViewport(page.geom, scale), [page.geom, scale])
  const vt = vp.transform

  const local = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = ref.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  /* ----- Page-level pointer handling (per tool) ----- */

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    const p = local(e)
    if (tool === 'select') {
      props.onSelect(null)
      return
    }
    if (tool === 'add-text') {
      const st = newTextStyle
      const [x, y] = apply(invert(vt), p[0], p[1] + st.fontSize * scale * 0.8)
      const ann: TextAnnotation = {
        id: genId(),
        page: page.number,
        kind: 'text',
        x,
        y,
        width: 220,
        rotation: page.geom.rotate,
        text: '',
        style: { ...st },
        wrap: true,
        fit: 'none',
        indent: 0,
      }
      props.onAdd(ann)
      return
    }
    if (tool === 'image' && pendingImage) {
      const w = 160 * scale
      const h = w / pendingImage.aspect
      const r = boxToRect(vt, { left: p[0] - w / 2, top: p[1] - h / 2, width: w, height: h })
      props.onAdd({ id: genId(), page: page.number, kind: 'image', ...r, dataUrl: pendingImage.dataUrl })
      props.onImagePlaced()
      return
    }
    if (tool === 'whiteout') {
      e.preventDefault()
      setDraft({ a: p, b: p })
      const move = (ev: PointerEvent) => setDraft((d) => (d ? { ...d, b: local(ev) } : d))
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        const b = local(ev)
        setDraft(null)
        const box: Box = {
          left: Math.min(p[0], b[0]),
          top: Math.min(p[1], b[1]),
          width: Math.abs(b[0] - p[0]),
          height: Math.abs(b[1] - p[1]),
        }
        if (box.width < 4 || box.height < 4) return
        props.onAdd({
          id: genId(),
          page: page.number,
          kind: 'whiteout',
          ...boxToRect(vt, box),
          fill: eraseFill,
          color: '#ffffff',
        })
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }
  }

  /* ----- Detected text targets ----- */

  const lines = (text?.lines ?? []).filter((l) => !hiddenLineIds.has(l.id))
  const paraTargets = useMemo(() => {
    if (unit !== 'paragraph' || !text) return []
    return text.paragraphs
      .map((p) => {
        const ls = p.lineIds
          .map((id) => text.lines.find((l) => l.id === id))
          .filter((l): l is TextLine => !!l && !hiddenLineIds.has(l.id))
        if (!ls.length || ls.some((l) => Math.abs(l.angle) >= 0.5)) return null
        return { id: p.id, first: ls[0], rect: unionRect(ls.map(lineBox)), ocr: ls[0].origin === 'ocr' }
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
  }, [unit, text, hiddenLineIds])
  const paraLineIds = useMemo(() => {
    const s = new Set<string>()
    if (unit === 'paragraph' && text)
      for (const p of paraTargets) for (const id of text.paragraphs.find((q) => q.id === p.id)!.lineIds) s.add(id)
    return s
  }, [unit, text, paraTargets])

  const targetClass = (ocrLine: boolean, flash: boolean) =>
    `absolute rounded-[2px] transition-colors cursor-text ${
      flash
        ? 'bg-amber-300/40 outline outline-2 outline-amber-500'
        : showTextHints
          ? ocrLine
            ? 'outline outline-1 outline-dashed outline-amber-500/60 hover:bg-amber-400/20'
            : 'outline outline-1 outline-dashed outline-accent/40 hover:bg-accent/15'
          : ocrLine
            ? 'hover:bg-amber-400/20 hover:outline hover:outline-1 hover:outline-amber-500'
            : 'hover:bg-accent/15 hover:outline hover:outline-1 hover:outline-accent'
    }`

  const describe = (l: TextLine) => {
    const parts = [l.font?.displayName ?? t.page.ocrText, `${Math.round(l.fontSize * 10) / 10}pt`, l.color]
    if (l.bold) parts.push(t.props.bold)
    if (l.confidence !== undefined) parts.push(t.page.confidence(l.confidence))
    return `${l.text}\n${parts.join(' · ')}`
  }

  /* ----- Edits ----- */

  const rendered = (a: Annotation) => !!preview && preview.entries.get(a.id) === objKey(a)
  const coverInPreview = (a: TextAnnotation) =>
    !!preview && preview.entries.has(a.id) && (a.id !== editingId || preview.entries.get(a.id) === 'hidden')

  const bgUrl = preview?.url ?? page.bgUrl
  const kindBadge =
    page.kind === 'scan' || page.kind === 'ocr-layer' ? t.page.kind[page.kind] : page.kind === 'mixed' ? t.page.kind.mixed : null

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 px-1 min-h-[22px]">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">{c.page(page.number)}</span>
        {kindBadge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400">
            {kindBadge}
          </span>
        )}
        <span className="flex-1" />
        {ocr?.state === 'running' || ocr?.state === 'queued' ? (
          <span className="flex items-center gap-1.5 text-[11px] text-fg-muted">
            <Loader2 className="w-3 h-3 animate-spin" />
            {ocr.state === 'queued' ? t.ocr.queued : (ocr.status ?? t.ocr.recognizing)}
          </span>
        ) : page.kind === 'scan' || page.kind === 'mixed' || ocr ? (
          <button onClick={props.onRunOcr} className="btn-ghost text-[11px] px-2 py-1">
            <ScanText className="w-3.5 h-3.5" />
            {ocr?.state === 'done' ? t.ocr.rerun : page.kind === 'mixed' ? t.ocr.findInImages : t.ocr.run}
          </button>
        ) : null}
      </div>

      <div
        ref={ref}
        onPointerDown={onPointerDown}
        className="relative bg-white shadow-sm border border-border mx-auto select-none touch-none"
        style={{
          width: vp.width,
          height: vp.height,
          cursor:
            tool === 'add-text' ? 'text' : tool === 'whiteout' || (tool === 'image' && pendingImage) ? 'crosshair' : 'default',
        }}
      >
        <img src={bgUrl} alt={c.page(page.number)} draggable={false} className="absolute inset-0 w-full h-full pointer-events-none" />

        {/* Original text to click on */}
        {tool === 'select' && (
          <>
            {paraTargets.map((p) => {
              const b = rectToBox(vt, p.rect)
              return (
                <button
                  key={p.id}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    props.onEditLine(p.first.id)
                  }}
                  className={targetClass(p.ocr, flashId === p.first.id)}
                  style={{ left: b.left, top: b.top, width: b.width, height: b.height }}
                  title={describe(p.first)}
                />
              )
            })}
            {lines
              .filter((l) => !paraLineIds.has(l.id))
              .map((l) => {
                const f = textFrame(vt, l.x, l.y, l.angle)
                return (
                  <button
                    key={l.id}
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      props.onEditLine(l.id)
                    }}
                    className={targetClass(l.origin === 'ocr', flashId === l.id)}
                    style={{
                      left: f.left,
                      top: f.top - l.ascent * l.fontSize * scale,
                      width: Math.max(4, l.width * scale),
                      height: (l.ascent - l.descent) * l.fontSize * scale,
                      transform: `rotate(${f.rotation}deg)`,
                      transformOrigin: `0 ${l.ascent * l.fontSize * scale}px`,
                    }}
                    title={describe(l)}
                  />
                )
              })}
          </>
        )}

        {/* Repaint under edits whose removal the preview doesn't show yet */}
        {annotations.map((a) =>
          a.kind === 'text' && a.source && !coverInPreview(a)
            ? a.source.coverRects.map((r, k) => (
                <CoverPaint key={`${a.id}-c${k}`} rect={r} vt={vt} patch={patches.get(rectKey(page.number, r))} color={a.source!.bg} />
              ))
            : null,
        )}

        {annotations.map((a) => {
          if (a.kind === 'text')
            return (
              <TextEditBox
                key={a.id}
                ann={a}
                vt={vt}
                scale={scale}
                editing={editingId === a.id}
                selected={selectedId === a.id}
                rendered={rendered(a)}
                onSelect={() => props.onSelect(a.id)}
                onStartEdit={() => props.onStartEdit(a.id)}
                onStopEdit={props.onStopEdit}
                onPatch={(patch, coalesce) => props.onPatch(a.id, patch, coalesce)}
                onDelete={() => props.onDelete(a.id)}
              />
            )
          return (
            <RectEdit
              key={a.id}
              ann={a}
              vt={vt}
              selected={selectedId === a.id}
              rendered={rendered(a)}
              patch={a.kind === 'whiteout' && a.fill === 'auto' ? patches.get(rectKey(page.number, a)) : undefined}
              onSelect={() => props.onSelect(a.id)}
              onPatch={(patch, coalesce) => props.onPatch(a.id, patch, coalesce)}
              onDelete={() => props.onDelete(a.id)}
              deleteTitle={t.page.delete}
            />
          )
        })}

        {draft && (
          <div
            className="absolute bg-white/60 border-2 border-dashed border-accent pointer-events-none"
            style={{
              left: Math.min(draft.a[0], draft.b[0]),
              top: Math.min(draft.a[1], draft.b[1]),
              width: Math.abs(draft.b[0] - draft.a[0]),
              height: Math.abs(draft.b[1] - draft.a[1]),
            }}
          />
        )}
      </div>
    </div>
  )
}

/* ---------- Pieces ---------- */

function CoverPaint({ rect, vt, patch, color }: { rect: Rect; vt: Matrix; patch?: Patch; color: string }) {
  const b = rectToBox(vt, rect)
  const img = patch && !patch.uniform && patch.dataUrl ? patch.dataUrl : null
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: b.left,
        top: b.top,
        width: b.width,
        height: b.height,
        backgroundColor: patch?.color ?? color,
        backgroundImage: img ? `url(${img})` : undefined,
        backgroundSize: '100% 100%',
      }}
    />
  )
}

function RectEdit({
  ann,
  vt,
  selected,
  rendered,
  patch,
  onSelect,
  onPatch,
  onDelete,
  deleteTitle,
}: {
  ann: ImageAnnotation | WhiteoutAnnotation
  vt: Matrix
  selected: boolean
  rendered: boolean
  patch?: Patch
  onSelect: () => void
  onPatch: (patch: Partial<Annotation>, coalesce?: string) => void
  onDelete: () => void
  deleteTitle: string
}) {
  const b = rectToBox(vt, ann)
  const start = { ...b }
  const drag = (kind: 'move' | 'resize') => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onSelect()
    const sx = e.clientX
    const sy = e.clientY
    const aspect = start.width / Math.max(1, start.height)
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx
      const dy = ev.clientY - sy
      let box: Box
      if (kind === 'move') box = { ...start, left: start.left + dx, top: start.top + dy }
      else {
        const width = Math.max(6, start.width + dx)
        const height = ann.kind === 'image' && !ev.shiftKey ? width / aspect : Math.max(6, start.height + dy)
        box = { ...start, width, height }
      }
      onPatch(boxToRect(vt, box), `${kind}:${ann.id}`)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const fill =
    ann.kind === 'whiteout'
      ? ann.fill === 'white'
        ? '#ffffff'
        : ann.fill === 'custom'
          ? ann.color
          : (patch?.color ?? ann.color)
      : undefined
  const patchImg = ann.kind === 'whiteout' && patch && !patch.uniform && patch.dataUrl ? patch.dataUrl : null

  return (
    <div
      onPointerDown={drag('move')}
      onClick={(e) => e.stopPropagation()}
      className={`absolute group cursor-move ${selected ? 'outline outline-2 outline-accent' : 'hover:outline hover:outline-1 hover:outline-accent/60'}`}
      style={{
        left: b.left,
        top: b.top,
        width: b.width,
        height: b.height,
        backgroundColor: !rendered ? fill : undefined,
        backgroundImage: !rendered && patchImg ? `url(${patchImg})` : undefined,
        backgroundSize: '100% 100%',
      }}
    >
      {ann.kind === 'image' && !rendered && (
        <img src={ann.dataUrl} alt="" draggable={false} className="w-full h-full object-fill pointer-events-none" />
      )}
      <span
        onPointerDown={drag('resize')}
        className={`absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-accent rounded-sm cursor-se-resize ${
          selected ? '' : 'opacity-0 group-hover:opacity-100'
        }`}
      />
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className={`absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow ${
          selected ? '' : 'opacity-0 group-hover:opacity-100'
        }`}
        title={deleteTitle}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
