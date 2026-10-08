import { defineMessages } from '..'

/** PDF to Markdown / Word / Excel / PowerPoint converters (src/tools/PdfTo*.tsx). */
export default defineMessages({
  en: {
    conversionFailed: 'Conversion failed',
    /** Download button for a generated file; `ext` is e.g. ".docx". */
    downloadExt: (ext: string) => `Download ${ext}`,
    markdown: {
      convert: 'Convert to Markdown',
      copy: 'Copy markdown',
      note: 'Heading levels are inferred by font size. Plain prose is preserved.',
      extracting: 'Extracting pages...',
      done: 'Markdown generated',
      lines: (n: number) => (n === 1 ? '1 line' : `${n} lines`),
      truncated: '... (truncated in preview)',
    },
    word: {
      convert: 'Convert to .docx',
      noticeTitle: 'Best-effort conversion.',
      noticeBody:
        'The output preserves text, paragraphs, and a heading hierarchy inferred from font size — but multi-column layouts, tables, and complex formatting will not survive. For scanned PDFs, run OCR first.',
      extracting: 'Extracting text...',
      done: 'Word document generated',
    },
    excel: {
      convert: 'Convert to .xlsx',
      detecting: 'Detecting tables...',
      noticeTitle: 'Heuristic table detection.',
      noticeBody:
        'Each PDF page becomes a worksheet. Rows are clustered by Y-coordinate and columns by X-coordinate. Output quality is excellent for clean tables and degrades for narrative text or merged-cell layouts.',
      extracting: 'Extracting layout...',
      done: 'Workbook generated',
      sheets: (n: number) => (n === 1 ? '1 sheet' : `${n} sheets`),
    },
    ppt: {
      convert: 'Convert to .pptx',
      building: 'Building slides...',
      dpiTitle: 'Slide image DPI',
      dpiHint: 'Each PDF page becomes a slide image. Higher DPI = crisper, larger file.',
      rendering: 'Rendering slides...',
      done: 'Presentation generated',
    },
  },
  ko: {
    conversionFailed: '변환에 실패했습니다',
    downloadExt: (ext) => `${ext} 다운로드`,
    markdown: {
      convert: '마크다운으로 변환',
      copy: '마크다운 복사',
      note: '제목 수준은 글꼴 크기로 추정합니다. 일반 본문은 그대로 유지됩니다.',
      extracting: '페이지 추출 중...',
      done: '마크다운 생성 완료',
      lines: (n) => `${n}줄`,
      truncated: '... (미리보기에서는 생략됨)',
    },
    word: {
      convert: '.docx로 변환',
      noticeTitle: '원본과 다를 수 있습니다.',
      noticeBody:
        '텍스트, 단락, 글꼴 크기로 추정한 제목 구조는 유지되지만 다단 레이아웃, 표, 복잡한 서식은 유지되지 않습니다. 스캔한 PDF는 먼저 OCR을 실행하세요.',
      extracting: '텍스트 추출 중...',
      done: 'Word 문서 생성 완료',
    },
    excel: {
      convert: '.xlsx로 변환',
      detecting: '표 감지 중...',
      noticeTitle: '추정 방식으로 표를 감지합니다.',
      noticeBody:
        'PDF의 각 페이지가 워크시트 하나가 됩니다. 행은 Y 좌표, 열은 X 좌표를 기준으로 묶습니다. 깔끔한 표는 결과가 매우 좋지만, 서술형 텍스트나 병합된 셀이 있는 레이아웃에서는 품질이 떨어집니다.',
      extracting: '레이아웃 추출 중...',
      done: '통합 문서 생성 완료',
      sheets: (n) => `시트 ${n}개`,
    },
    ppt: {
      convert: '.pptx로 변환',
      building: '슬라이드 만드는 중...',
      dpiTitle: '슬라이드 이미지 DPI',
      dpiHint: 'PDF의 각 페이지가 슬라이드 이미지가 됩니다. DPI가 높을수록 선명하지만 파일이 커집니다.',
      rendering: '슬라이드 렌더링 중...',
      done: '프레젠테이션 생성 완료',
    },
  },
  es: {
    conversionFailed: 'Error al convertir',
    downloadExt: (ext) => `Descargar ${ext}`,
    markdown: {
      convert: 'Convertir a Markdown',
      copy: 'Copiar Markdown',
      note: 'Los niveles de encabezado se deducen del tamaño de fuente. El texto normal se conserva.',
      extracting: 'Extrayendo páginas...',
      done: 'Markdown generado',
      lines: (n) => (n === 1 ? '1 línea' : `${n} líneas`),
      truncated: '... (recortado en la vista previa)',
    },
    word: {
      convert: 'Convertir a .docx',
      noticeTitle: 'Conversión aproximada.',
      noticeBody:
        'Se conservan el texto, los párrafos y una jerarquía de títulos deducida del tamaño de fuente, pero no los diseños en varias columnas, las tablas ni el formato complejo. Para PDF escaneados, aplica OCR primero.',
      extracting: 'Extrayendo texto...',
      done: 'Documento de Word generado',
    },
    excel: {
      convert: 'Convertir a .xlsx',
      detecting: 'Detectando tablas...',
      noticeTitle: 'Detección heurística de tablas.',
      noticeBody:
        'Cada página del PDF se convierte en una hoja de cálculo. Las filas se agrupan por coordenada Y y las columnas por coordenada X. El resultado es excelente con tablas limpias y empeora con texto narrativo o celdas combinadas.',
      extracting: 'Extrayendo diseño...',
      done: 'Libro de Excel generado',
      sheets: (n) => (n === 1 ? '1 hoja' : `${n} hojas`),
    },
    ppt: {
      convert: 'Convertir a .pptx',
      building: 'Creando diapositivas...',
      dpiTitle: 'DPI de las diapositivas',
      dpiHint: 'Cada página del PDF se convierte en una imagen de diapositiva. Más DPI = más nitidez y archivo más grande.',
      rendering: 'Renderizando diapositivas...',
      done: 'Presentación generada',
    },
  },
})
