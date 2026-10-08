import { defineMessages } from '..'

/** Image to PDF tool. */
export default defineMessages({
  en: {
    dropDescription: 'Drop JPG or PNG images. Order matches drop order.',
    building: 'Building...',
    buildPdf: (n: number) => `Build PDF (${n})`,
    created: 'PDF created',
    downloadFile: (name: string) => `Download ${name}`,
    options: {
      pageSize: 'Page Size',
      pageSizes: {
        a4: 'A4',
        letter: 'Letter',
        auto: 'Image size',
      },
      orientation: 'Orientation',
      orientations: {
        portrait: 'Portrait',
        landscape: 'Landscape',
        auto: 'Auto',
      },
      fit: 'Fit',
      fits: {
        fit: 'Fit',
        fill: 'Fill',
        original: 'Original',
      },
      margin: 'Margin (points)',
    },
    errors: {
      conversionFailed: 'Conversion failed',
    },
  },
  ko: {
    dropDescription: 'JPG 또는 PNG 이미지를 놓으세요. 놓은 순서대로 배치됩니다.',
    building: '만드는 중...',
    buildPdf: (n) => `PDF 만들기 (${n})`,
    created: 'PDF 생성 완료',
    downloadFile: (name) => `${name} 다운로드`,
    options: {
      pageSize: '페이지 크기',
      pageSizes: {
        a4: 'A4',
        letter: '레터',
        auto: '이미지 크기',
      },
      orientation: '방향',
      orientations: {
        portrait: '세로',
        landscape: '가로',
        auto: '자동',
      },
      fit: '크기 맞춤',
      fits: {
        fit: '맞춤',
        fill: '채우기',
        original: '원본',
      },
      margin: '여백 (포인트)',
    },
    errors: {
      conversionFailed: '변환에 실패했습니다',
    },
  },
  es: {
    dropDescription: 'Suelta imágenes JPG o PNG. Se mantiene el orden en que las sueltas.',
    building: 'Creando...',
    buildPdf: (n) => `Crear PDF (${n})`,
    created: 'PDF creado',
    downloadFile: (name) => `Descargar ${name}`,
    options: {
      pageSize: 'Tamaño de página',
      pageSizes: {
        a4: 'A4',
        letter: 'Carta',
        auto: 'Según imagen',
      },
      orientation: 'Orientación',
      orientations: {
        portrait: 'Vertical',
        landscape: 'Horizontal',
        auto: 'Automático',
      },
      fit: 'Ajuste',
      fits: {
        fit: 'Ajustar',
        fill: 'Rellenar',
        original: 'Original',
      },
      margin: 'Margen (puntos)',
    },
    errors: {
      conversionFailed: 'Error al convertir',
    },
  },
})
