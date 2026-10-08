import { MousePointer2, Type, Image as ImageIcon, Eraser, Upload } from 'lucide-react'
import type { Tool } from './PageView'
import { useMessages } from '../../i18n'
import editMessages from '../../i18n/messages/edit'

interface Props {
  tool: Tool
  onToolChange: (t: Tool) => void
  textStyle: { fontSize: number; color: string }
  onTextStyleChange: (s: { fontSize: number; color: string }) => void
  onPickImage: (file: File) => void
  pendingImagePresent: boolean
}

const TOOLS: { id: Tool; icon: typeof MousePointer2 }[] = [
  { id: 'select', icon: MousePointer2 },
  { id: 'add-text', icon: Type },
  { id: 'image', icon: ImageIcon },
  { id: 'whiteout', icon: Eraser },
]

export function Toolbar({
  tool,
  onToolChange,
  textStyle,
  onTextStyleChange,
  onPickImage,
  pendingImagePresent,
}: Props) {
  const m = useMessages(editMessages).toolbar
  return (
    <div className="space-y-4">
      {/* Tool grid */}
      <div className="grid grid-cols-2 gap-1.5">
        {TOOLS.map((t) => {
          const Icon = t.icon
          const active = tool === t.id
          return (
            <button
              key={t.id}
              onClick={() => onToolChange(t.id)}
              className={`
                flex flex-col items-start gap-1 p-2.5 rounded-md transition-all text-left
                ${
                  active
                    ? 'bg-accent/10 text-accent border border-accent/30'
                    : 'bg-bg-elevated text-fg-muted hover:text-fg border border-border hover:border-border-strong'
                }
              `}
            >
              <Icon className="w-4 h-4" />
              <div className="text-[11px] font-semibold">{m.tools[t.id].label}</div>
            </button>
          )
        })}
      </div>

      {/* Active-tool help */}
      <p className="text-[11px] text-fg-subtle leading-relaxed">
        {m.tools[tool].help}
      </p>

      {/* Text style — only when text tools are active */}
      {(tool === 'add-text' || tool === 'select') && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
            {m.textStyle}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={6}
              max={144}
              value={textStyle.fontSize}
              onChange={(e) =>
                onTextStyleChange({
                  ...textStyle,
                  fontSize: Math.max(6, Math.min(144, Number(e.target.value) || 12)),
                })
              }
              className="input flex-1 text-xs"
              title={m.fontSize}
            />
            <input
              type="color"
              value={textStyle.color}
              onChange={(e) => onTextStyleChange({ ...textStyle, color: e.target.value })}
              className="w-9 h-9 rounded-md border border-border cursor-pointer bg-transparent"
              title={m.color}
            />
          </div>
        </div>
      )}

      {/* Image picker — only when image tool is active */}
      {tool === 'image' && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
            {m.image}
          </div>
          <label className="btn-secondary w-full cursor-pointer justify-center text-xs">
            <Upload className="w-3.5 h-3.5" />
            {pendingImagePresent ? m.pickDifferentImage : m.chooseImage}
            <input
              type="file"
              accept="image/png,image/jpeg,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onPickImage(f)
                e.target.value = ''
              }}
            />
          </label>
          {pendingImagePresent && (
            <p className="text-[11px] text-fg-subtle">
              {m.placeImageHint}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
