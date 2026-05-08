import { useState } from 'react'
import { Sparkles, Languages, Sliders, Copy, AlertCircle } from 'lucide-react'
import { ToolHeader } from '../components/shared/ToolHeader'
import { FileDrop } from '../components/shared/FileDrop'
import { FilePill } from '../components/shared/FilePill'
import { OptionGroup, Segmented } from '../components/shared/OptionGroup'
import { StatusPanel } from '../components/shared/StatusPanel'
import { ProgressBar } from '../components/ProgressBar'
import { ocrPdf, OCR_LANGUAGES, type OcrResult } from '../lib/ocr'
import { downloadBlob, formatBytes } from '../lib/download'
import { stripExtension } from '../lib/converter'
import { TOOLS } from './registry'

const meta = TOOLS.find((t) => t.id === 'ocr')!

export function Ocr() {
  const [file, setFile] = useState<File | null>(null)
  const [language, setLanguage] = useState('eng')
  const [dpi, setDpi] = useState(200)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ c: number; t: number; status: string } | null>(null)
  const [results, setResults] = useState<OcrResult[] | null>(null)

  const onFiles = (files: File[]) => {
    setFile(files[0])
    setResults(null)
  }

  const run = async () => {
    if (!file) return
    setRunning(true)
    setResults(null)
    try {
      const out = await ocrPdf(file, language, dpi, (c, t, status) => setProgress({ c, t, status }))
      setResults(out)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'OCR failed')
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

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
  const avgConf = results
    ? results.reduce((s, r) => s + r.confidence, 0) / Math.max(1, results.length)
    : 0

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

          <OptionGroup icon={Languages} title="Language">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={running}
              className="input w-full text-xs"
            >
              {OCR_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </OptionGroup>

          <OptionGroup icon={Sliders} title="Render DPI" hint="Higher = better accuracy, slower.">
            <Segmented
              value={dpi}
              options={[150, 200, 300].map((v) => ({ value: v, label: `${v}` }))}
              onChange={(v) => setDpi(v)}
              disabled={running}
            />
          </OptionGroup>

          <div className="card p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-fg-muted leading-relaxed">
              First run downloads the language model (~5-15 MB). Subsequent runs are cached. All processing stays in your browser.
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
                onClick={() => downloadBlob(new Blob([fullText], { type: 'text/plain' }), `${baseName}_ocr.txt`)}
                className="btn-primary w-full"
              >
                Download .txt
              </button>
            </div>
          )}
        </aside>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {progress && (
            <div className="space-y-2">
              <ProgressBar
                current={progress.c}
                total={progress.t || 1}
                label={progress.status}
              />
            </div>
          )}
          {results && (
            <>
              <StatusPanel
                variant="success"
                title={`Recognized ${results.length} page${results.length === 1 ? '' : 's'}`}
                message={`Avg confidence: ${avgConf.toFixed(1)}% · ${formatBytes(new Blob([fullText]).size)}`}
              />
              <div className="card p-4">
                <pre className="text-xs whitespace-pre-wrap font-mono text-fg-muted max-h-[60vh] overflow-y-auto">
                  {fullText.slice(0, 20000)}
                  {fullText.length > 20000 && '\n\n... (truncated in preview)'}
                </pre>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
