import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Italic, RotateCcw, Trash2, Undo2 } from 'lucide-react'
import type { Annotation, TextAnnotation, TextStyle } from '../../lib/editor'
import type { TextAlign } from '../../lib/editorLayout'
import { Segmented } from '../../components/shared/OptionGroup'
import { IconToggle, Label } from './Toolbar'
import { useMessages } from '../../i18n'
import editMessages from '../../i18n/messages/edit'

interface Props {
  ann: Annotation | null
  onPatch: (patch: Partial<Annotation>, coalesce?: string) => void
  onDelete: () => void
}

const ALIGN_ICONS: Record<TextAlign, typeof AlignLeft> = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
  justify: AlignJustify,
}

export function PropertiesPanel({ ann, onPatch, onDelete }: Props) {
  const m = useMessages(editMessages).props
  if (!ann) {
    return <div className="card p-3 text-[11px] text-fg-subtle leading-relaxed">{m.empty}</div>
  }

  if (ann.kind === 'text') return <TextProps ann={ann} onPatch={onPatch} onDelete={onDelete} />

  return (
    <div className="card p-3 space-y-3">
      <Label>{ann.kind === 'image' ? m.imageTitle : m.eraseTitle}</Label>
      {ann.kind === 'whiteout' && (
        <>
          <Segmented
            value={ann.fill}
            options={[
              { value: 'auto', label: m.fillAuto },
              { value: 'white', label: m.fillWhite },
              { value: 'custom', label: m.fillCustom },
            ]}
            onChange={(fill) => onPatch({ fill })}
          />
          {ann.fill === 'custom' && (
            <input
              type="color"
              value={ann.color}
              onChange={(e) => onPatch({ color: e.target.value }, `color:${ann.id}`)}
              className="w-full h-8 rounded-md border border-border cursor-pointer bg-transparent"
            />
          )}
        </>
      )}
      {ann.kind === 'image' && <p className="text-[11px] text-fg-subtle">{m.imageHint}</p>}
      <button onClick={onDelete} className="btn-ghost text-xs w-full justify-center text-red-600">
        <Trash2 className="w-3.5 h-3.5" />
        {m.delete}
      </button>
    </div>
  )
}

function TextProps({
  ann,
  onPatch,
  onDelete,
}: {
  ann: TextAnnotation
  onPatch: (patch: Partial<TextAnnotation>, coalesce?: string) => void
  onDelete: () => void
}) {
  const m = useMessages(editMessages).props
  const st = ann.style
  const src = ann.source
  const setStyle = (patch: Partial<TextStyle>, coalesce?: string) => onPatch({ style: { ...st, ...patch } }, coalesce)
  const familyOptions: { value: TextStyle['family']; label: string }[] = [
    ...(src?.font ? [{ value: 'original' as const, label: m.familyOriginal(src.font.displayName) }] : []),
    { value: 'sans', label: m.familySans },
    { value: 'serif', label: m.familySerif },
    { value: 'mono', label: m.familyMono },
  ]

  return (
    <div className="card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <Label>{src ? (src.origin === 'ocr' ? m.titleOcr : m.titleExisting) : m.titleNew}</Label>
      </div>

      {src && (
        <div className="text-[11px] leading-snug rounded-md bg-bg-subtle px-2 py-1.5 text-fg-muted">
          <span className="text-fg-subtle">{m.original}: </span>
          <span className="break-words">{src.originalText.length > 120 ? src.originalText.slice(0, 120) + '…' : src.originalText}</span>
        </div>
      )}

      <div className="space-y-1">
        <div className="text-[11px] text-fg-muted">{m.font}</div>
        <select
          value={st.family}
          onChange={(e) => setStyle({ family: e.target.value as TextStyle['family'] })}
          className="input w-full text-xs py-1.5"
        >
          {familyOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={2}
          max={300}
          step={0.5}
          value={Math.round(st.fontSize * 10) / 10}
          onChange={(e) => setStyle({ fontSize: Math.max(2, Math.min(300, Number(e.target.value) || st.fontSize)) }, `size:${ann.id}`)}
          className="input flex-1 text-xs py-1.5"
          title={m.size}
        />
        <input
          type="color"
          value={st.color}
          onChange={(e) => setStyle({ color: e.target.value }, `color:${ann.id}`)}
          className="w-8 h-8 rounded-md border border-border cursor-pointer bg-transparent"
          title={m.color}
        />
        <IconToggle on={st.bold} onClick={() => setStyle({ bold: !st.bold })} title={m.bold}>
          <Bold className="w-3.5 h-3.5" />
        </IconToggle>
        <IconToggle on={st.italic} onClick={() => setStyle({ italic: !st.italic })} title={m.italic}>
          <Italic className="w-3.5 h-3.5" />
        </IconToggle>
      </div>

      <div className="grid grid-cols-4 gap-1 p-1 bg-bg-subtle rounded-lg">
        {(Object.keys(ALIGN_ICONS) as TextAlign[]).map((a) => {
          const Icon = ALIGN_ICONS[a]
          return (
            <button
              key={a}
              onClick={() => setStyle({ align: a })}
              title={m.align[a]}
              className={`py-1.5 rounded-md flex justify-center ${
                st.align === a ? 'bg-bg-elevated text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          )
        })}
      </div>

      <Slider
        label={m.lineHeight}
        value={st.lineHeight}
        min={0.8}
        max={3}
        step={0.05}
        format={(v) => v.toFixed(2)}
        onChange={(v) => setStyle({ lineHeight: v }, `lh:${ann.id}`)}
      />
      <Slider
        label={m.width}
        value={st.hScale}
        min={0.6}
        max={1.4}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => setStyle({ hScale: v }, `hs:${ann.id}`)}
      />

      <label className="flex items-center gap-2 text-[11px] text-fg-muted cursor-pointer">
        <input type="checkbox" checked={ann.wrap} onChange={(e) => onPatch({ wrap: e.target.checked, fit: e.target.checked ? 'none' : 'shrink' })} />
        {m.wrap}
      </label>

      <div className="flex gap-1.5">
        {src && (
          <button
            onClick={() => onPatch({ style: { ...src.detected } })}
            className="btn-ghost text-[11px] flex-1 justify-center px-1.5 gap-1 whitespace-nowrap"
            title={m.resetHint}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {m.reset}
          </button>
        )}
        <button onClick={onDelete} className="btn-ghost text-[11px] flex-1 justify-center px-1.5 gap-1 whitespace-nowrap text-red-600">
          {src ? <Undo2 className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
          {src ? m.restore : m.delete}
        </button>
      </div>
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px] text-fg-muted">
        <span>{label}</span>
        <span className="tabular-nums">{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </div>
  )
}
