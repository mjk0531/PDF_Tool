import { useCallback, useEffect, useState } from 'react'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { Landing } from './components/Landing'
import { applyTheme, getInitialTheme, type Theme } from './lib/theme'
import type { ToolId } from './tools/registry'

import { PdfToImage } from './tools/PdfToImage'
import { Compress } from './tools/Compress'
import { Merge } from './tools/Merge'
import { Split } from './tools/Split'
import { Rotate } from './tools/Rotate'
import { Reorder } from './tools/Reorder'
import { ImageToPdf } from './tools/ImageToPdf'
import { ExtractText } from './tools/ExtractText'
import { ExtractImages } from './tools/ExtractImages'
import { Password } from './tools/Password'
import { Metadata } from './tools/Metadata'
import { PdfToMarkdown } from './tools/PdfToMarkdown'
import { PdfToWord } from './tools/PdfToWord'
import { PdfToExcel } from './tools/PdfToExcel'
import { PdfToPpt } from './tools/PdfToPpt'
import { Ocr } from './tools/Ocr'

const TOOL_COMPONENTS: Record<ToolId, React.ComponentType> = {
  'pdf-to-image': PdfToImage,
  compress: Compress,
  merge: Merge,
  split: Split,
  rotate: Rotate,
  reorder: Reorder,
  'image-to-pdf': ImageToPdf,
  'extract-text': ExtractText,
  'extract-images': ExtractImages,
  password: Password,
  metadata: Metadata,
  'pdf-to-markdown': PdfToMarkdown,
  'pdf-to-word': PdfToWord,
  'pdf-to-excel': PdfToExcel,
  'pdf-to-ppt': PdfToPpt,
  ocr: Ocr,
}

function getInitialTool(): ToolId | null {
  const hash = window.location.hash.replace(/^#/, '') as ToolId
  if (hash in TOOL_COMPONENTS) return hash
  return null
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme())
  const [tool, setTool] = useState<ToolId | null>(() => getInitialTool())

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    if (tool) {
      if (window.location.hash !== `#${tool}`) {
        history.replaceState(null, '', `#${tool}`)
      }
    } else if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }, [tool])

  useEffect(() => {
    const handler = () => {
      const raw = window.location.hash.replace(/^#/, '')
      if (!raw) {
        setTool(null)
        return
      }
      if (raw in TOOL_COMPONENTS) setTool(raw as ToolId)
    }
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  const goHome = useCallback(() => {
    setTool(null)
  }, [])

  const ToolComponent = tool ? TOOL_COMPONENTS[tool] : null

  return (
    <div className="h-full flex flex-col bg-bg text-fg">
      <TitleBar theme={theme} onToggleTheme={toggleTheme} onHome={goHome} />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar current={tool} onSelect={setTool} />
        {ToolComponent ? <ToolComponent key={tool!} /> : <Landing onSelect={setTool} />}
      </div>
    </div>
  )
}
