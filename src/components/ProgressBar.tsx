import { useMessages } from '../i18n'
import commonMessages from '../i18n/messages/common'

interface Props {
  current: number
  total: number
  label?: string
}

export function ProgressBar({ current, total, label }: Props) {
  const c = useMessages(commonMessages)
  const pct = total > 0 ? (current / total) * 100 : 0
  return (
    <div className="space-y-1.5 animate-fade-in">
      <div className="flex items-center justify-between text-xs">
        <span className="text-fg-muted">{label ?? c.converting}</span>
        <span className="font-mono text-fg">
          {current} / {total}
        </span>
      </div>
      <div className="h-1.5 bg-bg-subtle rounded-full overflow-hidden">
        <div
          className="h-full bg-accent rounded-full transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
