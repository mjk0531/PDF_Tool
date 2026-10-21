import { useEffect, useRef } from 'react'
import { GripVertical, X } from 'lucide-react'
import type { TextAnnotation } from '../../lib/editor'
import { apply, invert, textFrame, type Matrix } from '../../lib/editorGeometry'
import { cssFontFamily, cssOriginalFamily, prefersPretendard } from '../../lib/editorFonts'
import { useMessages } from '../../i18n'
import editMessages from '../../i18n/messages/edit'

const metricsCache = new Map<string, { ascent: number; descent: number }>()
let metricsCtx: CanvasRenderingContext2D | null = null

/** Line-box ascent/descent (em) the browser uses for a font stack. */
function cssMetrics(fontFamily: string) {
  const hit = metricsCache.get(fontFamily)
  if (hit) return hit
  const ctx = (metricsCtx ??= document.createElement('canvas').getContext('2d')!)
  ctx.font = `100px ${fontFamily}`
  const m = ctx.measureText('Hg한')
  const res = {
    ascent: (m.fontBoundingBoxAscent || 90) / 100,
    descent: (m.fontBoundingBoxDescent || 25) / 100,
  }
  if (document.fonts.check(`100px ${fontFamily.split(',')[0]}`)) metricsCache.set(fontFamily, res)
  return res
}

export function textCss(ann: TextAnnotation, scale: number) {
  const st = ann.style
  const korean = prefersPretendard(
    ann.text + (ann.source?.originalText ?? ''),
    ann.source?.font?.displayName,
    ann.source?.koreanPage,
  )
  const family = st.family === 'original' ? (ann.source?.font?.family ?? 'sans') : st.family
  // The document's own fonts first (when installed locally), then a lookalike.
  const docFonts =
    st.family === 'original' && ann.source
      ? (ann.source.fonts?.length ? ann.source.fonts : ann.source.font ? [ann.source.font] : []).map(
          (f) => `"${cssOriginalFamily(f)}"`,
        )
      : []
  const fontFamily = [...docFonts, cssFontFamily(family, korean)].join(', ')
  const fontPx = st.fontSize * scale
  const { ascent, descent } = cssMetrics(fontFamily)
  const linePx = st.lineHeight * fontPx
  return {
    fontFamily,
    fontPx,
    linePx,
    /** Distance from the top of the first line box to its baseline. */
    baseline: (linePx - (ascent + descent) * fontPx) / 2 + ascent * fontPx,
  }
}

interface Props {
  ann: TextAnnotation
  vt: Matrix
  scale: number
  editing: boolean
  selected: boolean
  /** The page preview already shows exactly this edit. */
  rendered: boolean
  onSelect: () => void
  onStartEdit: () => void
  onStopEdit: () => void
  onPatch: (patch: Partial<TextAnnotation>, coalesce?: string) => void
  onDelete: () => void
}

export function TextEditBox({
  ann,
  vt,
  scale,
  editing,
  selected,
  rendered,
  onSelect,
  onStartEdit,
  onStopEdit,
  onPatch,
  onDelete,
}: Props) {
  const t = useMessages(editMessages).page
  const ref = useRef<HTMLDivElement>(null)
  const st = ann.style
  const frame = textFrame(vt, ann.x, ann.y, ann.rotation)
  const css = textCss(ann, scale)
  const boxW = Math.max(8, ann.width * scale)
  const h = st.hScale || 1

  // Load text into the editable element when editing starts or text changes elsewhere (undo, replace).
  useEffect(() => {
    const el = ref.current
    if (!el || !editing) return
    if (el.innerText !== ann.text) el.innerText = ann.text
  }, [editing, ann.text])

  useEffect(() => {
    const el = ref.current
    if (!el || !editing) return
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }, [editing])

  /** Drag helper: device-pixel deltas → callback, with the edit captured at drag start. */
  const drag = (onMove: (dx: number, dy: number) => void) => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onSelect()
    const sx = e.clientX
    const sy = e.clientY
    const move = (ev: PointerEvent) => onMove(ev.clientX - sx, ev.clientY - sy)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const inv = invert(vt)
  // Captured by the drag closures below: the edit as it was when the drag began.
  const start = { x: ann.x, y: ann.y, width: ann.width }
  const startMove = drag((dx, dy) => {
    const [x0, y0] = apply(inv, 0, 0)
    const [x1, y1] = apply(inv, dx, dy)
    onPatch({ x: start.x + (x1 - x0), y: start.y + (y1 - y0) }, `move:${ann.id}`)
  })
  const startWidth = drag((dx, dy) => {
    const rad = (frame.rotation * Math.PI) / 180
    const along = dx * Math.cos(rad) + dy * Math.sin(rad)
    onPatch({ width: Math.max(10, start.width + along / scale), wrap: true, fit: 'none' }, `width:${ann.id}`)
  })

  const showChrome = selected || editing
  const color = editing || !rendered ? st.color : 'transparent'

  return (
    <div
      className="absolute"
      style={{ left: frame.left, top: frame.top, transform: `rotate(${frame.rotation}deg)`, transformOrigin: '0 0' }}
    >
      <div
        className={`absolute group ${showChrome ? 'z-20' : 'z-10'}`}
        style={{ left: 0, top: -css.baseline, width: boxW }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`absolute -inset-[3px] rounded-sm pointer-events-none border ${
            editing
              ? 'border-accent'
              : selected
                ? 'border-accent/80 border-dashed'
                : 'border-transparent group-hover:border-accent/50 group-hover:border-dashed'
          }`}
        />
        <div
          ref={ref}
          contentEditable={editing ? 'plaintext-only' : false}
          suppressContentEditableWarning
          spellCheck={false}
          onPointerDown={(e) => {
            if (editing) return
            e.stopPropagation()
            onSelect()
            onStartEdit()
          }}
          onInput={(e) => onPatch({ text: e.currentTarget.innerText.replace(/\n$/, '') }, `text:${ann.id}`)}
          onBlur={onStopEdit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              ;(e.currentTarget as HTMLElement).blur()
            }
          }}
          className="relative outline-none cursor-text"
          style={{
            width: boxW / h,
            transform: h !== 1 ? `scaleX(${h})` : undefined,
            transformOrigin: '0 0',
            fontFamily: css.fontFamily,
            fontSize: css.fontPx,
            lineHeight: `${css.linePx}px`,
            fontWeight: st.bold ? 700 : 400,
            fontStyle: st.italic ? 'italic' : 'normal',
            color,
            caretColor: st.color,
            textAlign: st.align,
            textAlignLast: st.align === 'justify' ? 'left' : undefined,
            textIndent: ann.indent ? (ann.indent * scale) / h : undefined,
            whiteSpace: ann.wrap ? 'pre-wrap' : 'pre',
            wordBreak: 'keep-all',
            overflowWrap: 'break-word',
            minHeight: css.linePx,
          }}
        >
          {editing ? null : ann.text || ' '}
        </div>

        {showChrome && (
          <>
            <span
              onPointerDown={startMove}
              className="absolute -left-5 top-0 w-4 h-5 rounded-sm bg-accent text-white flex items-center justify-center cursor-move shadow"
              title={t.move}
            >
              <GripVertical className="w-3 h-3" />
            </span>
            <span
              onPointerDown={startWidth}
              className="absolute -right-[5px] top-1/2 -translate-y-1/2 w-1.5 h-5 bg-accent rounded-sm cursor-ew-resize shadow"
              title={t.dragWrapWidth}
            />
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              className="absolute -top-3 -right-3 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow"
              title={ann.source ? t.restoreOriginal : t.delete}
            >
              <X className="w-3 h-3" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
