import type { LucideIcon } from 'lucide-react'

interface Props {
  icon?: LucideIcon
  title: string
  children: React.ReactNode
  hint?: string
}

export function OptionGroup({ icon: Icon, title, children, hint }: Props) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 text-fg-muted">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        <span className="text-[11px] font-semibold uppercase tracking-wider">{title}</span>
      </div>
      <div className="space-y-2">{children}</div>
      {hint && <p className="text-[11px] text-fg-subtle leading-relaxed">{hint}</p>}
    </div>
  )
}

interface SegmentedProps<T extends string | number> {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  disabled?: boolean
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
}: SegmentedProps<T>) {
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
