import type { ConvertedPage } from './lib/converter'

export type FileStatus = 'idle' | 'loading' | 'ready' | 'converting' | 'done' | 'error'

export interface PdfFile {
  id: string
  file: File
  status: FileStatus
  totalPages: number | null
  convertedPages: ConvertedPage[]
  error: string | null
}
