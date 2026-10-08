import { FileImage, Github, Languages, Moon, Sun } from 'lucide-react'
import type { Theme } from '../lib/theme'
import { LANGUAGES, useLang, useMessages, type Lang } from '../i18n'
import shellMessages from '../i18n/messages/shell'
import { TOOLS } from '../tools/registry'

interface Props {
  theme: Theme
  onToggleTheme: () => void
  onHome?: () => void
}

export function TitleBar({ theme, onToggleTheme, onHome }: Props) {
  const t = useMessages(shellMessages)
  const { lang, setLang } = useLang()

  return (
    <header className="flex items-center justify-between px-5 h-14 border-b border-border bg-bg-elevated/50 backdrop-blur-md sticky top-0 z-10">
      <button
        onClick={onHome}
        className="flex items-center gap-2.5 -mx-2 px-2 py-1 rounded-lg hover:bg-bg-subtle transition-colors"
        aria-label={t.goHome}
      >
        <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
          <FileImage className="w-4.5 h-4.5 text-accent" strokeWidth={2.25} />
        </div>
        <div className="flex flex-col leading-tight text-left">
          <span className="text-sm font-semibold tracking-tight">PDF Toolkit</span>
          <span className="text-[11px] text-fg-subtle">{t.tagline(TOOLS.length)}</span>
        </div>
      </button>

      <div className="flex items-center gap-1">
        <label className="btn-ghost relative px-2.5 py-2 rounded-lg gap-1.5 cursor-pointer" title={t.language}>
          <Languages className="w-4 h-4" />
          <span className="text-xs">{LANGUAGES.find((l) => l.code === lang)?.label}</span>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
            aria-label={t.language}
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={onToggleTheme}
          className="btn-ghost p-2 rounded-lg"
          aria-label={t.toggleTheme}
          title={theme === 'dark' ? t.switchToLight : t.switchToDark}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>
        <a
          href="https://github.com/mjk0531/PDF_Tool"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost p-2 rounded-lg"
          aria-label={t.githubRepo}
          title={t.viewOnGithub}
        >
          <Github className="w-4 h-4" />
        </a>
      </div>
    </header>
  )
}
