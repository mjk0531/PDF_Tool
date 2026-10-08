import { defineMessages } from '..'

/** Extract Text tool. */
export default defineMessages({
  en: {
    extract: 'Extract text',
    extracting: 'Extracting...',
    output: 'Output',
    modes: {
      single: 'Single .txt',
      perPage: 'Per-page',
    },
    copyAll: 'Copy all to clipboard',
    extractingPages: 'Extracting pages...',
    extracted: (n: number) => (n === 1 ? 'Extracted 1 page' : `Extracted ${n} pages`),
    chars: (n: number) => `${n.toLocaleString()} chars`,
    truncated: '\n\n... (truncated in preview)',
    ready: 'Ready to extract',
    readyMessage: 'Click Extract text to read all text content from this PDF.',
    failed: 'Extraction failed',
  },
  ko: {
    extract: '텍스트 추출',
    extracting: '추출 중...',
    output: '출력',
    modes: {
      single: '단일 .txt',
      perPage: '페이지별',
    },
    copyAll: '모두 클립보드에 복사',
    extractingPages: '페이지 추출 중...',
    extracted: (n) => `${n}페이지 추출 완료`,
    chars: (n) => `${n.toLocaleString()}자`,
    truncated: '\n\n... (미리보기에서는 일부만 표시됩니다)',
    ready: '추출 준비 완료',
    readyMessage: '텍스트 추출을 눌러 이 PDF의 모든 텍스트를 가져오세요.',
    failed: '추출에 실패했습니다',
  },
  es: {
    extract: 'Extraer texto',
    extracting: 'Extrayendo...',
    output: 'Salida',
    modes: {
      single: 'Un solo .txt',
      perPage: 'Por página',
    },
    copyAll: 'Copiar todo al portapapeles',
    extractingPages: 'Extrayendo páginas...',
    extracted: (n) => (n === 1 ? '1 página extraída' : `${n} páginas extraídas`),
    chars: (n) => (n === 1 ? '1 carácter' : `${n.toLocaleString()} caracteres`),
    truncated: '\n\n... (vista previa truncada)',
    ready: 'Listo para extraer',
    readyMessage: 'Pulsa Extraer texto para leer todo el texto de este PDF.',
    failed: 'Error al extraer',
  },
})
