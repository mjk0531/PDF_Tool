import { FileImage, Github, Moon, Sun } from 'lucide-react'
import type { Theme } from '../lib/theme'

interface Props {
  theme: Theme
  onToggleTheme: () => void
}

export function TitleBar({ theme, onToggleTheme }: Props) {
  return (
    <header className="flex items-center justify-between px-5 h-14 border-b border-border bg-bg-elevated/50 backdrop-blur-md sticky top-0 z-10">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
          <FileImage className="w-4.5 h-4.5 text-accent" strokeWidth={2.25} />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight">PDF Toolkit</span>
          <span className="text-[11px] text-fg-subtle">16 tools · Browser-based · Private</span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={onToggleTheme}
          className="btn-ghost p-2 rounded-lg"
          aria-label="Toggle theme"
          title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
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
          aria-label="GitHub repository"
          title="View on GitHub"
        >
          <Github className="w-4 h-4" />
        </a>
      </div>
    </header>
  )
}
