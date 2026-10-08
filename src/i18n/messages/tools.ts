import { defineMessages } from '..'
import type { ToolId, ToolMeta } from '../../tools/registry'

interface ToolText {
  name: string
  description: string
}

/** Tool names and one-line descriptions (sidebar, landing cards, tool headers). */
export default defineMessages<{
  categories: Record<ToolMeta['category'], string>
  tools: Record<ToolId, ToolText>
}>({
  en: {
    categories: {
      convert: 'Convert',
      organize: 'Organize',
      extract: 'Extract',
      secure: 'Secure',
      ocr: 'OCR',
    },
    tools: {
      'pdf-to-image': { name: 'PDF to Image', description: 'Convert PDF pages to PNG, JPEG, or WebP' },
      edit: { name: 'Edit PDF', description: 'Add text, images, whiteout, and edit existing text' },
      compress: { name: 'Compress PDF', description: 'Shrink file size by re-encoding embedded images' },
      merge: { name: 'Merge PDFs', description: 'Combine multiple PDFs into one' },
      split: { name: 'Split PDF', description: 'Split a PDF by ranges or every N pages' },
      rotate: { name: 'Rotate Pages', description: 'Rotate all or selected pages by 90/180/270°' },
      reorder: { name: 'Reorder & Delete', description: 'Drag to reorder pages or remove unwanted ones' },
      'image-to-pdf': { name: 'Image to PDF', description: 'Combine images (JPG/PNG) into a single PDF' },
      'extract-text': { name: 'Extract Text', description: 'Pull all text from a PDF as .txt' },
      'extract-images': { name: 'Extract Images', description: 'Save every embedded image as a file' },
      password: { name: 'Password', description: 'Add or remove PDF password protection' },
      metadata: { name: 'Edit Metadata', description: 'View and edit title, author, subject, keywords' },
      'pdf-to-markdown': { name: 'PDF to Markdown', description: 'Convert text-based PDF to .md' },
      'pdf-to-word': { name: 'PDF to Word', description: 'Generate a .docx from PDF text (best-effort)' },
      'pdf-to-excel': { name: 'PDF to Excel', description: 'Detect tables and export to .xlsx (best-effort)' },
      'pdf-to-ppt': { name: 'PDF to PowerPoint', description: 'Embed each page as a slide image (.pptx)' },
      ocr: { name: 'OCR', description: 'Recognize text in scanned PDFs (Tesseract.js)' },
    },
  },
  ko: {
    categories: {
      convert: '변환',
      organize: '정리',
      extract: '추출',
      secure: '보안',
      ocr: 'OCR',
    },
    tools: {
      'pdf-to-image': { name: 'PDF를 이미지로', description: 'PDF 페이지를 PNG, JPEG, WebP로 변환' },
      edit: { name: 'PDF 편집', description: '텍스트·이미지 추가, 화이트아웃, 기존 텍스트 수정' },
      compress: { name: 'PDF 압축', description: '내장 이미지를 다시 인코딩해 파일 크기 축소' },
      merge: { name: 'PDF 병합', description: '여러 PDF를 하나로 합치기' },
      split: { name: 'PDF 분할', description: '범위 또는 N페이지 단위로 PDF 나누기' },
      rotate: { name: '페이지 회전', description: '전체 또는 선택한 페이지를 90/180/270° 회전' },
      reorder: { name: '순서 변경·삭제', description: '드래그로 페이지 순서를 바꾸거나 필요 없는 페이지 삭제' },
      'image-to-pdf': { name: '이미지를 PDF로', description: '이미지(JPG/PNG)를 하나의 PDF로 합치기' },
      'extract-text': { name: '텍스트 추출', description: 'PDF의 모든 텍스트를 .txt로 추출' },
      'extract-images': { name: '이미지 추출', description: '내장된 이미지를 모두 파일로 저장' },
      password: { name: '비밀번호', description: 'PDF 비밀번호 보호 추가 또는 해제' },
      metadata: { name: '메타데이터 편집', description: '제목, 작성자, 주제, 키워드 보기 및 편집' },
      'pdf-to-markdown': { name: 'PDF를 마크다운으로', description: '텍스트 기반 PDF를 .md로 변환' },
      'pdf-to-word': { name: 'PDF를 Word로', description: 'PDF 텍스트로 .docx 생성 (간이 변환)' },
      'pdf-to-excel': { name: 'PDF를 Excel로', description: '표를 감지해 .xlsx로 내보내기 (간이 변환)' },
      'pdf-to-ppt': { name: 'PDF를 PPT로', description: '각 페이지를 슬라이드 이미지로 삽입 (.pptx)' },
      ocr: { name: 'OCR', description: '스캔한 PDF에서 텍스트 인식 (Tesseract.js)' },
    },
  },
  es: {
    categories: {
      convert: 'Convertir',
      organize: 'Organizar',
      extract: 'Extraer',
      secure: 'Seguridad',
      ocr: 'OCR',
    },
    tools: {
      'pdf-to-image': { name: 'PDF a imagen', description: 'Convierte páginas PDF a PNG, JPEG o WebP' },
      edit: { name: 'Editar PDF', description: 'Añade texto, imágenes y corrector, o edita el texto existente' },
      compress: { name: 'Comprimir PDF', description: 'Reduce el tamaño recodificando las imágenes incrustadas' },
      merge: { name: 'Unir PDF', description: 'Combina varios PDF en uno solo' },
      split: { name: 'Dividir PDF', description: 'Divide un PDF por rangos o cada N páginas' },
      rotate: { name: 'Rotar páginas', description: 'Rota todas las páginas o las seleccionadas 90/180/270°' },
      reorder: { name: 'Reordenar y eliminar', description: 'Arrastra para reordenar páginas o quitar las que sobran' },
      'image-to-pdf': { name: 'Imagen a PDF', description: 'Combina imágenes (JPG/PNG) en un solo PDF' },
      'extract-text': { name: 'Extraer texto', description: 'Extrae todo el texto de un PDF como .txt' },
      'extract-images': { name: 'Extraer imágenes', description: 'Guarda cada imagen incrustada como archivo' },
      password: { name: 'Contraseña', description: 'Añade o quita la protección con contraseña' },
      metadata: { name: 'Editar metadatos', description: 'Consulta y edita título, autor, asunto y palabras clave' },
      'pdf-to-markdown': { name: 'PDF a Markdown', description: 'Convierte un PDF con texto a .md' },
      'pdf-to-word': { name: 'PDF a Word', description: 'Genera un .docx a partir del texto del PDF (aproximado)' },
      'pdf-to-excel': { name: 'PDF a Excel', description: 'Detecta tablas y las exporta a .xlsx (aproximado)' },
      'pdf-to-ppt': { name: 'PDF a PowerPoint', description: 'Inserta cada página como imagen de diapositiva (.pptx)' },
      ocr: { name: 'OCR', description: 'Reconoce texto en PDF escaneados (Tesseract.js)' },
    },
  },
})
