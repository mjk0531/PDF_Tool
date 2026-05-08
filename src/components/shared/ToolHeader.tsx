import type { LucideIcon } from 'lucide-react'

interface Props {
  icon: LucideIcon
  title: string
  description: string
  beta?: boolean
  rightSlot?: React.ReactNode
}

export function ToolHeader({ icon: Icon, title, description, beta, rightSlot }: Props) {
  return (
    <header className="px-6 py-4 border-b border-border bg-bg-elevated/40 flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-accent" strokeWidth={2.25} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold tracking-tight">{title}</h1>
          {beta && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400"
              title="Output quality varies. Best for simple PDFs."
            >
              BETA
            </span>
          )}
        </div>
        <p className="text-xs text-fg-muted">{description}</p>
      </div>
      {rightSlot}
    </header>
  )
}
