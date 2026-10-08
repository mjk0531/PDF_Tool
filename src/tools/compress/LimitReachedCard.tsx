import { AlertCircle, Minimize2 } from 'lucide-react'
import type { StructureBreakdown } from '../../lib/compress'
import { formatBytes } from '../../lib/download'
import { useMessages } from '../../i18n'
import compressMessages from '../../i18n/messages/compress'

type LimitText = (typeof compressMessages)['en']['limit']

interface Props {
  breakdown: StructureBreakdown
  onForceCompress: () => void
  disabled?: boolean
}

/**
 * Explain why smart compression didn't shrink the file and offer the
 * "rasterize everything" escape hatch. The explanation is picked from the
 * biggest category in the breakdown so it matches the user's actual file.
 */
function explanation(breakdown: StructureBreakdown, t: LimitText): React.ReactNode {
  const { totalBytes, signatures, fonts } = breakdown
  if (signatures > totalBytes * 0.3) {
    return t.signatures(formatBytes(signatures))
  }
  if (fonts > totalBytes * 0.3) {
    return t.fonts(formatBytes(fonts))
  }
  return t.other
}

export function LimitReachedCard({ breakdown, onForceCompress, disabled }: Props) {
  const t = useMessages(compressMessages).limit
  return (
    <div className="card p-4 border-amber-500/30 bg-amber-500/5 space-y-3">
      <div className="flex items-start gap-2.5">
        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <div className="text-xs text-fg-muted leading-relaxed">
          <strong className="text-fg">{t.title}</strong>{' '}
          {explanation(breakdown, t)}
        </div>
      </div>

      <div className="text-xs text-fg-muted leading-relaxed flex items-start gap-2.5">
        <Minimize2 className="w-4 h-4 text-fg-muted shrink-0 mt-0.5" />
        <span>
          {t.forceHint}
        </span>
      </div>

      <button onClick={onForceCompress} disabled={disabled} className="btn-secondary w-full">
        <Minimize2 className="w-4 h-4" />
        {t.forceButton}
      </button>
    </div>
  )
}
