import { defineMessages } from '..'

/** Split PDF tool. */
export default defineMessages({
  en: {
    split: 'Split',
    splitting: 'Splitting...',
    options: {
      mode: 'Mode',
      modes: {
        every: 'Every N pages',
        ranges: 'Custom ranges',
      },
      pagesPerFile: 'Pages per file',
      willProduce: (n: number) => (n === 1 ? 'Will produce 1 file' : `Will produce ${n} files`),
      ranges: 'Ranges (semicolon-separated)',
      rangesHint: 'Each range becomes one PDF. e.g. 1-3; 5; 7-10',
    },
    planned: (n: number) => (n === 1 ? '1 output file planned' : `${n} output files planned`),
    /** Short page count after each planned file name, e.g. "report_part_1.pdf (3p)". */
    pagesShort: (n: number) => `${n}p`,
    splitInto: (n: number) => (n === 1 ? 'Split into 1 file' : `Split into ${n} files`),
    totalSize: (size: string) => `Total ${size}`,
    downloadZip: 'Download all as ZIP',
    errors: {
      pagesPerFileMin: 'Pages per file must be ≥ 1',
      invalidRange: (range: string) => `Invalid range: "${range}"`,
      noRanges: 'Add at least one range',
      splitFailed: 'Split failed',
    },
  },
  ko: {
    split: '분할',
    splitting: '분할 중...',
    options: {
      mode: '분할 방식',
      modes: {
        every: 'N페이지마다',
        ranges: '범위 지정',
      },
      pagesPerFile: '파일당 페이지 수',
      willProduce: (n) => `파일 ${n}개가 만들어집니다`,
      ranges: '범위 (세미콜론으로 구분)',
      rangesHint: '범위마다 PDF가 하나씩 만들어집니다. 예: 1-3; 5; 7-10',
    },
    planned: (n) => `출력 파일 ${n}개 예정`,
    pagesShort: (n) => `${n}페이지`,
    splitInto: (n) => `파일 ${n}개로 분할 완료`,
    totalSize: (size) => `총 ${size}`,
    downloadZip: 'ZIP으로 모두 다운로드',
    errors: {
      pagesPerFileMin: '파일당 페이지 수는 1 이상이어야 합니다',
      invalidRange: (range) => `잘못된 범위: "${range}"`,
      noRanges: '범위를 하나 이상 입력하세요',
      splitFailed: '분할에 실패했습니다',
    },
  },
  es: {
    split: 'Dividir',
    splitting: 'Dividiendo...',
    options: {
      mode: 'Modo',
      modes: {
        every: 'Cada N páginas',
        ranges: 'Por rangos',
      },
      pagesPerFile: 'Páginas por archivo',
      willProduce: (n) => (n === 1 ? 'Se creará 1 archivo' : `Se crearán ${n} archivos`),
      ranges: 'Rangos (separados por ;)',
      rangesHint: 'Cada rango genera un PDF. P. ej.: 1-3; 5; 7-10',
    },
    planned: (n) => (n === 1 ? '1 archivo previsto' : `${n} archivos previstos`),
    pagesShort: (n) => (n === 1 ? '1 pág.' : `${n} págs.`),
    splitInto: (n) => (n === 1 ? 'Dividido en 1 archivo' : `Dividido en ${n} archivos`),
    totalSize: (size) => `Total: ${size}`,
    downloadZip: 'Descargar todo en ZIP',
    errors: {
      pagesPerFileMin: 'Debe haber al menos 1 página por archivo',
      invalidRange: (range) => `Rango no válido: "${range}"`,
      noRanges: 'Añade al menos un rango',
      splitFailed: 'Error al dividir',
    },
  },
})
