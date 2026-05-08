import { Settings2, Image as ImageIcon, Palette, RotateCw, FileText, Sliders } from 'lucide-react'
import type { ConvertOptions, ImageFormat } from '../lib/converter'

interface Props {
  options: Omit<ConvertOptions, 'pages'>
  pageRangeText: string
  onPageRangeChange: (value: string) => void
  onChange: <K extends keyof Omit<ConvertOptions, 'pages'>>(
    key: K,
    value: Omit<ConvertOptions, 'pages'>[K],
  ) => void
  disabled?: boolean
}

const DPI_PRESETS = [72, 150, 300, 600] as const
const ROTATIONS: ConvertOptions['rotation'][] = [0, 90, 180, 270]
const FORMATS: { value: ImageFormat; label: string }[] = [
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'webp', label: 'WebP' },
]

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Settings2
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 text-fg-muted">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[11px] font-semibold uppercase tracking-wider">{title}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function SegmentedControl<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  disabled?: boolean
}) {
  return (
    <div className="grid grid-flow-col auto-cols-fr gap-1 p-1 bg-bg-subtle rounded-lg">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          onClick={() => onChange(opt.value)}
          disabled={disabled}
          className={`
            text-xs font-medium py-1.5 px-2 rounded-md transition-all
            ${
              value === opt.value
                ? 'bg-bg-elevated text-fg shadow-sm'
                : 'text-fg-muted hover:text-fg'
            }
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function SettingsPanel({
  options,
  pageRangeText,
  onPageRangeChange,
  onChange,
  disabled,
}: Props) {
  return (
    <aside className="w-72 shrink-0 border-r border-border bg-bg-subtle/30 overflow-y-auto">
      <div className="p-5 space-y-6">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-fg-muted" />
          <h2 className="text-sm font-semibold">Settings</h2>
        </div>

        <Section icon={Sliders} title="Resolution (DPI)">
          <SegmentedControl
            value={DPI_PRESETS.includes(options.dpi as (typeof DPI_PRESETS)[number]) ? options.dpi : -1}
            options={DPI_PRESETS.map((d) => ({ value: d, label: String(d) }))}
            onChange={(v) => onChange('dpi', v as number)}
            disabled={disabled}
          />
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={36}
              max={1200}
              step={6}
              value={options.dpi}
              onChange={(e) => onChange('dpi', Math.max(36, Math.min(1200, Number(e.target.value) || 150)))}
              disabled={disabled}
              className="input flex-1 text-xs"
            />
            <span className="text-xs text-fg-subtle">DPI</span>
          </div>
        </Section>

        <Section icon={ImageIcon} title="Format">
          <SegmentedControl
            value={options.format}
            options={FORMATS}
            onChange={(v) => onChange('format', v)}
            disabled={disabled}
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
                onChange={(e) => onChange('quality', Number(e.target.value))}
                disabled={disabled}
                className="w-full"
              />
            </div>
          )}
        </Section>

        <Section icon={Palette} title="Background">
          <SegmentedControl
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
              if (v === 'transparent') onChange('backgroundColor', null)
              else if (v === 'white') onChange('backgroundColor', '#ffffff')
              else onChange('backgroundColor', options.backgroundColor || '#000000')
            }}
            disabled={disabled || options.format !== 'png'}
          />
          {options.backgroundColor !== null &&
            options.backgroundColor !== '#ffffff' && (
              <div className="flex items-center gap-2 animate-fade-in">
                <input
                  type="color"
                  value={options.backgroundColor}
                  onChange={(e) => onChange('backgroundColor', e.target.value)}
                  disabled={disabled}
                  className="w-9 h-9 rounded-md cursor-pointer bg-transparent border border-border"
                />
                <input
                  type="text"
                  value={options.backgroundColor}
                  onChange={(e) => onChange('backgroundColor', e.target.value)}
                  disabled={disabled}
                  className="input flex-1 text-xs font-mono uppercase"
                  placeholder="#000000"
                />
              </div>
            )}
          {options.format !== 'png' && (
            <p className="text-[11px] text-fg-subtle">
              Transparent only available for PNG.
            </p>
          )}
        </Section>

        <Section icon={RotateCw} title="Rotation">
          <SegmentedControl
            value={options.rotation}
            options={ROTATIONS.map((r) => ({ value: r, label: `${r}°` }))}
            onChange={(v) => onChange('rotation', v as ConvertOptions['rotation'])}
            disabled={disabled}
          />
        </Section>

        <Section icon={FileText} title="Pages">
          <input
            type="text"
            value={pageRangeText}
            onChange={(e) => onPageRangeChange(e.target.value)}
            disabled={disabled}
            placeholder="All pages"
            className="input w-full text-xs"
          />
          <p className="text-[11px] text-fg-subtle">
            e.g. <span className="font-mono">1-5, 7, 10-12</span>
          </p>
        </Section>

        <Section icon={FileText} title="Filename Pattern">
          <input
            type="text"
            value={options.filenamePattern}
            onChange={(e) => onChange('filenamePattern', e.target.value)}
            disabled={disabled}
            className="input w-full text-xs font-mono"
          />
          <p className="text-[11px] text-fg-subtle leading-relaxed">
            <span className="font-mono">{'{name}'}</span> filename ·{' '}
            <span className="font-mono">{'{n}'}</span> padded ·{' '}
            <span className="font-mono">{'{N}'}</span> raw ·{' '}
            <span className="font-mono">{'{total}'}</span>
          </p>
        </Section>
      </div>
    </aside>
  )
}
