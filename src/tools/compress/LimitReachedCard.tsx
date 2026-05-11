import { AlertCircle, Minimize2 } from 'lucide-react'
import type { StructureBreakdown } from '../../lib/compress'
import { formatBytes } from '../../lib/download'

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
function explanation(breakdown: StructureBreakdown): React.ReactNode {
  const { totalBytes, signatures, fonts } = breakdown
  if (signatures > totalBytes * 0.3) {
    return (
      <>
        Most of the size is <strong className="text-fg">digital signatures</strong> (
        {formatBytes(signatures)}) — cryptographic data that can't be compressed without
        breaking signature validity.
      </>
    )
  }
  if (fonts > totalBytes * 0.3) {
    return (
      <>
        Most of the size is <strong className="text-fg">embedded fonts</strong> (
        {formatBytes(fonts)}) that are already subsetted.
      </>
    )
  }
  return <>The remaining bulk is already-compressed content.</>
}

export function LimitReachedCard({ breakdown, onForceCompress, disabled }: Props) {
  return (
    <div className="card p-4 border-amber-500/30 bg-amber-500/5 space-y-3">
      <div className="flex items-start gap-2.5">
        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <div className="text-xs text-fg-muted leading-relaxed">
          <strong className="text-fg">This PDF is at its natural compression limit.</strong>{' '}
          {explanation(breakdown)}
        </div>
      </div>

      <div className="text-xs text-fg-muted leading-relaxed flex items-start gap-2.5">
        <Minimize2 className="w-4 h-4 text-fg-muted shrink-0 mt-0.5" />
        <span>
          To force a smaller file, you can rasterize every page to JPEG.{' '}
          <strong className="text-fg">Text becomes raster</strong> (no longer selectable or
          searchable) and any digital signatures will not transfer.
        </span>
      </div>

      <button onClick={onForceCompress} disabled={disabled} className="btn-secondary w-full">
        <Minimize2 className="w-4 h-4" />
        Force compress (rasterize, lose text &amp; signatures)
      </button>
    </div>
  )
}
