import type { ReactNode } from 'react'
import { defineMessages } from '..'

/** Text for the Edit PDF tool (Edit.tsx, edit/*, lib/editor*). */
export default defineMessages({
  en: {
    toolbar: {
      tools: {
        select: { label: 'Select', help: 'Hover existing text to edit it' },
        'add-text': { label: 'Text', help: 'Click on a page to add new text' },
        image: { label: 'Image', help: 'Upload and click to place' },
        whiteout: { label: 'Whiteout', help: 'Drag a rectangle to cover content' },
      },
      textStyle: 'Text style',
      fontSize: 'Font size (pt)',
      color: 'Color',
      image: 'Image',
      pickDifferentImage: 'Pick different image',
      chooseImage: 'Choose image…',
      placeImageHint:
        'Click anywhere on a page to drop the image. Drag to reposition; corner handle resizes.',
    },
    page: {
      editText: (text: string) => `Edit: ${text}`,
      newText: 'Type here',
      delete: 'Delete',
      dragWrapWidth: 'Drag to set wrap width',
    },
    discardAll: 'Discard all edits',
    clearEdits: (n: number) => `Clear edits (${n})`,
    saving: 'Saving...',
    save: 'Save edited PDF',
    rendering: 'Rendering pages...',
    fontNote: (font: ReactNode) => (
      <>
        Overlay text uses {font} (Korean + Latin + partial CJK). Lines wrap to the text box width —
        drag the right handle to set it. For scanned PDFs with no selectable text, use the OCR
        button below each page.
      </>
    ),
    ocr: {
      makeEditable: (n: number) => `Make page ${n} editable with OCR`,
      starting: 'Starting...',
      loadingEngine: 'Loading OCR engine...',
      recognizing: 'Recognizing text...',
      done: 'Done',
    },
    warnings: {
      title: (n: number) => `${n} warning${n === 1 ? '' : 's'} from the last save`,
      skipped: (size: string) => `Total ${size} skipped — see details.`,
      renderFailed: (msg: string) => `Failed to render annotation: ${msg}`,
      segmentSkipped: (snippet: string, msg: string) => `Skipped a segment in "${snippet}…": ${msg}`,
    },
    errors: {
      loadFailed: 'Failed to load PDF',
      ocrFailed: 'OCR failed',
      exportFailed: 'Export failed',
      fontLoadFailed: (status: number) => `Failed to load Pretendard font (${status})`,
    },
  },
  ko: {
    toolbar: {
      tools: {
        select: { label: '선택', help: '기존 텍스트에 마우스를 올려 편집하세요' },
        'add-text': { label: '텍스트', help: '페이지를 클릭해 새 텍스트를 추가하세요' },
        image: { label: '이미지', help: '이미지를 업로드한 뒤 클릭해 배치하세요' },
        whiteout: { label: '화이트아웃', help: '사각형을 드래그해 내용을 가리세요' },
      },
      textStyle: '텍스트 스타일',
      fontSize: '글꼴 크기(pt)',
      color: '색상',
      image: '이미지',
      pickDifferentImage: '다른 이미지 선택',
      chooseImage: '이미지 선택…',
      placeImageHint:
        '페이지의 원하는 곳을 클릭해 이미지를 놓으세요. 드래그로 위치를 옮기고, 모서리 핸들로 크기를 조절합니다.',
    },
    page: {
      editText: (text) => `편집: ${text}`,
      newText: '여기에 입력',
      delete: '삭제',
      dragWrapWidth: '드래그해 줄바꿈 너비 설정',
    },
    discardAll: '모든 편집 내용 삭제',
    clearEdits: (n) => `편집 지우기 (${n})`,
    saving: '저장 중...',
    save: '편집한 PDF 저장',
    rendering: '페이지 렌더링 중...',
    fontNote: (font) => (
      <>
        추가한 텍스트에는 {font} 글꼴(한글 + 라틴 문자 + 일부 CJK)이 사용됩니다. 텍스트는 상자
        너비에 맞춰 줄바꿈되며, 오른쪽 핸들을 드래그해 너비를 조절할 수 있습니다. 선택할 수 있는
        텍스트가 없는 스캔 PDF는 각 페이지 아래의 OCR 버튼을 사용하세요.
      </>
    ),
    ocr: {
      makeEditable: (n) => `OCR로 ${n}페이지 편집 가능하게 만들기`,
      starting: '시작 중...',
      loadingEngine: 'OCR 엔진 불러오는 중...',
      recognizing: '텍스트 인식 중...',
      done: '완료',
    },
    warnings: {
      title: (n) => `마지막 저장 시 경고 ${n}개`,
      skipped: (size) => `총 ${size} 건너뜀 — 자세한 내용을 확인하세요.`,
      renderFailed: (msg) => `편집 항목을 렌더링하지 못했습니다: ${msg}`,
      segmentSkipped: (snippet, msg) => `"${snippet}…"의 일부를 건너뛰었습니다: ${msg}`,
    },
    errors: {
      loadFailed: 'PDF를 불러오지 못했습니다',
      ocrFailed: 'OCR에 실패했습니다',
      exportFailed: '내보내기에 실패했습니다',
      fontLoadFailed: (status) => `Pretendard 글꼴을 불러오지 못했습니다 (${status})`,
    },
  },
  es: {
    toolbar: {
      tools: {
        select: { label: 'Seleccionar', help: 'Pasa el cursor sobre el texto existente para editarlo' },
        'add-text': { label: 'Texto', help: 'Haz clic en una página para añadir texto nuevo' },
        image: { label: 'Imagen', help: 'Sube una imagen y haz clic para colocarla' },
        whiteout: { label: 'Corrector', help: 'Arrastra un rectángulo para tapar contenido' },
      },
      textStyle: 'Estilo de texto',
      fontSize: 'Tamaño de fuente (pt)',
      color: 'Color',
      image: 'Imagen',
      pickDifferentImage: 'Elegir otra imagen',
      chooseImage: 'Elegir imagen…',
      placeImageHint:
        'Haz clic en cualquier punto de una página para soltar la imagen. Arrástrala para moverla; el tirador de la esquina la redimensiona.',
    },
    page: {
      editText: (text) => `Editar: ${text}`,
      newText: 'Escribe aquí',
      delete: 'Eliminar',
      dragWrapWidth: 'Arrastra para fijar el ancho de línea',
    },
    discardAll: 'Descartar todos los cambios',
    clearEdits: (n) => `Borrar cambios (${n})`,
    saving: 'Guardando...',
    save: 'Guardar PDF editado',
    rendering: 'Renderizando páginas...',
    fontNote: (font) => (
      <>
        El texto añadido usa {font} (coreano + latino + CJK parcial). Las líneas se ajustan al ancho
        del cuadro de texto — arrastra el tirador derecho para fijarlo. En PDF escaneados sin texto
        seleccionable, usa el botón de OCR bajo cada página.
      </>
    ),
    ocr: {
      makeEditable: (n) => `Hacer editable la página ${n} con OCR`,
      starting: 'Iniciando...',
      loadingEngine: 'Cargando motor de OCR...',
      recognizing: 'Reconociendo texto...',
      done: 'Listo',
    },
    warnings: {
      title: (n) => (n === 1 ? '1 aviso del último guardado' : `${n} avisos del último guardado`),
      skipped: (size) => `Total omitido: ${size} — consulta los detalles.`,
      renderFailed: (msg) => `No se pudo renderizar una edición: ${msg}`,
      segmentSkipped: (snippet, msg) => `Se omitió un fragmento de "${snippet}…": ${msg}`,
    },
    errors: {
      loadFailed: 'No se pudo cargar el PDF',
      ocrFailed: 'Error en el OCR',
      exportFailed: 'Error al exportar',
      fontLoadFailed: (status) => `No se pudo cargar la fuente Pretendard (${status})`,
    },
  },
})
