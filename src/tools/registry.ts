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
} from 'lucide-react'

export type ToolId =
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
  name: string
  shortName: string
  description: string
  icon: LucideIcon
  category: 'convert' | 'organize' | 'extract' | 'secure' | 'ocr'
  quality: 'high' | 'best-effort'
}

export const TOOLS: ToolMeta[] = [
  {
    id: 'pdf-to-image',
    name: 'PDF to Image',
    shortName: 'To Image',
    description: 'Convert PDF pages to PNG, JPEG, or WebP',
    icon: FileImage,
    category: 'convert',
    quality: 'high',
  },
  {
    id: 'compress',
    name: 'Compress PDF',
    shortName: 'Compress',
    description: 'Shrink file size by re-encoding embedded images',
    icon: Minimize2,
    category: 'organize',
    quality: 'high',
  },
  {
    id: 'merge',
    name: 'Merge PDFs',
    shortName: 'Merge',
    description: 'Combine multiple PDFs into one',
    icon: Combine,
    category: 'organize',
    quality: 'high',
  },
  {
    id: 'split',
    name: 'Split PDF',
    shortName: 'Split',
    description: 'Split a PDF by ranges or every N pages',
    icon: Scissors,
    category: 'organize',
    quality: 'high',
  },
  {
    id: 'rotate',
    name: 'Rotate Pages',
    shortName: 'Rotate',
    description: 'Rotate all or selected pages by 90/180/270°',
    icon: RotateCw,
    category: 'organize',
    quality: 'high',
  },
  {
    id: 'reorder',
    name: 'Reorder & Delete',
    shortName: 'Reorder',
    description: 'Drag to reorder pages or remove unwanted ones',
    icon: ListOrdered,
    category: 'organize',
    quality: 'high',
  },
  {
    id: 'image-to-pdf',
    name: 'Image to PDF',
    shortName: 'Img → PDF',
    description: 'Combine images (JPG/PNG) into a single PDF',
    icon: ImageIcon,
    category: 'convert',
    quality: 'high',
  },
  {
    id: 'extract-text',
    name: 'Extract Text',
    shortName: 'Text',
    description: 'Pull all text from a PDF as .txt',
    icon: FileText,
    category: 'extract',
    quality: 'high',
  },
  {
    id: 'extract-images',
    name: 'Extract Images',
    shortName: 'Images',
    description: 'Save every embedded image as a file',
    icon: Images,
    category: 'extract',
    quality: 'high',
  },
  {
    id: 'password',
    name: 'Password',
    shortName: 'Password',
    description: 'Add or remove PDF password protection',
    icon: Lock,
    category: 'secure',
    quality: 'high',
  },
  {
    id: 'metadata',
    name: 'Edit Metadata',
    shortName: 'Metadata',
    description: 'View and edit title, author, subject, keywords',
    icon: Tag,
    category: 'organize',
    quality: 'high',
  },
  {
    id: 'pdf-to-markdown',
    name: 'PDF to Markdown',
    shortName: 'Markdown',
    description: 'Convert text-based PDF to .md',
    icon: FileCode2,
    category: 'convert',
    quality: 'high',
  },
  {
    id: 'pdf-to-word',
    name: 'PDF to Word',
    shortName: 'Word',
    description: 'Generate a .docx from PDF text (best-effort)',
    icon: FileType,
    category: 'convert',
    quality: 'best-effort',
  },
  {
    id: 'pdf-to-excel',
    name: 'PDF to Excel',
    shortName: 'Excel',
    description: 'Detect tables and export to .xlsx (best-effort)',
    icon: Sheet,
    category: 'convert',
    quality: 'best-effort',
  },
  {
    id: 'pdf-to-ppt',
    name: 'PDF to PowerPoint',
    shortName: 'PowerPoint',
    description: 'Embed each page as a slide image (.pptx)',
    icon: Presentation,
    category: 'convert',
    quality: 'best-effort',
  },
  {
    id: 'ocr',
    name: 'OCR',
    shortName: 'OCR',
    description: 'Recognize text in scanned PDFs (Tesseract.js)',
    icon: ScanText,
    category: 'ocr',
    quality: 'best-effort',
  },
]

export const CATEGORY_LABELS: Record<ToolMeta['category'], string> = {
  convert: 'Convert',
  organize: 'Organize',
  extract: 'Extract',
  secure: 'Secure',
  ocr: 'OCR',
}

export const TOOLS_BY_CATEGORY: Record<ToolMeta['category'], ToolMeta[]> = TOOLS.reduce(
  (acc, t) => {
    ;(acc[t.category] ||= []).push(t)
    return acc
  },
  {} as Record<ToolMeta['category'], ToolMeta[]>,
)
