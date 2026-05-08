import { Download, Eye } from 'lucide-react'
import { formatBytes, downloadBlob } from '../lib/download'
import type { ConvertedPage } from '../lib/converter'

interface Props {
  pages: ConvertedPage[]
  emptyMessage?: string
}

export function PreviewGrid({ pages, emptyMessage }: Props) {
  if (pages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-xl bg-bg-subtle flex items-center justify-center mb-3">
          <Eye className="w-5 h-5 text-fg-subtle" />
        </div>
        <p className="text-sm text-fg-muted">{emptyMessage ?? 'No pages converted yet'}</p>
        <p className="text-xs text-fg-subtle mt-1">
          Adjust settings and click Convert to generate images
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
      {pages.map((p) => {
        const url = URL.createObjectURL(p.blob)
        return (
          <div
            key={p.pageNumber}
            className="card overflow-hidden group hover:border-border-strong transition-all animate-slide-up"
          >
            <div className="aspect-[3/4] bg-bg-subtle relative overflow-hidden">
              <img
                src={url}
                alt={`Page ${p.pageNumber}`}
                className="w-full h-full object-contain"
                onLoad={() => {
                  // We keep URL for hover/download. Revoke when grid unmounts is okay; for simplicity rely on GC.
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                <button
                  onClick={() => downloadBlob(p.blob, p.filename)}
                  className="btn-primary py-1.5 px-3 text-xs w-full"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
              </div>
            </div>
            <div className="p-2.5 space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Page {p.pageNumber}</span>
                <span className="text-[10px] text-fg-subtle font-mono">
                  {p.width}×{p.height}
                </span>
              </div>
              <div className="text-[10px] text-fg-subtle truncate" title={p.filename}>
                {p.filename}
              </div>
              <div className="text-[10px] text-fg-subtle">{formatBytes(p.blob.size)}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
