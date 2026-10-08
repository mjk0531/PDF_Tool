import { defineMessages } from '..'

/** Title bar, landing page and document metadata. */
export default defineMessages({
  en: {
    docTitle: (n: number) => `PDF Toolkit — ${n} PDF tools in your browser`,
    docDescription: (n: number) =>
      `${n} PDF tools — convert, compress, merge, split, OCR, and more. Runs entirely in your browser. No upload, no server, fully private.`,
    tagline: (n: number) => `${n} tools · Browser-based · Private`,
    goHome: 'Go to home',
    toggleTheme: 'Toggle theme',
    switchToLight: 'Switch to light',
    switchToDark: 'Switch to dark',
    language: 'Language',
    githubRepo: 'GitHub repository',
    viewOnGithub: 'View on GitHub',
    landing: {
      badge: '100% browser-based · no upload, no signup',
      heading: 'Everything you need to do with a PDF',
      intro: (n: number) =>
        `${n} tools that run entirely in your browser. Drop a file, pick a tool, get a result — your file never leaves your device.`,
      private: 'Private',
      free: 'Free forever',
      openSource: 'Open source',
    },
  },
  ko: {
    docTitle: (n) => `PDF Toolkit — 브라우저에서 바로 쓰는 PDF 도구 ${n}가지`,
    docDescription: (n) =>
      `변환, 압축, 병합, 분할, OCR 등 PDF 도구 ${n}가지. 모든 작업이 브라우저 안에서 처리됩니다. 업로드도 서버도 없이 안전하게.`,
    tagline: (n) => `도구 ${n}가지 · 브라우저 기반 · 개인정보 보호`,
    goHome: '홈으로',
    toggleTheme: '테마 전환',
    switchToLight: '라이트 모드로 전환',
    switchToDark: '다크 모드로 전환',
    language: '언어',
    githubRepo: 'GitHub 저장소',
    viewOnGithub: 'GitHub에서 보기',
    landing: {
      badge: '100% 브라우저에서 처리 · 업로드 없음 · 가입 없음',
      heading: 'PDF 작업에 필요한 모든 것',
      intro: (n) =>
        `모든 작업이 브라우저 안에서 실행되는 ${n}가지 도구. 파일을 놓고 도구를 고르면 바로 결과가 나옵니다. 파일은 기기 밖으로 나가지 않습니다.`,
      private: '개인정보 보호',
      free: '평생 무료',
      openSource: '오픈 소스',
    },
  },
  es: {
    docTitle: (n) => `PDF Toolkit — ${n} herramientas PDF en tu navegador`,
    docDescription: (n) =>
      `${n} herramientas PDF: convertir, comprimir, unir, dividir, OCR y más. Todo se ejecuta en tu navegador. Sin subidas ni servidores, totalmente privado.`,
    tagline: (n) => `${n} herramientas · En el navegador · Privado`,
    goHome: 'Ir al inicio',
    toggleTheme: 'Cambiar tema',
    switchToLight: 'Cambiar a modo claro',
    switchToDark: 'Cambiar a modo oscuro',
    language: 'Idioma',
    githubRepo: 'Repositorio en GitHub',
    viewOnGithub: 'Ver en GitHub',
    landing: {
      badge: '100 % en el navegador · sin subidas ni registro',
      heading: 'Todo lo que necesitas hacer con un PDF',
      intro: (n) =>
        `${n} herramientas que funcionan por completo en tu navegador. Suelta un archivo, elige una herramienta y obtén el resultado: tu archivo nunca sale de tu dispositivo.`,
      private: 'Privado',
      free: 'Gratis para siempre',
      openSource: 'Código abierto',
    },
  },
})
