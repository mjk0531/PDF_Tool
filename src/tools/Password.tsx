import { useState } from 'react'
import { Sparkles, Lock, Unlock, AlertCircle } from 'lucide-react'
import { ToolHeader } from '../components/shared/ToolHeader'
import { FileDrop } from '../components/shared/FileDrop'
import { FilePill } from '../components/shared/FilePill'
import { OptionGroup, Segmented } from '../components/shared/OptionGroup'
import { StatusPanel } from '../components/shared/StatusPanel'
import { removePassword } from '../lib/pdfOps'
import { loadPdfDocument } from '../lib/converter'
import { downloadBlob, formatBytes, bytesToBlob } from '../lib/download'
import { stripExtension } from '../lib/converter'
import { useToolMeta } from './registry'
import { useMessages } from '../i18n'
import passwordMessages from '../i18n/messages/password'

type Mode = 'remove' | 'add'

export function Password() {
  const meta = useToolMeta('password')
  const t = useMessages(passwordMessages)
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<Mode>('remove')
  const [password, setPassword] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<Blob | null>(null)
  const [encrypted, setEncrypted] = useState<boolean | null>(null)

  const onFiles = async (files: File[]) => {
    const f = files[0]
    setFile(f)
    setResult(null)
    setEncrypted(null)
    // probe with pdfjs to detect encryption
    try {
      const buf = await f.arrayBuffer()
      const { pdfjsLib } = await import('../lib/pdfWorker')
      try {
        await pdfjsLib.getDocument({ data: buf }).promise
        setEncrypted(false)
      } catch (err: any) {
        if (err?.name === 'PasswordException') setEncrypted(true)
        else setEncrypted(false)
      }
    } catch {
      setEncrypted(null)
    }
    void loadPdfDocument
  }

  const run = async () => {
    if (!file) return
    setRunning(true)
    setResult(null)
    try {
      if (mode === 'add') {
        alert(t.addUnavailableAlert)
        return
      }
      const bytes = await removePassword(file)
      void password // signaled via UI hint only; pdf-lib's ignoreEncryption path doesn't use it
      setResult(bytesToBlob(bytes, 'application/pdf'))
    } catch (e) {
      alert(e instanceof Error ? e.message : t.failed)
    } finally {
      setRunning(false)
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
          <button
            onClick={run}
            disabled={running || mode === 'add'}
            className="btn-primary"
            title={mode === 'add' ? t.addUnavailableTitle : ''}
          >
            <Sparkles className={`w-4 h-4 ${running ? 'animate-pulse' : ''}`} />
            {running ? t.working : mode === 'remove' ? t.stripEncryption : t.addPassword}
          </button>
        }
      />
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-80 shrink-0 border-r border-border bg-bg-subtle/30 overflow-y-auto p-5 space-y-6">
          <FilePill
            onReplace={(f) => onFiles([f])}
            file={file}
            detail={encrypted === true ? t.encrypted : encrypted === false ? t.notEncrypted : undefined}
            onRemove={() => { setFile(null); setResult(null) }}
          />
          <OptionGroup icon={mode === 'remove' ? Unlock : Lock} title={t.mode}>
            <Segmented
              value={mode}
              options={[
                { value: 'remove', label: t.modes.remove },
                { value: 'add', label: t.modes.add },
              ]}
              onChange={(v) => setMode(v as Mode)}
              disabled={running}
            />
          </OptionGroup>
          {mode === 'remove' && (
            <OptionGroup
              title={t.passwordLabel}
              hint={t.passwordHint}
            >
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={running}
                placeholder={t.passwordPlaceholder}
                className="input w-full text-xs"
              />
            </OptionGroup>
          )}
          {mode === 'add' && (
            <div className="card p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-fg-muted leading-relaxed">
                {t.addExplanation(<span className="font-mono">qpdf</span>)}
              </p>
            </div>
          )}
        </aside>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {result && (
            <StatusPanel
              variant="success"
              title={t.stripped}
              message={`${formatBytes(result.size)} · ${t.unrestricted}`}
            >
              <button
                onClick={() => downloadBlob(result, `${stripExtension(file.name)}_unlocked.pdf`)}
                className="btn-primary"
              >
                {t.downloadUnlocked}
              </button>
            </StatusPanel>
          )}
          {!result && encrypted === false && mode === 'remove' && (
            <StatusPanel variant="info" title={t.notEncrypted} message={t.nothingToRemove} />
          )}
        </div>
      </div>
    </div>
  )
}
