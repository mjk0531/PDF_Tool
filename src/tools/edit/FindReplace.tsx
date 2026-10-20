import { useMemo, useState } from 'react'
import { Replace, Search } from 'lucide-react'
import type { Annotation } from '../../lib/editor'
import type { PageText } from '../../lib/editorLayout'
import { findHits, makeMatcher, replaceAll, type FindHit } from '../../lib/editorEdits'
import { Label } from './Toolbar'
import { useMessages } from '../../i18n'
import editMessages from '../../i18n/messages/edit'

interface Props {
  pageTexts: Map<number, PageText>
  annotations: Annotation[]
  onReplaceAll: (next: Annotation[]) => void
  onJump: (hit: FindHit) => void
}

export function FindReplace({ pageTexts, annotations, onReplaceAll, onJump }: Props) {
  const m = useMessages(editMessages).find
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [done, setDone] = useState<number | null>(null)

  const matcher = useMemo(() => makeMatcher(query, matchCase), [query, matchCase])
  const hits = useMemo(() => findHits(pageTexts, annotations, matcher), [pageTexts, annotations, matcher])
  const total = hits.reduce((n, h) => n + h.count, 0)

  return (
    <div className="space-y-2">
      <Label>{m.title}</Label>
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setDone(null)
          }}
          placeholder={m.find}
          className="input w-full text-xs py-1.5 pl-8"
        />
      </div>
      <div className="relative">
        <Replace className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
        <input
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          placeholder={m.replace}
          className="input w-full text-xs py-1.5 pl-8"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-[11px] text-fg-muted cursor-pointer">
          <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} />
          {m.matchCase}
        </label>
        <button
          disabled={!matcher || total === 0}
          onClick={() => {
            if (!matcher) return
            const { next, replaced } = replaceAll(pageTexts, annotations, matcher, replacement)
            onReplaceAll(next)
            setDone(replaced)
          }}
          className="btn-secondary text-[11px] px-2.5 py-1"
        >
          {m.replaceAll}
        </button>
      </div>
      {query && (
        <div className="text-[11px] text-fg-muted">
          {done !== null ? m.replaced(done) : total ? m.results(total) : m.noResults}
        </div>
      )}
      {hits.length > 0 && done === null && (
        <ul className="max-h-48 overflow-y-auto space-y-0.5 -mx-1">
          {hits.slice(0, 60).map((h) => (
            <li key={`${h.kind}-${h.targetId}`}>
              <button
                onClick={() => onJump(h)}
                className="w-full text-left px-1.5 py-1 rounded hover:bg-bg-subtle text-[11px] leading-snug"
              >
                <span className="text-fg-subtle tabular-nums mr-1.5">p.{h.page}</span>
                <span className="text-fg-muted">{h.text.length > 70 ? h.text.slice(0, 70) + '…' : h.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
