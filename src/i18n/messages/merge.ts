import { defineMessages } from '..'

/** Merge PDFs tool. */
export default defineMessages({
  en: {
    dropDescription: 'Drop two or more PDFs to merge in order',
    merging: 'Merging...',
    mergeFiles: (n: number) => (n === 1 ? 'Merge 1 file' : `Merge ${n} files`),
    order: (files: number, pages: number) =>
      `Order (${files === 1 ? '1 file' : `${files} files`} · ${pages === 1 ? '1 total page' : `${pages} total pages`})`,
    moveUp: 'Move up',
    moveDown: 'Move down',
    remove: 'Remove',
    success: 'Merged successfully',
    combined: (n: number) => (n === 1 ? '1 file combined' : `${n} files combined`),
    downloadFile: (name: string) => `Download ${name}`,
    errors: {
      mergeFailed: 'Merge failed',
    },
  },
  ko: {
    dropDescription: 'PDF를 두 개 이상 놓으면 순서대로 병합됩니다',
    merging: '병합 중...',
    mergeFiles: (n) => `파일 ${n}개 병합`,
    order: (files, pages) => `순서 (파일 ${files}개 · 총 ${pages}페이지)`,
    moveUp: '위로 이동',
    moveDown: '아래로 이동',
    remove: '제거',
    success: '병합 완료',
    combined: (n) => `파일 ${n}개 병합됨`,
    downloadFile: (name) => `${name} 다운로드`,
    errors: {
      mergeFailed: '병합에 실패했습니다',
    },
  },
  es: {
    dropDescription: 'Suelta dos o más PDF para unirlos en orden',
    merging: 'Uniendo...',
    mergeFiles: (n) => (n === 1 ? 'Unir 1 archivo' : `Unir ${n} archivos`),
    order: (files, pages) =>
      `Orden (${files === 1 ? '1 archivo' : `${files} archivos`} · ${pages === 1 ? '1 página' : `${pages} páginas`} en total)`,
    moveUp: 'Subir',
    moveDown: 'Bajar',
    remove: 'Quitar',
    success: 'Unión completada',
    combined: (n) => (n === 1 ? '1 archivo combinado' : `${n} archivos combinados`),
    downloadFile: (name) => `Descargar ${name}`,
    errors: {
      mergeFailed: 'Error al unir',
    },
  },
})
