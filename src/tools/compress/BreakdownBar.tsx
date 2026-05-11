import type { StructureBreakdown } from '../../lib/compress'
import { formatBytes } from '../../lib/download'

interface Row {
  label: string
  bytes: number
  color: string
  count?: number
}

function buildRows(b: StructureBreakdown): Row[] {
  return [
    { label: 'Signatures', bytes: b.signatures, color: 'bg-red-500', count: b.signatureCount },
    { label: 'Fonts', bytes: b.fonts, color: 'bg-orange-500', count: b.fontCount },
    { label: 'Images', bytes: b.images, color: 'bg-blue-500', count: b.imageCount },
    { label: 'Content streams', bytes: b.contentStreams, color: 'bg-green-500' },
    { label: 'Metadata', bytes: b.metadata, color: 'bg-purple-500' },
    { label: 'Other (xref, dicts, …)', bytes: b.other, color: 'bg-fg-subtle' },
  ]
    .filter((r) => r.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes)
}

export function BreakdownBar({ breakdown }: { breakdown: StructureBreakdown }) {
  const rows = buildRows(breakdown)
  const total = breakdown.totalBytes

  return (
    <div className="card p-4 space-y-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
        Where the file size is
      </div>

      <div className="flex h-2 rounded-full overflow-hidden bg-bg-subtle">
        {rows.map((r) => (
          <div
            key={r.label}
            className={r.color}
            style={{ width: `${(r.bytes / total) * 100}%` }}
            title={`${r.label}: ${formatBytes(r.bytes)}`}
          />
        ))}
      </div>

      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-2 h-2 rounded-sm ${r.color} shrink-0`} />
              <span className="text-fg-muted truncate">
                {r.label}
                {r.count !== undefined && r.count > 0 && (
                  <span className="text-fg-subtle ml-1">({r.count})</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-mono text-fg">{formatBytes(r.bytes)}</span>
              <span className="font-mono text-fg-subtle text-[10px] w-9 text-right">
                {((r.bytes / total) * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
