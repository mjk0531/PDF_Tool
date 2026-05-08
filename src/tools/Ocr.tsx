import { useMemo, useState } from 'react'
import {
  Sparkles,
  Languages,
  Sliders,
  Copy,
  AlertCircle,
  Wand2,
  LayoutTemplate,
  Filter,
} from 'lucide-react'
import { ToolHeader } from '../components/shared/ToolHeader'
import { FileDrop } from '../components/shared/FileDrop'
import { FilePill } from '../components/shared/FilePill'
import { OptionGroup, Segmented } from '../components/shared/OptionGroup'
import { StatusPanel } from '../components/shared/StatusPanel'
import { Toggle } from '../components/shared/Toggle'
import { ProgressBar } from '../components/ProgressBar'
import {
  DEFAULT_OCR_OPTIONS,
  ocrPdf,
  OCR_LANGUAGES,
  PSM_OPTIONS,
  type OcrOptions,
  type OcrResult,
} from '../lib/ocr'
import { downloadBlob, formatBytes } from '../lib/download'
import { stripExtension } from '../lib/converter'
import { TOOLS } from './registry'

const meta = TOOLS.find((t) => t.id === 'ocr')!

const LOW_CONFIDENCE_THRESHOLD = 60

export function Ocr() {
  const [file, setFile] = useState<File | null>(null)
  const [opts, setOpts] = useState<OcrOptions>(DEFAULT_OCR_OPTIONS)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ c: number; t: number; status: string } | null>(null)
  const [results, setResults] = useState<OcrResult[] | null>(null)

  const onFiles = (files: File[]) => {
    setFile(files[0])
    setResults(null)
  }

  const toggleLang = (code: string) => {
    setOpts((prev) => {
      const has = prev.languages.includes(code)
      const next = has ? prev.languages.filter((l) => l !== code) : [...prev.languages, code]
      return { ...prev, languages: next.length === 0 ? prev.languages : next }
    })
  }

  const updatePreprocess = (key: keyof OcrOptions['preprocess'], value: boolean) => {
    setOpts((prev) => ({ ...prev, preprocess: { ...prev.preprocess, [key]: value } }))
  }

  const run = async () => {
    if (!file) return
    setRunning(true)
    setResults(null)
    try {
      const out = await ocrPdf(file, opts, (c, t, status) => setProgress({ c, t, status }))
      setResults(out)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'OCR failed')
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  const stats = useMemo(() => {
    if (!results) return null
    const allWords = results.flatMap((r) => r.words)
    const lowConfWords = allWords.filter((w) => w.confidence < LOW_CONFIDENCE_THRESHOLD)
    const avgConf =
      results.reduce((s, r) => s + r.confidence, 0) / Math.max(1, results.length)
    return {
      totalWords: allWords.length,
      lowConfCount: lowConfWords.length,
      avgConf,
    }
  }, [results])

  if (!file) {
    return (
      <div className="flex-1 flex flex-col">
        <ToolHeader icon={meta.icon} title={meta.name} description={meta.description} beta />
        <FileDrop onFiles={onFiles} multiple={false} />
      </div>
    )
  }

  const baseName = stripExtension(file.name)
  const fullText = results?.map((r) => r.text).join('\n\n--- Page Break ---\n\n') ?? ''

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ToolHeader
        icon={meta.icon}
        title={meta.name}
        description={meta.description}
        beta
        rightSlot={
          <button onClick={run} disabled={running} className="btn-primary">
            <Sparkles className={`w-4 h-4 ${running ? 'animate-pulse' : ''}`} />
            {running ? 'Recognizing...' : 'Run OCR'}
          </button>
        }
      />
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-80 shrink-0 border-r border-border bg-bg-subtle/30 overflow-y-auto p-5 space-y-6">
          <FilePill file={file} onRemove={() => { setFile(null); setResults(null) }} />

          <OptionGroup
            icon={Languages}
            title="Languages"
            hint={
              opts.languages.length > 1
                ? `Recognizing ${opts.languages.length} scripts simultaneously`
                : 'Tap to add more for mixed-language documents'
            }
          >
            <div className="flex flex-wrap gap-1">
              {OCR_LANGUAGES.map((l) => {
                const selected = opts.languages.includes(l.code)
                return (
                  <button
                    key={l.code}
                    onClick={() => toggleLang(l.code)}
                    disabled={running}
                    className={`
                      text-[11px] font-medium px-2 py-1 rounded-md transition-all
                      ${
                        selected
                          ? 'bg-accent text-accent-fg'
                          : 'bg-bg-subtle text-fg-muted hover:bg-bg-elevated'
                      }
                      disabled:opacity-50 disabled:cursor-not-allowed
                    `}
                  >
                    {l.label}
                  </button>
                )
              })}
            </div>
          </OptionGroup>

          <OptionGroup
            icon={LayoutTemplate}
            title="Page Layout"
            hint={PSM_OPTIONS.find((p) => p.value === opts.psm)?.help}
          >
            <select
              value={opts.psm}
              onChange={(e) => setOpts({ ...opts, psm: e.target.value })}
              disabled={running}
              className="input w-full text-xs"
            >
              {PSM_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </OptionGroup>

          <OptionGroup icon={Sliders} title="Render DPI" hint="Higher = better accuracy, slower">
            <Segmented
              value={opts.dpi}
              options={[150, 200, 300, 400].map((v) => ({ value: v, label: `${v}` }))}
              onChange={(v) => setOpts({ ...opts, dpi: v })}
              disabled={running}
            />
          </OptionGroup>

          <OptionGroup
            icon={Wand2}
            title="Preprocessing"
            hint="Cleaning up the image before recognition usually helps"
          >
            <div className="space-y-1">
              <Toggle
                checked={opts.preprocess.grayscale}
                onChange={(v) => updatePreprocess('grayscale', v)}
                label="Grayscale"
                hint="Removes color noise"
                disabled={running || opts.preprocess.binarize}
              />
              <Toggle
                checked={opts.preprocess.contrast}
                onChange={(v) => updatePreprocess('contrast', v)}
                label="Auto contrast"
                hint="Stretches faded scans to full black/white range"
                disabled={running}
              />
              <Toggle
                checked={opts.preprocess.binarize}
                onChange={(v) => updatePreprocess('binarize', v)}
                label="Binarize (Otsu)"
                hint="Pure black/white. Best for low-contrast scans, may hurt clean PDFs"
                disabled={running}
              />
            </div>
          </OptionGroup>

          <OptionGroup
            icon={Filter}
            title="Character Whitelist"
            hint="Restrict to these characters only. Leave empty for any."
          >
            <input
              type="text"
              value={opts.whitelist}
              onChange={(e) => setOpts({ ...opts, whitelist: e.target.value })}
              disabled={running}
              placeholder="e.g. 0123456789 for digits only"
              className="input w-full text-xs font-mono"
            />
          </OptionGroup>

          <div className="card p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-fg-muted leading-relaxed">
              First run downloads each language model (~5-15 MB). Cached afterward. All processing stays in your browser.
            </p>
          </div>

          {results && (
            <div className="space-y-2">
              <button
                onClick={() => navigator.clipboard.writeText(fullText)}
                className="btn-secondary w-full"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy all text
              </button>
              <button
                onClick={() =>
                  downloadBlob(
                    new Blob([fullText], { type: 'text/plain' }),
                    `${baseName}_ocr.txt`,
                  )
                }
                className="btn-primary w-full"
              >
                Download .txt
              </button>
            </div>
          )}
        </aside>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {progress && (
            <ProgressBar
              current={progress.c}
              total={progress.t || 1}
              label={progress.status}
            />
          )}

          {results && stats && (
            <>
              <StatusPanel
                variant={stats.avgConf >= 80 ? 'success' : stats.avgConf >= 60 ? 'info' : 'error'}
                title={`Recognized ${results.length} page${results.length === 1 ? '' : 's'} · ${stats.avgConf.toFixed(1)}% avg confidence`}
                message={
                  stats.lowConfCount > 0
                    ? `${stats.lowConfCount} of ${stats.totalWords} words flagged as low-confidence (highlighted below). ${formatBytes(new Blob([fullText]).size)} text.`
                    : `${stats.totalWords} words · ${formatBytes(new Blob([fullText]).size)}`
                }
              />

              <div className="card p-4 max-h-[60vh] overflow-y-auto">
                {results.map((p, idx) => (
                  <div key={p.pageNumber} className={idx > 0 ? 'mt-6 pt-4 border-t border-border' : ''}>
                    <div className="flex items-center justify-between mb-2 text-[11px]">
                      <span className="font-semibold text-fg-muted">Page {p.pageNumber}</span>
                      <span className={`font-mono ${p.confidence >= 80 ? 'text-green-500' : p.confidence >= 60 ? 'text-amber-500' : 'text-red-500'}`}>
                        {p.confidence.toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-xs leading-relaxed font-mono">
                      {p.words.length > 0 ? (
                        p.words.map((w, i) => (
                          <span
                            key={i}
                            title={`${w.confidence.toFixed(0)}%`}
                            className={
                              w.confidence < LOW_CONFIDENCE_THRESHOLD
                                ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400 rounded px-0.5'
                                : ''
                            }
                          >
                            {w.text}{' '}
                          </span>
                        ))
                      ) : (
                        <pre className="whitespace-pre-wrap text-fg-muted">{p.text}</pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
