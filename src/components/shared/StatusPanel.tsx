import { CheckCircle2, AlertCircle, Loader2, Info } from 'lucide-react'

type Variant = 'info' | 'success' | 'error' | 'loading'

interface Props {
  variant: Variant
  title: string
  message?: string
  children?: React.ReactNode
}

const ICONS: Record<Variant, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  error: AlertCircle,
  loading: Loader2,
}

const COLORS: Record<Variant, string> = {
  info: 'text-blue-500 bg-blue-500/10',
  success: 'text-green-500 bg-green-500/10',
  error: 'text-red-500 bg-red-500/10',
  loading: 'text-accent bg-accent/10',
}

export function StatusPanel({ variant, title, message, children }: Props) {
  const Icon = ICONS[variant]
  return (
    <div className="card p-4 animate-fade-in">
      <div className="flex items-start gap-3">
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${COLORS[variant]}`}
        >
          <Icon
            className={`w-4.5 h-4.5 ${variant === 'loading' ? 'animate-spin' : ''}`}
            strokeWidth={2.25}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">{title}</div>
          {message && <div className="text-xs text-fg-muted mt-0.5">{message}</div>}
          {children && <div className="mt-3">{children}</div>}
        </div>
      </div>
    </div>
  )
}
