import { defineMessages } from '..'

/** Extract Images tool. */
export default defineMessages({
  en: {
    extract: 'Extract images',
    scanning: 'Scanning...',
    downloadZip: 'Download all as ZIP',
    scanningPages: 'Scanning pages...',
    noImages: 'No images found',
    noImagesMessage: 'This PDF has no embedded raster images.',
    found: (n: number) => `Found ${n} image${n === 1 ? '' : 's'}`,
    total: (size: string) => `Total ${size}`,
    failed: 'Extraction failed',
  },
  ko: {
    extract: '이미지 추출',
    scanning: '스캔 중...',
    downloadZip: 'ZIP으로 모두 다운로드',
    scanningPages: '페이지 스캔 중...',
    noImages: '이미지 없음',
    noImagesMessage: '이 PDF에는 포함된 래스터 이미지가 없습니다.',
    found: (n) => `이미지 ${n}개 발견`,
    total: (size) => `총 ${size}`,
    failed: '추출에 실패했습니다',
  },
  es: {
    extract: 'Extraer imágenes',
    scanning: 'Analizando...',
    downloadZip: 'Descargar todo en ZIP',
    scanningPages: 'Analizando páginas...',
    noImages: 'No se encontraron imágenes',
    noImagesMessage: 'Este PDF no contiene imágenes de mapa de bits incrustadas.',
    found: (n) => (n === 1 ? '1 imagen encontrada' : `${n} imágenes encontradas`),
    total: (size) => `Total: ${size}`,
    failed: 'Error al extraer',
  },
})
