import { defineMessages } from '..'

/** Reorder & Delete tool. */
export default defineMessages({
  en: {
    reset: 'Reset',
    building: 'Building...',
    save: (kept: number, total: number) => `Save (${kept}/${total})`,
    pagesKept: (kept: number, total: number) => `${kept}/${total} pages kept`,
    loadingPages: 'Loading pages...',
    originalPage: (n: number) => `orig p${n}`,
    restore: 'Restore',
    remove: 'Remove',
    atLeastOne: 'At least one page must remain',
    failed: 'Reorder failed',
    success: 'Saved successfully',
  },
  ko: {
    reset: '초기화',
    building: '생성 중...',
    save: (kept, total) => `저장 (${kept}/${total})`,
    pagesKept: (kept, total) => `${kept}/${total}페이지 유지`,
    loadingPages: '페이지 불러오는 중...',
    originalPage: (n) => `원본 ${n}페이지`,
    restore: '복원',
    remove: '제거',
    atLeastOne: '페이지를 하나 이상 남겨야 합니다',
    failed: '순서 변경에 실패했습니다',
    success: '저장 완료',
  },
  es: {
    reset: 'Restablecer',
    building: 'Generando...',
    save: (kept, total) => `Guardar (${kept}/${total})`,
    pagesKept: (kept, total) =>
      `${kept}/${total} ${total === 1 ? 'página conservada' : 'páginas conservadas'}`,
    loadingPages: 'Cargando páginas...',
    originalPage: (n) => `pág. orig. ${n}`,
    restore: 'Restaurar',
    remove: 'Quitar',
    atLeastOne: 'Debe quedar al menos una página',
    failed: 'Error al reordenar',
    success: 'Guardado correctamente',
  },
})
