import { useCallback, useEffect, useState } from 'react'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
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

function getInitialTool(): ToolId {
  const hash = window.location.hash.replace(/^#/, '') as ToolId
  if (hash in TOOL_COMPONENTS) return hash
  return 'pdf-to-image'
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme())
  const [tool, setTool] = useState<ToolId>(() => getInitialTool())

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    window.location.hash = tool
  }, [tool])

  useEffect(() => {
    const handler = () => {
      const hash = window.location.hash.replace(/^#/, '') as ToolId
      if (hash in TOOL_COMPONENTS) setTool(hash)
    }
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  const ToolComponent = TOOL_COMPONENTS[tool]

  return (
    <div className="h-full flex flex-col bg-bg text-fg">
      <TitleBar theme={theme} onToggleTheme={toggleTheme} />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar current={tool} onSelect={setTool} />
        <ToolComponent key={tool} />
      </div>
    </div>
  )
}
