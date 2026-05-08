import { useMemo, useState } from 'react'
import { Sparkles, Scissors } from 'lucide-react'
import { ToolHeader } from '../components/shared/ToolHeader'
import { FileDrop } from '../components/shared/FileDrop'
import { FilePill } from '../components/shared/FilePill'
import { OptionGroup, Segmented } from '../components/shared/OptionGroup'
import { StatusPanel } from '../components/shared/StatusPanel'
import { ProgressBar } from '../components/ProgressBar'
import {
  buildSplitGroupsByEvery,
  getPageCount,
  splitPdf,
  type SplitGroup,
} from '../lib/pdfOps'
import { downloadBlob, downloadAsZip, formatBytes, bytesToBlob } from '../lib/download'
import { stripExtension } from '../lib/converter'
import { parsePageRange } from '../lib/pageRange'
import { TOOLS } from './registry'

const meta = TOOLS.find((t) => t.id === 'split')!

type Mode = 'every' | 'ranges'

export function Split() {
  const [file, setFile] = useState<File | null>(null)
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [mode, setMode] = useState<Mode>('every')
  const [every, setEvery] = useState(1)
  const [rangesText, setRangesText] = useState('1-3, 4-6')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ c: number; t: number } | null>(null)
  const [results, setResults] = useState<{ name: string; bytes: Uint8Array }[]>([])

  const onFiles = async (files: File[]) => {
    const f = files[0]
    setFile(f)
    setResults([])
    try {
      setPageCount(await getPageCount(f))
    } catch {
      setPageCount(null)
    }
  }

  const baseName = file ? stripExtension(file.name) : 'split'

  const plannedGroups = useMemo<{ groups: SplitGroup[]; valid: boolean; reason?: string }>(() => {
    if (!file || !pageCount) return { groups: [], valid: false }
    if (mode === 'every') {
      if (every < 1) return { groups: [], valid: false, reason: 'Pages per file must be ≥ 1' }
      return { groups: buildSplitGroupsByEvery(pageCount, every, baseName), valid: true }
    } else {
      const ranges = rangesText.split(';').map((s) => s.trim()).filter(Boolean)
      const groups: SplitGroup[] = []
      for (let i = 0; i < ranges.length; i++) {
        const pages = parsePageRange(ranges[i], pageCount)
        if (!pages || pages.length === 0)
          return { groups: [], valid: false, reason: `Invalid range: "${ranges[i]}"` }
        groups.push({ name: `${baseName}_part_${i + 1}.pdf`, pages })
      }
      if (groups.length === 0) return { groups: [], valid: false, reason: 'Add at least one range' }
      return { groups, valid: true }
    }
  }, [file, pageCount, mode, every, rangesText, baseName])

  const run = async () => {
    if (!file || !plannedGroups.valid) return
    setRunning(true)
    setResults([])
    try {
      setProgress({ c: 0, t: plannedGroups.groups.length })
      const out = await splitPdf(file, plannedGroups.groups)
      // mock progress for UX
      for (let i = 0; i < out.length; i++) setProgress({ c: i + 1, t: out.length })
      setResults(out)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Split failed')
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  if (!file) {
    return (
      <div className="flex-1 flex flex-col">
        <ToolHeader icon={meta.icon} title={meta.name} description={meta.description} />
        <FileDrop onFiles={onFiles} multiple={false} />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ToolHeader
        icon={meta.icon}
        title={meta.name}
        description={meta.description}
        rightSlot={
          <button onClick={run} disabled={!plannedGroups.valid || running} className="btn-primary">
            <Sparkles className={`w-4 h-4 ${running ? 'animate-pulse' : ''}`} />
            {running ? 'Splitting...' : 'Split'}
          </button>
        }
      />
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-80 shrink-0 border-r border-border bg-bg-subtle/30 overflow-y-auto p-5 space-y-6">
          <FilePill
            file={file}
            detail={pageCount ? `${pageCount} pages` : undefined}
            onRemove={() => { setFile(null); setResults([]) }}
          />

          <OptionGroup icon={Scissors} title="Mode">
            <Segmented
              value={mode}
              options={[
                { value: 'every', label: 'Every N pages' },
                { value: 'ranges', label: 'Custom ranges' },
              ]}
              onChange={(v) => setMode(v as Mode)}
              disabled={running}
            />
          </OptionGroup>

          {mode === 'every' ? (
            <OptionGroup
              title="Pages per file"
              hint={pageCount ? `Will produce ${Math.ceil(pageCount / Math.max(1, every))} files` : undefined}
            >
              <input
                type="number"
                min={1}
                max={pageCount ?? 9999}
                value={every}
                onChange={(e) => setEvery(Math.max(1, Number(e.target.value) || 1))}
                disabled={running}
                className="input w-full text-xs"
              />
            </OptionGroup>
          ) : (
            <OptionGroup
              title="Ranges (semicolon-separated)"
              hint="Each range becomes one PDF. e.g. 1-3; 5; 7-10"
            >
              <textarea
                value={rangesText}
                onChange={(e) => setRangesText(e.target.value)}
                disabled={running}
                rows={4}
                className="input w-full text-xs font-mono"
                placeholder="1-3; 5; 7-10"
              />
              {!plannedGroups.valid && plannedGroups.reason && (
                <p className="text-[11px] text-red-500">{plannedGroups.reason}</p>
              )}
            </OptionGroup>
          )}
        </aside>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {progress && <ProgressBar current={progress.c} total={progress.t} label="Splitting..." />}

          {plannedGroups.valid && plannedGroups.groups.length > 0 && results.length === 0 && (
            <StatusPanel
              variant="info"
              title={`${plannedGroups.groups.length} output file${plannedGroups.groups.length === 1 ? '' : 's'} planned`}
              message={plannedGroups.groups.map((g) => `${g.name} (${g.pages.length}p)`).join(' · ')}
            />
          )}

          {results.length > 0 && (
            <div className="space-y-3">
              <StatusPanel
                variant="success"
                title={`Split into ${results.length} files`}
                message={`Total ${formatBytes(results.reduce((s, r) => s + r.bytes.byteLength, 0))}`}
              >
                <button
                  onClick={async () => {
                    const pages = results.map((r, i) => ({
                      pageNumber: i + 1,
                      blob: bytesToBlob(r.bytes, 'application/pdf'),
                      width: 0,
                      height: 0,
                      filename: r.name,
                    }))
                    await downloadAsZip(pages, `${baseName}_split`)
                  }}
                  className="btn-primary"
                >
                  Download all as ZIP
                </button>
              </StatusPanel>
              <ul className="space-y-1.5">
                {results.map((r) => (
                  <li key={r.name} className="card p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{r.name}</div>
                      <div className="text-[11px] text-fg-subtle">{formatBytes(r.bytes.byteLength)}</div>
                    </div>
                    <button
                      className="btn-secondary text-xs"
                      onClick={() => downloadBlob(bytesToBlob(r.bytes, 'application/pdf'), r.name)}
                    >
                      Download
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
