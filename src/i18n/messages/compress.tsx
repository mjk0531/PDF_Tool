import { defineMessages } from '..'

/** Compress PDF tool: options, result panels, breakdown cards and progress statuses. */
export default defineMessages({
  en: {
    compress: 'Compress',
    compressing: 'Compressing...',
    failed: 'Compression failed',
    levels: {
      'higher-quality': {
        label: 'Higher quality',
        hint: 'Near-original quality. Smaller savings, best for printable docs.',
      },
      recommended: {
        label: 'Recommended',
        hint: 'Balanced. Keeps small text crisp while still shrinking meaningfully.',
      },
      'smaller-size': {
        label: 'Smaller size',
        hint: 'Aggressive. Smallest output. Fine for screen viewing or email.',
      },
    },
    ready: {
      title: 'Ready to compress',
      message: (size: string, pages: number | null) =>
        `${size} · ${pages === 1 ? '1 page' : `${pages ?? '?'} pages`}. Press Compress in the top right.`,
      pipeline:
        "Two-phase pipeline: image recompression in pdf-lib, then a MuPDF structural pass (font subsetting, garbage collection, stream cleanup). MuPDF's ~12 MB WASM engine downloads the first time you compress and is cached afterward.",
    },
    largeFileHint: 'Large files may take 30 seconds or more.',
    result: {
      compressedTo: (pct: string) => `Compressed to ${pct}% of original`,
      noReduction: 'No size reduction possible',
      saved: (saved: string, from: string, to: string) => `Saved ${saved} · ${from} → ${to}`,
      alreadyOptimized: (from: string, to: string) =>
        `${from} → ${to} — this PDF is already optimized.`,
      download: 'Download compressed PDF',
    },
    rasterizedNote:
      'Output is image-only. Text is no longer selectable. Any digital signatures or form fields from the original are not in this file.',
    breakdown: {
      heading: 'Where the file size is',
      signatures: 'Signatures',
      fonts: 'Fonts',
      images: 'Images',
      contentStreams: 'Content streams',
      metadata: 'Metadata',
      other: 'Other (xref, dicts, …)',
    },
    imageStats: {
      heading: 'Image recompression',
      found: 'Embedded images found',
      recompressed: 'Recompressed (JPEG / PNG)',
      skipped: 'Skipped (unsupported format)',
      replaced: 'Replaced (smaller after recompress)',
      bytesSaved: 'Bytes saved on images',
    },
    limit: {
      title: 'This PDF is at its natural compression limit.',
      signatures: (size: string) => (
        <>
          Most of the size is <strong className="text-fg">digital signatures</strong> ({size}) —
          cryptographic data that can't be compressed without breaking signature validity.
        </>
      ),
      fonts: (size: string) => (
        <>
          Most of the size is <strong className="text-fg">embedded fonts</strong> ({size}) that are
          already subsetted.
        </>
      ),
      other: 'The remaining bulk is already-compressed content.',
      forceHint: (
        <>
          To force a smaller file, you can rasterize every page to JPEG.{' '}
          <strong className="text-fg">Text becomes raster</strong> (no longer selectable or
          searchable) and any digital signatures will not transfer.
        </>
      ),
      forceButton: 'Force compress (rasterize, lose text & signatures)',
    },
    progress: {
      reading: 'Reading PDF...',
      recompressingImage: (current: number, total: number) =>
        `Recompressing image ${current} of ${total}...`,
      analyzing: 'Analyzing result...',
      rasterizingPage: (i: number, total: number) => `Rasterizing page ${i} of ${total}...`,
      rasterizedPage: (i: number, total: number) => `Rasterized page ${i} of ${total}`,
      loadingEngine: 'Loading PDF engine...',
      subsettingFonts: 'Subsetting fonts...',
      optimizing: 'Optimizing structure...',
    },
  },
  ko: {
    compress: '압축',
    compressing: '압축 중...',
    failed: '압축에 실패했습니다',
    levels: {
      'higher-quality': {
        label: '고품질',
        hint: '원본에 가까운 품질입니다. 줄어드는 용량은 적지만 인쇄용 문서에 적합합니다.',
      },
      recommended: {
        label: '권장',
        hint: '균형 잡힌 설정입니다. 작은 글자도 선명하게 유지하면서 용량을 충분히 줄입니다.',
      },
      'smaller-size': {
        label: '저용량',
        hint: '강력하게 압축해 용량이 가장 작습니다. 화면으로 보거나 이메일로 보내기에 적합합니다.',
      },
    },
    ready: {
      title: '압축 준비 완료',
      message: (size, pages) =>
        `${size} · ${pages ?? '?'}페이지. 오른쪽 위의 압축 버튼을 누르세요.`,
      pipeline:
        '2단계로 처리합니다. pdf-lib로 이미지를 다시 압축한 뒤 MuPDF로 구조를 최적화합니다(글꼴 서브셋, 미사용 객체 제거, 스트림 정리). 약 12 MB 크기의 MuPDF WASM 엔진은 처음 압축할 때 다운로드되며 이후에는 캐시됩니다.',
    },
    largeFileHint: '큰 파일은 30초 이상 걸릴 수 있습니다.',
    result: {
      compressedTo: (pct) => `원본의 ${pct}% 크기로 압축됨`,
      noReduction: '용량을 줄일 수 없음',
      saved: (saved, from, to) => `${saved} 절약 · ${from} → ${to}`,
      alreadyOptimized: (from, to) => `${from} → ${to} — 이미 최적화된 PDF입니다.`,
      download: '압축된 PDF 다운로드',
    },
    rasterizedNote:
      '결과 파일은 이미지로만 구성되어 텍스트를 선택할 수 없습니다. 원본의 디지털 서명이나 양식 필드는 이 파일에 포함되지 않습니다.',
    breakdown: {
      heading: '파일 용량 구성',
      signatures: '서명',
      fonts: '글꼴',
      images: '이미지',
      contentStreams: '콘텐츠 스트림',
      metadata: '메타데이터',
      other: '기타 (xref, 딕셔너리 등)',
    },
    imageStats: {
      heading: '이미지 재압축',
      found: '발견된 내장 이미지',
      recompressed: '재압축 (JPEG / PNG)',
      skipped: '건너뜀 (지원하지 않는 형식)',
      replaced: '교체됨 (재압축 후 더 작아짐)',
      bytesSaved: '이미지에서 줄인 용량',
    },
    limit: {
      title: '이 PDF는 이미 압축 한계에 도달했습니다.',
      signatures: (size) => (
        <>
          용량 대부분이 <strong className="text-fg">디지털 서명</strong>({size})입니다. 서명을
          무효화하지 않고는 압축할 수 없는 암호화 데이터입니다.
        </>
      ),
      fonts: (size) => (
        <>
          용량 대부분이 이미 서브셋 처리된{' '}
          <strong className="text-fg">내장 글꼴</strong>({size})입니다.
        </>
      ),
      other: '나머지 대부분은 이미 압축된 콘텐츠입니다.',
      forceHint: (
        <>
          파일을 강제로 더 줄이려면 모든 페이지를 JPEG로 래스터화할 수 있습니다.{' '}
          <strong className="text-fg">텍스트가 이미지로 바뀌어</strong> 선택하거나 검색할 수 없게
          되며, 디지털 서명도 유지되지 않습니다.
        </>
      ),
      forceButton: '강제 압축 (래스터화, 텍스트·서명 손실)',
    },
    progress: {
      reading: 'PDF 읽는 중...',
      recompressingImage: (current, total) => `이미지 재압축 중... (${current}/${total})`,
      analyzing: '결과 분석 중...',
      rasterizingPage: (i, total) => `페이지 래스터화 중... (${i}/${total})`,
      rasterizedPage: (i, total) => `페이지 래스터화 완료 (${i}/${total})`,
      loadingEngine: 'PDF 엔진 불러오는 중...',
      subsettingFonts: '글꼴 서브셋 처리 중...',
      optimizing: '구조 최적화 중...',
    },
  },
  es: {
    compress: 'Comprimir',
    compressing: 'Comprimiendo...',
    failed: 'Error al comprimir',
    levels: {
      'higher-quality': {
        label: 'Mayor calidad',
        hint: 'Calidad casi original. Ahorro menor; ideal para documentos que se van a imprimir.',
      },
      recommended: {
        label: 'Recomendado',
        hint: 'Equilibrado. Mantiene nítido el texto pequeño y aun así reduce bastante el tamaño.',
      },
      'smaller-size': {
        label: 'Menor tamaño',
        hint: 'Agresivo. El archivo más pequeño. Válido para ver en pantalla o enviar por correo.',
      },
    },
    ready: {
      title: 'Listo para comprimir',
      message: (size, pages) =>
        `${size} · ${pages === 1 ? '1 página' : `${pages ?? '?'} páginas`}. Pulsa Comprimir arriba a la derecha.`,
      pipeline:
        'Proceso en dos fases: recompresión de imágenes con pdf-lib y luego una pasada estructural con MuPDF (subconjuntos de fuentes, recolección de basura, limpieza de flujos). El motor WASM de MuPDF (~12 MB) se descarga la primera vez que comprimes y después queda en caché.',
    },
    largeFileHint: 'Los archivos grandes pueden tardar 30 segundos o más.',
    result: {
      compressedTo: (pct) => `Comprimido al ${pct}% del original`,
      noReduction: 'No es posible reducir el tamaño',
      saved: (saved, from, to) => `Ahorro: ${saved} · ${from} → ${to}`,
      alreadyOptimized: (from, to) => `${from} → ${to} — este PDF ya está optimizado.`,
      download: 'Descargar PDF comprimido',
    },
    rasterizedNote:
      'El resultado contiene solo imágenes. El texto ya no se puede seleccionar. Las firmas digitales y los campos de formulario del original no están en este archivo.',
    breakdown: {
      heading: 'Desglose del tamaño',
      signatures: 'Firmas',
      fonts: 'Fuentes',
      images: 'Imágenes',
      contentStreams: 'Flujos de contenido',
      metadata: 'Metadatos',
      other: 'Otros (xref, diccionarios, …)',
    },
    imageStats: {
      heading: 'Recompresión de imágenes',
      found: 'Imágenes incrustadas encontradas',
      recompressed: 'Recomprimidas (JPEG / PNG)',
      skipped: 'Omitidas (formato no compatible)',
      replaced: 'Reemplazadas (más pequeñas al recomprimir)',
      bytesSaved: 'Ahorro en imágenes',
    },
    limit: {
      title: 'Este PDF está en su límite natural de compresión.',
      signatures: (size) => (
        <>
          La mayor parte del tamaño son <strong className="text-fg">firmas digitales</strong> (
          {size}): datos criptográficos que no se pueden comprimir sin invalidar las firmas.
        </>
      ),
      fonts: (size) => (
        <>
          La mayor parte del tamaño son <strong className="text-fg">fuentes incrustadas</strong> (
          {size}) ya reducidas a subconjuntos.
        </>
      ),
      other: 'El resto es, en su mayoría, contenido ya comprimido.',
      forceHint: (
        <>
          Para forzar un archivo más pequeño, puedes rasterizar cada página a JPEG.{' '}
          <strong className="text-fg">El texto pasa a ser imagen</strong> (ya no se puede
          seleccionar ni buscar) y las firmas digitales no se conservan.
        </>
      ),
      forceButton: 'Forzar compresión (rasterizar, sin texto ni firmas)',
    },
    progress: {
      reading: 'Leyendo PDF...',
      recompressingImage: (current, total) => `Recomprimiendo imagen ${current} de ${total}...`,
      analyzing: 'Analizando resultado...',
      rasterizingPage: (i, total) => `Rasterizando página ${i} de ${total}...`,
      rasterizedPage: (i, total) => `Página ${i} de ${total} rasterizada`,
      loadingEngine: 'Cargando motor PDF...',
      subsettingFonts: 'Creando subconjuntos de fuentes...',
      optimizing: 'Optimizando estructura...',
    },
  },
})
