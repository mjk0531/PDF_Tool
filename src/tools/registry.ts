import type { LucideIcon } from 'lucide-react'
import {
  FileImage,
  Minimize2,
  Combine,
  Scissors,
  RotateCw,
  ListOrdered,
  Image as ImageIcon,
  FileText,
  Images,
  Lock,
  Tag,
  FileCode2,
  FileType,
  Sheet,
  Presentation,
  ScanText,
  PenLine,
} from 'lucide-react'
import { useMessages } from '../i18n'
import toolMessages from '../i18n/messages/tools'

export type ToolId =
  | 'edit'
  | 'pdf-to-image'
  | 'compress'
  | 'merge'
  | 'split'
  | 'rotate'
  | 'reorder'
  | 'image-to-pdf'
  | 'extract-text'
  | 'extract-images'
  | 'password'
  | 'metadata'
  | 'pdf-to-markdown'
  | 'pdf-to-word'
  | 'pdf-to-excel'
  | 'pdf-to-ppt'
  | 'ocr'

export interface ToolMeta {
  id: ToolId
  icon: LucideIcon
  category: 'convert' | 'organize' | 'extract' | 'secure' | 'ocr'
  quality: 'high' | 'best-effort'
}

export const TOOLS: ToolMeta[] = [
  {
    id: 'pdf-to-image',
    icon: FileImage,
    category: 'convert',
    quality: 'high',
  },
  {
    id: 'edit',
    icon: PenLine,
    category: 'organize',
    quality: 'best-effort',
  },
  {
    id: 'compress',
    icon: Minimize2,
    category: 'organize',
    quality: 'high',
  },
  {
    id: 'merge',
    icon: Combine,
    category: 'organize',
    quality: 'high',
  },
  {
    id: 'split',
    icon: Scissors,
    category: 'organize',
    quality: 'high',
  },
  {
    id: 'rotate',
    icon: RotateCw,
    category: 'organize',
    quality: 'high',
  },
  {
    id: 'reorder',
    icon: ListOrdered,
    category: 'organize',
    quality: 'high',
  },
  {
    id: 'image-to-pdf',
    icon: ImageIcon,
    category: 'convert',
    quality: 'high',
  },
  {
    id: 'extract-text',
    icon: FileText,
    category: 'extract',
    quality: 'high',
  },
  {
    id: 'extract-images',
    icon: Images,
    category: 'extract',
    quality: 'high',
  },
  {
    id: 'password',
    icon: Lock,
    category: 'secure',
    quality: 'high',
  },
  {
    id: 'metadata',
    icon: Tag,
    category: 'organize',
    quality: 'high',
  },
  {
    id: 'pdf-to-markdown',
    icon: FileCode2,
    category: 'convert',
    quality: 'high',
  },
  {
    id: 'pdf-to-word',
    icon: FileType,
    category: 'convert',
    quality: 'best-effort',
  },
  {
    id: 'pdf-to-excel',
    icon: Sheet,
    category: 'convert',
    quality: 'best-effort',
  },
  {
    id: 'pdf-to-ppt',
    icon: Presentation,
    category: 'convert',
    quality: 'best-effort',
  },
  {
    id: 'ocr',
    icon: ScanText,
    category: 'ocr',
    quality: 'best-effort',
  },
]

export const CATEGORY_ORDER: ToolMeta['category'][] = [
  'organize',
  'convert',
  'extract',
  'secure',
  'ocr',
]

export const TOOLS_BY_CATEGORY: Record<ToolMeta['category'], ToolMeta[]> = TOOLS.reduce(
  (acc, t) => {
    ;(acc[t.category] ||= []).push(t)
    return acc
  },
  {} as Record<ToolMeta['category'], ToolMeta[]>,
)

/** Tool metadata plus its name and description in the active language. */
export function useToolMeta(id: ToolId) {
  const text = useMessages(toolMessages).tools[id]
  const meta = TOOLS.find((t) => t.id === id)!
  return { ...meta, ...text }
}
