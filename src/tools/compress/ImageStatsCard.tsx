import type { ImageRecompressStats } from '../../lib/compress'
import { formatBytes } from '../../lib/download'
import { useMessages } from '../../i18n'
import compressMessages from '../../i18n/messages/compress'

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
  const t = useMessages(compressMessages).imageStats
  if (stats.imagesFound === 0) return null

  return (
    <div className="card p-4 text-xs text-fg-muted space-y-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle mb-1">
        {t.heading}
      </div>
      <StatRow label={t.found} value={stats.imagesFound} />
      <StatRow
        label={t.recompressed}
        value={`${stats.jpegHandled} / ${stats.flateHandled}`}
      />
      {stats.otherSkipped > 0 && (
        <StatRow label={t.skipped} value={stats.otherSkipped} muted />
      )}
      <StatRow label={t.replaced} value={stats.imagesReplaced} />
      <StatRow label={t.bytesSaved} value={formatBytes(stats.bytesSaved)} />
    </div>
  )
}
