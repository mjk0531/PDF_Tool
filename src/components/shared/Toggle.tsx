interface Props {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
  disabled?: boolean
}

export function Toggle({ checked, onChange, label, hint, disabled }: Props) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`
        w-full flex items-center justify-between gap-3 p-2.5 rounded-md
        text-left transition-all
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-bg-elevated'}
      `}
    >
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium">{label}</div>
        {hint && <div className="text-[10px] text-fg-subtle mt-0.5 leading-snug">{hint}</div>}
      </div>
      <span
        className={`
          relative inline-flex shrink-0 h-4 w-7 rounded-full transition-colors
          ${checked ? 'bg-accent' : 'bg-bg-subtle border border-border'}
        `}
      >
        <span
          className={`
            absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform
            ${checked ? 'translate-x-3.5' : 'translate-x-0.5'}
          `}
        />
      </span>
    </button>
  )
}
