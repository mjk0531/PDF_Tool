import { useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { Annotation, TextAnnotation } from '../../lib/editor'

export interface PageInfo {
  number: number // 1-indexed
  width: number // PDF points
  height: number // PDF points
  thumbDataUrl: string // rendered background at the chosen display scale
}

export interface ExistingTextItem {
  id: string // stable id we synthesize
  text: string
  x: number // PDF points, baseline x
  y: number // PDF points, baseline y
  fontSize: number
  width: number // PDF points
  height: number // PDF points (approx)
}

export type Tool = 'select' | 'add-text' | 'image' | 'whiteout'

interface Props {
  pageInfo: PageInfo
  displayScale: number // CSS pixels per PDF point
  existingText: ExistingTextItem[]
  annotations: Annotation[]
  tool: Tool
  textStyle: { fontSize: number; color: string }
  /** Pending image waiting to be placed; clears on click. */
  pendingImageDataUrl: string | null
  onAddAnnotation: (a: Annotation) => void
  onUpdateAnnotation: (id: string, patch: Partial<Annotation>) => void
  onDeleteAnnotation: (id: string) => void
  onEditExistingText: (item: ExistingTextItem) => void
  onImagePlaced: () => void
}

/**
 * Pixel ↔ PDF-point conversions (with y-axis flip).
 *
 * Mouse events are in CSS pixels with origin top-left. PDF coordinate space
 * is in points with origin bottom-left. We translate at the boundary so
 * everything stored in the annotation model is in PDF points.
 */
function pxToPdf(
  px: { x: number; y: number },
  scale: number,
  pageHeightPts: number,
): { x: number; y: number } {
  return { x: px.x / scale, y: pageHeightPts - px.y / scale }
}

function pdfRectToCss(
  rect: { x: number; y: number; width: number; height: number },
  scale: number,
  pageHeightPts: number,
): { left: number; top: number; width: number; height: number } {
  return {
    left: rect.x * scale,
    top: (pageHeightPts - rect.y - rect.height) * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  }
}

function textBaselineToCss(
  ann: TextAnnotation,
  scale: number,
  pageHeightPts: number,
): { left: number; top: number; fontSize: number } {
  // PDF text y is the baseline; CSS top is the top edge of the line box.
  // We approximate ascent as 0.8 * fontSize.
  const ascent = ann.fontSize * 0.8
  return {
    left: ann.x * scale,
    top: (pageHeightPts - ann.y - ascent) * scale,
    fontSize: ann.fontSize * scale,
  }
}

export function PageView({
  pageInfo,
  displayScale,
  existingText,
  annotations,
  tool,
  textStyle,
  pendingImageDataUrl,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onEditExistingText,
  onImagePlaced,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [whiteoutDraft, setWhiteoutDraft] = useState<{
    startPx: { x: number; y: number }
    currentPx: { x: number; y: number }
  } | null>(null)

  const cssW = pageInfo.width * displayScale
  const cssH = pageInfo.height * displayScale

  /* ----- Mouse helpers ----- */

  function localPx(e: React.MouseEvent | MouseEvent): { x: number; y: number } | null {
    const el = containerRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  /* ----- Click handler (per active tool) ----- */

  function handleClick(e: React.MouseEvent) {
    if (tool === 'select') return
    const px = localPx(e)
    if (!px) return
    const pt = pxToPdf(px, displayScale, pageInfo.height)

    if (tool === 'add-text') {
      onAddAnnotation({
        id: genUiId(),
        page: pageInfo.number,
        kind: 'text',
        x: pt.x,
        y: pt.y,
        width: 200, // default; user can drag the bottom-right corner to resize
        text: 'Type here',
        fontSize: textStyle.fontSize,
        color: textStyle.color,
      } as Annotation)
    } else if (tool === 'image' && pendingImageDataUrl) {
      const defaultW = 120 // points
      const defaultH = 60
      onAddAnnotation({
        id: genUiId(),
        page: pageInfo.number,
        kind: 'image',
        x: pt.x - defaultW / 2,
        y: pt.y - defaultH / 2,
        width: defaultW,
        height: defaultH,
        dataUrl: pendingImageDataUrl,
      } as Annotation)
      onImagePlaced()
    }
  }

  /* ----- Drag handler for whiteout rectangle ----- */

  function handleMouseDown(e: React.MouseEvent) {
    if (tool !== 'whiteout') return
    const px = localPx(e)
    if (!px) return
    setWhiteoutDraft({ startPx: px, currentPx: px })
  }

  useEffect(() => {
    if (!whiteoutDraft) return
    const onMove = (e: MouseEvent) => {
      const px = localPx(e)
      if (!px) return
      setWhiteoutDraft((d) => (d ? { ...d, currentPx: px } : null))
    }
    const onUp = (e: MouseEvent) => {
      const px = localPx(e)
      if (px && whiteoutDraft) {
        const a = whiteoutDraft.startPx
        const b = px
        const leftPx = Math.min(a.x, b.x)
        const topPx = Math.min(a.y, b.y)
        const widthPx = Math.abs(b.x - a.x)
        const heightPx = Math.abs(b.y - a.y)
        if (widthPx > 4 && heightPx > 4) {
          const x = leftPx / displayScale
          const yTop = topPx / displayScale
          const width = widthPx / displayScale
          const height = heightPx / displayScale
          onAddAnnotation({
            id: genUiId(),
            page: pageInfo.number,
            kind: 'whiteout',
            x,
            y: pageInfo.height - yTop - height,
            width,
            height,
          } as Annotation)
        }
      }
      setWhiteoutDraft(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whiteoutDraft, displayScale, pageInfo.height])

  /* ----- Cursor based on tool ----- */

  const cursor =
    tool === 'add-text'
      ? 'text'
      : tool === 'image' && pendingImageDataUrl
        ? 'crosshair'
        : tool === 'whiteout'
          ? 'crosshair'
          : 'default'

  /* ----- Whiteout draft preview rectangle ----- */

  let draftRect: { left: number; top: number; width: number; height: number } | null = null
  if (whiteoutDraft) {
    const a = whiteoutDraft.startPx
    const b = whiteoutDraft.currentPx
    draftRect = {
      left: Math.min(a.x, b.x),
      top: Math.min(a.y, b.y),
      width: Math.abs(b.x - a.x),
      height: Math.abs(b.y - a.y),
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle px-1">
        Page {pageInfo.number}
      </div>
      <div
        ref={containerRef}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        className="relative bg-white shadow-sm border border-border mx-auto select-none"
        style={{ width: cssW, height: cssH, cursor }}
      >
        {/* Rendered page background */}
        <img
          src={pageInfo.thumbDataUrl}
          alt={`Page ${pageInfo.number}`}
          draggable={false}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />

        {/* Existing-text overlay — only interactive in select mode */}
        {tool === 'select' &&
          existingText.map((item) => {
            const css = pdfRectToCss(
              { x: item.x, y: item.y, width: item.width, height: item.height },
              displayScale,
              pageInfo.height,
            )
            return (
              <button
                key={item.id}
                onClick={(e) => {
                  e.stopPropagation()
                  onEditExistingText(item)
                }}
                className="absolute hover:bg-accent/20 hover:outline hover:outline-1 hover:outline-accent transition-colors"
                style={{
                  left: css.left,
                  top: css.top,
                  width: css.width,
                  height: css.height,
                  cursor: 'text',
                }}
                title={`Edit: ${item.text}`}
              />
            )
          })}

        {/* Annotations */}
        {annotations
          .filter((a) => a.page === pageInfo.number)
          .map((ann) =>
            ann.kind === 'text' ? (
              <TextAnnotationView
                key={ann.id}
                ann={ann}
                scale={displayScale}
                pageHeightPts={pageInfo.height}
                onChange={(text) => onUpdateAnnotation(ann.id, { text })}
                onResizeWidth={(width) => onUpdateAnnotation(ann.id, { width })}
                onDelete={() => onDeleteAnnotation(ann.id)}
              />
            ) : ann.kind === 'image' ? (
              <ImageAnnotationView
                key={ann.id}
                ann={ann}
                scale={displayScale}
                pageHeightPts={pageInfo.height}
                onMove={(x, y) => onUpdateAnnotation(ann.id, { x, y })}
                onResize={(width, height) => onUpdateAnnotation(ann.id, { width, height })}
                onDelete={() => onDeleteAnnotation(ann.id)}
              />
            ) : (
              <WhiteoutAnnotationView
                key={ann.id}
                ann={ann}
                scale={displayScale}
                pageHeightPts={pageInfo.height}
                onDelete={() => onDeleteAnnotation(ann.id)}
              />
            ),
          )}

        {/* Whiteout draft preview */}
        {draftRect && (
          <div
            className="absolute bg-white/70 border-2 border-dashed border-accent pointer-events-none"
            style={draftRect}
          />
        )}
      </div>
    </div>
  )
}

/* ---------- Per-annotation sub-views ---------- */

function TextAnnotationView({
  ann,
  scale,
  pageHeightPts,
  onChange,
  onResizeWidth,
  onDelete,
}: {
  ann: TextAnnotation
  scale: number
  pageHeightPts: number
  onChange: (text: string) => void
  onResizeWidth: (width: number) => void
  onDelete: () => void
}) {
  const css = textBaselineToCss(ann, scale, pageHeightPts)
  const widthPx = ann.width * scale
  const [resizing, setResizing] = useState<{
    startX: number
    startWidth: number
  } | null>(null)

  useEffect(() => {
    if (!resizing) return
    const onMove = (e: MouseEvent) => {
      const dx = (e.clientX - resizing.startX) / scale
      onResizeWidth(Math.max(20, resizing.startWidth + dx))
    }
    const onUp = () => setResizing(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing, scale])

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="absolute group"
      style={{ left: css.left, top: css.top, width: widthPx }}
    >
      <textarea
        value={ann.text}
        onChange={(e) => onChange(e.target.value)}
        rows={Math.max(1, ann.text.split('\n').length)}
        className="bg-transparent outline-none border border-transparent group-hover:border-accent/50 focus:border-accent px-0.5 resize-none w-full overflow-hidden"
        style={{
          fontSize: css.fontSize,
          color: ann.color,
          fontFamily: '"Pretendard", "Pretendard Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          lineHeight: 1.2,
        }}
      />
      <button
        onClick={onDelete}
        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center"
        title="Delete"
      >
        <Trash2 className="w-2.5 h-2.5" />
      </button>
      <span
        onMouseDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setResizing({ startX: e.clientX, startWidth: ann.width })
        }}
        className="absolute -right-1 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-accent rounded-sm cursor-ew-resize opacity-0 group-hover:opacity-100"
        title="Drag to set wrap width"
      />
    </div>
  )
}

function ImageAnnotationView({
  ann,
  scale,
  pageHeightPts,
  onMove,
  onResize,
  onDelete,
}: {
  ann: import('../../lib/editor').ImageAnnotation
  scale: number
  pageHeightPts: number
  onMove: (x: number, y: number) => void
  onResize: (width: number, height: number) => void
  onDelete: () => void
}) {
  const css = pdfRectToCss(ann, scale, pageHeightPts)
  const [dragging, setDragging] = useState<{
    kind: 'move' | 'resize'
    startMouse: { x: number; y: number }
    startBox: { x: number; y: number; width: number; height: number }
  } | null>(null)

  useEffect(() => {
    if (!dragging) return
    const onMove2 = (e: MouseEvent) => {
      const dx = (e.clientX - dragging.startMouse.x) / scale
      const dy = (e.clientY - dragging.startMouse.y) / scale
      if (dragging.kind === 'move') {
        // dy in screen pixels → PDF y goes the other way
        onMove(dragging.startBox.x + dx, dragging.startBox.y - dy)
      } else {
        const newW = Math.max(8, dragging.startBox.width + dx)
        const newH = Math.max(8, dragging.startBox.height + dy)
        onResize(newW, newH)
      }
    }
    const onUp = () => setDragging(null)
    window.addEventListener('mousemove', onMove2)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove2)
      window.removeEventListener('mouseup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, scale])

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="absolute group border border-transparent hover:border-accent/50"
      style={{ left: css.left, top: css.top, width: css.width, height: css.height }}
    >
      <img
        src={ann.dataUrl}
        alt=""
        draggable={false}
        onMouseDown={(e) => {
          e.preventDefault()
          setDragging({
            kind: 'move',
            startMouse: { x: e.clientX, y: e.clientY },
            startBox: { x: ann.x, y: ann.y, width: ann.width, height: ann.height },
          })
        }}
        className="w-full h-full object-fill cursor-move"
      />
      <span
        onMouseDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragging({
            kind: 'resize',
            startMouse: { x: e.clientX, y: e.clientY },
            startBox: { x: ann.x, y: ann.y, width: ann.width, height: ann.height },
          })
        }}
        className="absolute -right-1 -bottom-1 w-3 h-3 bg-accent rounded-sm cursor-se-resize opacity-0 group-hover:opacity-100"
      />
      <button
        onClick={onDelete}
        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center"
        title="Delete"
      >
        <Trash2 className="w-2.5 h-2.5" />
      </button>
    </div>
  )
}

function WhiteoutAnnotationView({
  ann,
  scale,
  pageHeightPts,
  onDelete,
}: {
  ann: import('../../lib/editor').WhiteoutAnnotation
  scale: number
  pageHeightPts: number
  onDelete: () => void
}) {
  const css = pdfRectToCss(ann, scale, pageHeightPts)
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="absolute group bg-white border border-transparent hover:border-accent/50"
      style={{ left: css.left, top: css.top, width: css.width, height: css.height }}
    >
      <button
        onClick={onDelete}
        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center"
        title="Delete"
      >
        <Trash2 className="w-2.5 h-2.5" />
      </button>
    </div>
  )
}

function genUiId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}
