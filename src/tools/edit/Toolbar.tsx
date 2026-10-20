import { MousePointer2, Type, Image as ImageIcon, Eraser, Upload, Bold, Italic } from 'lucide-react'
import type { Tool } from './PageView'
import type { TextStyle } from '../../lib/editor'
import type { EditUnit } from '../../lib/editorEdits'
import { Segmented } from '../../components/shared/OptionGroup'
import { Toggle } from '../../components/shared/Toggle'
import { useMessages } from '../../i18n'
import editMessages from '../../i18n/messages/edit'

interface Props {
  tool: Tool
  onToolChange: (t: Tool) => void
  unit: EditUnit
  onUnitChange: (u: EditUnit) => void
  eraseFill: 'auto' | 'white'
  onEraseFillChange: (f: 'auto' | 'white') => void
  newTextStyle: TextStyle
  onNewTextStyleChange: (s: TextStyle) => void
  onPickImage: (file: File) => void
  pendingImagePresent: boolean
  showTextHints: boolean
  onShowTextHintsChange: (v: boolean) => void
}

const TOOLS: { id: Tool; icon: typeof MousePointer2; key: string }[] = [
  { id: 'select', icon: MousePointer2, key: 'V' },
  { id: 'add-text', icon: Type, key: 'T' },
  { id: 'image', icon: ImageIcon, key: 'I' },
  { id: 'whiteout', icon: Eraser, key: 'E' },
]

export function Toolbar(p: Props) {
  const m = useMessages(editMessages).toolbar
  const st = p.newTextStyle
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1.5">
        {TOOLS.map((t) => {
          const Icon = t.icon
          const active = p.tool === t.id
          return (
            <button
              key={t.id}
              onClick={() => p.onToolChange(t.id)}
              title={`${m.tools[t.id].label} (${t.key})`}
              className={`flex flex-col items-start gap-1 p-2.5 rounded-md transition-all text-left border ${
                active
                  ? 'bg-accent/10 text-accent border-accent/30'
                  : 'bg-bg-elevated text-fg-muted hover:text-fg border-border hover:border-border-strong'
              }`}
            >
              <Icon className="w-4 h-4" />
              <div className="text-[11px] font-semibold">{m.tools[t.id].label}</div>
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-fg-subtle leading-relaxed">{m.tools[p.tool].help}</p>

      {p.tool === 'select' && (
        <div className="space-y-2">
          <Label>{m.unit}</Label>
          <Segmented
            value={p.unit}
            options={[
              { value: 'line', label: m.unitLine },
              { value: 'paragraph', label: m.unitParagraph },
            ]}
            onChange={p.onUnitChange}
          />
          <Toggle checked={p.showTextHints} onChange={p.onShowTextHintsChange} label={m.showText} hint={m.showTextHint} />
        </div>
      )}

      {p.tool === 'whiteout' && (
        <div className="space-y-2">
          <Label>{m.eraseFill}</Label>
          <Segmented
            value={p.eraseFill}
            options={[
              { value: 'auto', label: m.fillAuto },
              { value: 'white', label: m.fillWhite },
            ]}
            onChange={p.onEraseFillChange}
          />
        </div>
      )}

      {p.tool === 'add-text' && (
        <div className="space-y-2">
          <Label>{m.newText}</Label>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={4}
              max={200}
              step={0.5}
              value={st.fontSize}
              onChange={(e) =>
                p.onNewTextStyleChange({ ...st, fontSize: Math.max(4, Math.min(200, Number(e.target.value) || 12)) })
              }
              className="input flex-1 text-xs py-1.5"
              title={m.fontSize}
            />
            <input
              type="color"
              value={st.color}
              onChange={(e) => p.onNewTextStyleChange({ ...st, color: e.target.value })}
              className="w-8 h-8 rounded-md border border-border cursor-pointer bg-transparent"
              title={m.color}
            />
            <IconToggle on={st.bold} onClick={() => p.onNewTextStyleChange({ ...st, bold: !st.bold })} title={m.bold}>
              <Bold className="w-3.5 h-3.5" />
            </IconToggle>
            <IconToggle on={st.italic} onClick={() => p.onNewTextStyleChange({ ...st, italic: !st.italic })} title={m.italic}>
              <Italic className="w-3.5 h-3.5" />
            </IconToggle>
          </div>
          <Segmented
            value={st.family === 'original' ? 'sans' : st.family}
            options={[
              { value: 'sans', label: m.familySans },
              { value: 'serif', label: m.familySerif },
              { value: 'mono', label: m.familyMono },
            ]}
            onChange={(family) => p.onNewTextStyleChange({ ...st, family })}
          />
        </div>
      )}

      {p.tool === 'image' && (
        <div className="space-y-2">
          <Label>{m.image}</Label>
          <label className="btn-secondary w-full cursor-pointer justify-center text-xs">
            <Upload className="w-3.5 h-3.5" />
            {p.pendingImagePresent ? m.pickDifferentImage : m.chooseImage}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) p.onPickImage(f)
                e.target.value = ''
              }}
            />
          </label>
          {p.pendingImagePresent && <p className="text-[11px] text-fg-subtle">{m.placeImageHint}</p>}
        </div>
      )}
    </div>
  )
}

export function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">{children}</div>
}

export function IconToggle({
  on,
  onClick,
  title,
  children,
}: {
  on: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-8 h-8 shrink-0 rounded-md border flex items-center justify-center transition-colors ${
        on ? 'bg-accent/15 border-accent/40 text-accent' : 'bg-bg-elevated border-border text-fg-muted hover:text-fg'
      }`}
    >
      {children}
    </button>
  )
}
