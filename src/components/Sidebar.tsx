import { CATEGORY_ORDER, TOOLS_BY_CATEGORY, type ToolId } from '../tools/registry'
import { useMessages } from '../i18n'
import commonMessages from '../i18n/messages/common'
import toolMessages from '../i18n/messages/tools'

interface Props {
  current: ToolId | null
  onSelect: (id: ToolId) => void
}

export function Sidebar({ current, onSelect }: Props) {
  const t = useMessages(toolMessages)
  const c = useMessages(commonMessages)
  return (
    <aside className="w-60 shrink-0 border-r border-border bg-bg-subtle/30 overflow-y-auto">
      <nav className="p-3 space-y-5">
        {CATEGORY_ORDER.map((cat) => {
          const tools = TOOLS_BY_CATEGORY[cat] ?? []
          if (tools.length === 0) return null
          return (
            <div key={cat} className="space-y-1">
              <div className="px-2 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
                {t.categories[cat]}
              </div>
              <ul className="space-y-0.5">
                {tools.map((tool) => {
                  const Icon = tool.icon
                  const active = current === tool.id
                  return (
                    <li key={tool.id}>
                      <button
                        onClick={() => onSelect(tool.id)}
                        className={`
                          w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md
                          text-sm text-left transition-all duration-100
                          ${
                            active
                              ? 'bg-accent/10 text-accent'
                              : 'text-fg-muted hover:text-fg hover:bg-bg-elevated'
                          }
                        `}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="flex-1 truncate font-medium">{t.tools[tool.id].name}</span>
                        {tool.quality === 'best-effort' && (
                          <span
                            className={`
                              text-[9px] font-bold px-1.5 py-0.5 rounded
                              ${active ? 'bg-accent/20' : 'bg-bg-subtle text-fg-subtle'}
                            `}
                            title={c.betaHint}
                          >
                            {c.beta}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
