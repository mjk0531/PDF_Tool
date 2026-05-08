import { Lock, ShieldCheck, Sparkles } from 'lucide-react'
import {
  CATEGORY_LABELS,
  TOOLS_BY_CATEGORY,
  type ToolId,
  type ToolMeta,
} from '../tools/registry'

interface Props {
  onSelect: (id: ToolId) => void
}

const CATEGORY_ORDER: (keyof typeof CATEGORY_LABELS)[] = [
  'organize',
  'convert',
  'extract',
  'secure',
  'ocr',
]

function ToolCard({ tool, onSelect }: { tool: ToolMeta; onSelect: () => void }) {
  const Icon = tool.icon
  return (
    <button
      onClick={onSelect}
      className="card p-4 text-left flex flex-col gap-2 hover:border-accent/50 hover:bg-bg-elevated transition-all duration-150 group animate-fade-in"
    >
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-lg bg-accent/10 text-accent flex items-center justify-center group-hover:scale-105 transition-transform">
          <Icon className="w-4.5 h-4.5" strokeWidth={2.25} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{tool.name}</div>
        </div>
        {tool.quality === 'best-effort' && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
            BETA
          </span>
        )}
      </div>
      <p className="text-xs text-fg-muted leading-relaxed">{tool.description}</p>
    </button>
  )
}

export function Landing({ onSelect }: Props) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-12">
        <div className="text-center mb-10 animate-slide-up">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-medium mb-4">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>100% browser-based · no upload, no signup</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-3">
            Everything you need to do with a PDF
          </h1>
          <p className="text-base text-fg-muted max-w-2xl mx-auto">
            16 tools that run entirely in your browser. Drop a file, pick a tool, get a result —
            your file never leaves your device.
          </p>
          <div className="flex items-center justify-center gap-6 mt-6 text-xs text-fg-subtle">
            <div className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              <span>Private</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Free forever</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Open source</span>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          {CATEGORY_ORDER.map((cat) => {
            const tools = TOOLS_BY_CATEGORY[cat] ?? []
            if (tools.length === 0) return null
            return (
              <section key={cat} className="space-y-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted px-1">
                  {CATEGORY_LABELS[cat]}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {tools.map((tool) => (
                    <ToolCard key={tool.id} tool={tool} onSelect={() => onSelect(tool.id)} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
