import { defineMessages } from '..'

/** Rotate tool. */
export default defineMessages({
  en: {
    rotate: 'Rotate',
    rotating: 'Rotating...',
    angle: 'Angle',
    pages: 'Pages',
    pagesHint: 'Empty = all. e.g. 1-5, 7',
    allPages: 'All pages',
    invalidRange: 'Invalid page range',
    failed: 'Rotation failed',
    success: 'Rotated successfully',
    rotatedBy: (angle: number) => `pages rotated by ${angle}°`,
    downloadRotated: 'Download rotated PDF',
  },
  ko: {
    rotate: '회전',
    rotating: '회전 중...',
    angle: '각도',
    pages: '페이지',
    pagesHint: '비워 두면 전체. 예: 1-5, 7',
    allPages: '전체 페이지',
    invalidRange: '페이지 범위가 올바르지 않습니다',
    failed: '회전에 실패했습니다',
    success: '회전 완료',
    rotatedBy: (angle) => `${angle}° 회전됨`,
    downloadRotated: '회전된 PDF 다운로드',
  },
  es: {
    rotate: 'Rotar',
    rotating: 'Rotando...',
    angle: 'Ángulo',
    pages: 'Páginas',
    pagesHint: 'Vacío = todas. Ej.: 1-5, 7',
    allPages: 'Todas las páginas',
    invalidRange: 'Rango de páginas no válido',
    failed: 'Error al rotar',
    success: 'Rotación completada',
    rotatedBy: (angle) => `páginas rotadas ${angle}°`,
    downloadRotated: 'Descargar PDF rotado',
  },
})
