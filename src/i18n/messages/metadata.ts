import { defineMessages } from '..'

/** Metadata tool. */
export default defineMessages({
  en: {
    fields: {
      title: 'Title',
      author: 'Author',
      subject: 'Subject',
      keywords: 'Keywords (comma-separated)',
      creator: 'Creator',
      producer: 'Producer',
      creationDate: 'Created',
      modificationDate: 'Modified',
    },
    empty: 'Empty',
    save: 'Save metadata',
    saving: 'Saving...',
    failed: 'Save failed',
    saved: 'Metadata saved',
  },
  ko: {
    fields: {
      title: '제목',
      author: '작성자',
      subject: '주제',
      keywords: '키워드 (쉼표로 구분)',
      creator: '작성 프로그램',
      producer: 'PDF 변환기',
      creationDate: '만든 날짜',
      modificationDate: '수정한 날짜',
    },
    empty: '비어 있음',
    save: '메타데이터 저장',
    saving: '저장 중...',
    failed: '저장에 실패했습니다',
    saved: '메타데이터 저장 완료',
  },
  es: {
    fields: {
      title: 'Título',
      author: 'Autor',
      subject: 'Asunto',
      keywords: 'Palabras clave (separadas por comas)',
      creator: 'Creador',
      producer: 'Productor',
      creationDate: 'Creado',
      modificationDate: 'Modificado',
    },
    empty: 'Vacío',
    save: 'Guardar metadatos',
    saving: 'Guardando...',
    failed: 'Error al guardar',
    saved: 'Metadatos guardados',
  },
})
