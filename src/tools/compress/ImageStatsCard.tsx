import type { ImageRecompressStats } from '../../lib/compress'
import { formatBytes } from '../../lib/download'

interface RowProps {
  label: string
  value: React.ReactNode
  muted?: boolean
}

function StatRow({ label, value, muted }: RowProps) {
  return (
    <div className={`flex justify-between ${muted ? 'text-fg-subtle' : ''}`}>
      <span>{label}</span>
      <span className={`font-mono ${muted ? '' : 'text-fg'}`}>{value}</span>
    </div>
  )
}

export function ImageStatsCard({ stats }: { stats: ImageRecompressStats }) {
  if (stats.imagesFound === 0) return null

  return (
    <div className="card p-4 text-xs text-fg-muted space-y-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle mb-1">
        Image recompression
      </div>
      <StatRow label="Embedded images found" value={stats.imagesFound} />
      <StatRow
        label="Recompressed (JPEG / PNG)"
        value={`${stats.jpegHandled} / ${stats.flateHandled}`}
      />
      {stats.otherSkipped > 0 && (
        <StatRow label="Skipped (unsupported format)" value={stats.otherSkipped} muted />
      )}
      <StatRow label="Replaced (smaller after recompress)" value={stats.imagesReplaced} />
      <StatRow label="Bytes saved on images" value={formatBytes(stats.bytesSaved)} />
    </div>
  )
}
