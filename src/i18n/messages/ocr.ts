import { defineMessages } from '..'

/** OCR tool (src/tools/Ocr.tsx) and its engine (src/lib/ocr.ts). */
export default defineMessages({
  en: {
    run: 'Run OCR',
    running: 'Recognizing...',
    failed: 'OCR failed',
    languages: {
      title: 'Languages',
      multiHint: (n: number) => `Recognizing ${n} scripts simultaneously`,
      addHint: 'Tap to add more for mixed-language documents',
    },
    layout: {
      title: 'Page Layout',
    },
    /** Tesseract page segmentation modes, keyed by PSM value (see PSM_VALUES in lib/ocr). */
    psm: {
      '3': { label: 'Auto', help: 'Default — auto layout analysis' },
      '1': { label: 'Auto + OSD', help: 'Auto with orientation/script detection' },
      '4': { label: 'Single column', help: 'Variable-sized text in one column' },
      '6': { label: 'Single block', help: 'A uniform block of text (good for screenshots)' },
      '7': { label: 'Single line', help: 'One text line (signs, titles)' },
      '8': { label: 'Single word', help: 'One word' },
      '11': { label: 'Sparse text', help: 'Find as much text as possible, no order' },
      '12': { label: 'Sparse + OSD', help: 'Sparse with orientation detection' },
      '13': { label: 'Raw line', help: 'Treat as a raw line, bypass layout' },
    },
    dpi: {
      title: 'Render DPI',
      hint: 'Higher = better accuracy, slower',
    },
    preprocess: {
      title: 'Preprocessing',
      hint: 'Cleaning up the image before recognition usually helps',
      grayscale: 'Grayscale',
      grayscaleHint: 'Removes color noise',
      contrast: 'Auto contrast',
      contrastHint: 'Stretches faded scans to full black/white range',
      binarize: 'Binarize (Otsu)',
      binarizeHint: 'Pure black/white. Best for low-contrast scans, may hurt clean PDFs',
    },
    whitelist: {
      title: 'Character Whitelist',
      hint: 'Restrict to these characters only. Leave empty for any.',
      placeholder: 'e.g. 0123456789 for digits only',
    },
    modelNotice:
      'First run downloads each language model (~5-15 MB). Cached afterward. All processing stays in your browser.',
    copyAll: 'Copy all text',
    downloadTxt: 'Download .txt',
    result: {
      title: (pages: number, avgConf: string) =>
        `Recognized ${pages} page${pages === 1 ? '' : 's'} · ${avgConf}% avg confidence`,
      lowConfidence: (low: number, total: number, size: string) =>
        `${low} of ${total} words flagged as low-confidence (highlighted below). ${size} text.`,
      summary: (words: number, size: string) => `${words === 1 ? '1 word' : `${words} words`} · ${size}`,
    },
    progress: {
      loadingEngine: 'Loading OCR engine...',
      recognizing: (page: number, total: number) => `Recognizing page ${page} of ${total}...`,
      recognized: (page: number, total: number) => `Recognized page ${page} of ${total}`,
    },
    errors: {
      noLanguage: 'Pick at least one language',
    },
  },
  ko: {
    run: 'OCR 실행',
    running: '인식 중...',
    failed: 'OCR에 실패했습니다',
    languages: {
      title: '언어',
      multiHint: (n) => `${n}개 언어를 동시에 인식합니다`,
      addHint: '여러 언어가 섞인 문서라면 눌러서 언어를 추가하세요',
    },
    layout: {
      title: '페이지 레이아웃',
    },
    psm: {
      '3': { label: '자동', help: '기본값 — 레이아웃 자동 분석' },
      '1': { label: '자동 + OSD', help: '방향·문자 체계 감지를 포함한 자동 분석' },
      '4': { label: '단일 열', help: '크기가 다양한 텍스트가 한 열로 배치된 경우' },
      '6': { label: '단일 블록', help: '균일한 텍스트 블록 (스크린샷에 적합)' },
      '7': { label: '한 줄', help: '텍스트 한 줄 (표지판, 제목)' },
      '8': { label: '한 단어', help: '단어 하나' },
      '11': { label: '흩어진 텍스트', help: '순서와 관계없이 최대한 많은 텍스트를 찾습니다' },
      '12': { label: '흩어진 텍스트 + OSD', help: '방향 감지를 포함한 흩어진 텍스트 인식' },
      '13': { label: '한 줄 (분석 생략)', help: '레이아웃 분석 없이 한 줄로 처리합니다' },
    },
    dpi: {
      title: '렌더링 DPI',
      hint: '높을수록 정확하지만 느려집니다',
    },
    preprocess: {
      title: '전처리',
      hint: '인식 전에 이미지를 정리하면 대개 결과가 좋아집니다',
      grayscale: '흑백',
      grayscaleHint: '색상 노이즈를 제거합니다',
      contrast: '자동 대비',
      contrastHint: '흐릿한 스캔을 흑백 전체 범위로 늘립니다',
      binarize: '이진화 (Otsu)',
      binarizeHint: '순수 흑백. 대비가 낮은 스캔에 가장 좋지만 깨끗한 PDF에는 역효과가 날 수 있습니다',
    },
    whitelist: {
      title: '허용 문자',
      hint: '이 문자만 인식합니다. 비워 두면 모든 문자를 인식합니다.',
      placeholder: '예: 숫자만 인식하려면 0123456789',
    },
    modelNotice:
      '처음 실행할 때 언어별 모델(약 5-15 MB)을 다운로드하며, 이후에는 캐시를 사용합니다. 모든 처리는 브라우저 안에서 이루어집니다.',
    copyAll: '모든 텍스트 복사',
    downloadTxt: '.txt 다운로드',
    result: {
      title: (pages, avgConf) => `${pages}페이지 인식 완료 · 평균 신뢰도 ${avgConf}%`,
      lowConfidence: (low, total, size) =>
        `단어 ${total}개 중 ${low}개의 신뢰도가 낮습니다 (아래에 강조 표시). 텍스트 ${size}.`,
      summary: (words, size) => `단어 ${words}개 · ${size}`,
    },
    progress: {
      loadingEngine: 'OCR 엔진 불러오는 중...',
      recognizing: (page, total) => `${total}페이지 중 ${page}페이지 인식 중...`,
      recognized: (page, total) => `${total}페이지 중 ${page}페이지 인식 완료`,
    },
    errors: {
      noLanguage: '언어를 하나 이상 선택하세요',
    },
  },
  es: {
    run: 'Ejecutar OCR',
    running: 'Reconociendo...',
    failed: 'Error en el OCR',
    languages: {
      title: 'Idiomas',
      multiHint: (n) => `Se reconocerán ${n} idiomas a la vez`,
      addHint: 'Toca para añadir más si el documento mezcla idiomas',
    },
    layout: {
      title: 'Diseño de página',
    },
    psm: {
      '3': { label: 'Automático', help: 'Predeterminado — análisis automático del diseño' },
      '1': { label: 'Automático + OSD', help: 'Automático con detección de orientación y escritura' },
      '4': { label: 'Una columna', help: 'Texto de distintos tamaños en una sola columna' },
      '6': { label: 'Un bloque', help: 'Un bloque de texto uniforme (ideal para capturas)' },
      '7': { label: 'Una línea', help: 'Una sola línea de texto (carteles, títulos)' },
      '8': { label: 'Una palabra', help: 'Una sola palabra' },
      '11': { label: 'Texto disperso', help: 'Busca todo el texto posible, sin orden' },
      '12': { label: 'Disperso + OSD', help: 'Texto disperso con detección de orientación' },
      '13': { label: 'Línea en bruto', help: 'Trata la imagen como una línea, sin analizar el diseño' },
    },
    dpi: {
      title: 'DPI de renderizado',
      hint: 'Más alto = más preciso, pero más lento',
    },
    preprocess: {
      title: 'Preprocesamiento',
      hint: 'Limpiar la imagen antes del reconocimiento suele ayudar',
      grayscale: 'Escala de grises',
      grayscaleHint: 'Elimina el ruido de color',
      contrast: 'Contraste automático',
      contrastHint: 'Estira los escaneos desvaídos a todo el rango de blanco a negro',
      binarize: 'Binarizar (Otsu)',
      binarizeHint: 'Solo blanco y negro. Ideal para escaneos con poco contraste; puede empeorar PDF limpios',
    },
    whitelist: {
      title: 'Caracteres permitidos',
      hint: 'Solo se reconocerán estos caracteres. Déjalo vacío para no limitar.',
      placeholder: 'p. ej., 0123456789 para solo dígitos',
    },
    modelNotice:
      'La primera vez se descarga cada modelo de idioma (~5-15 MB), que luego queda en caché. Todo el procesamiento ocurre en tu navegador.',
    copyAll: 'Copiar todo el texto',
    downloadTxt: 'Descargar .txt',
    result: {
      title: (pages, avgConf) =>
        pages === 1
          ? `1 página reconocida · confianza media del ${avgConf} %`
          : `${pages} páginas reconocidas · confianza media del ${avgConf} %`,
      lowConfidence: (low, total, size) =>
        `${low} de ${total} ${total === 1 ? 'palabra' : 'palabras'} con baja confianza (${
          low === 1 ? 'resaltada' : 'resaltadas'
        } abajo). Texto: ${size}.`,
      summary: (words, size) => `${words === 1 ? '1 palabra' : `${words} palabras`} · ${size}`,
    },
    progress: {
      loadingEngine: 'Cargando el motor de OCR...',
      recognizing: (page, total) => `Reconociendo página ${page} de ${total}...`,
      recognized: (page, total) => `Página ${page} de ${total} reconocida`,
    },
    errors: {
      noLanguage: 'Elige al menos un idioma',
    },
  },
})
