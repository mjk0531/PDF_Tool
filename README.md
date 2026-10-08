# PDF Toolkit

**17 PDF tools — convert, compress, merge, split, OCR, and more — running entirely in your browser.** No upload, no server, no signup. Files never leave your device.

Available in English, 한국어 (Korean) and Español (Spanish).

**Live: https://mjk0531.github.io/PDF_Tool/**

## Tools

### Convert
- **PDF to Image** — render pages as PNG / JPEG / WebP at any DPI
- **Image to PDF** — combine JPG/PNG into a single PDF (A4 / Letter / image-size)
- **PDF to Markdown** — heading hierarchy inferred from font size
- **PDF to Word** *(beta)* — generate .docx with paragraphs and headings
- **PDF to Excel** *(beta)* — heuristic table detection, one sheet per page
- **PDF to PowerPoint** *(beta)* — each PDF page becomes a slide image

### Organize
- **Edit PDF** *(beta)* — add text, images, whiteout; edit existing text
- **Compress PDF** — re-rasterize with adjustable DPI, quality, color/grayscale
- **Merge PDFs** — combine multiple files in custom order
- **Split PDF** — every N pages, or by custom ranges (`1-3; 5; 7-10`)
- **Rotate Pages** — 90° / 180° / 270°, all pages or selection
- **Reorder & Delete** — drag-style reorder with thumbnails
- **Edit Metadata** — title, author, subject, keywords, creator, producer

### Extract
- **Extract Text** — single .txt or per-page files
- **Extract Images** — pull every embedded raster as PNG, batch ZIP

### Secure
- **Password** — strip encryption from PDFs

### OCR
- **OCR** *(beta)* — scanned-PDF text recognition (Tesseract.js, 12 languages)

## Languages

The UI language is chosen on first visit, without any network lookup:

1. `?lang=en|ko|es` in the URL
2. The language previously picked in the title-bar menu (saved in `localStorage`)
3. The browser language, if it is Korean or Spanish
4. The device time zone — Korea → Korean, a Spanish-speaking country → Spanish
5. Otherwise English

Translations live in `src/i18n/messages/`. Each file declares `en`, `ko` and `es` side by side; TypeScript fails the build if a language is missing a key.

## Tech

Vite + React + TypeScript · Tailwind CSS · pdf.js · pdf-lib · docx · SheetJS · pptxgenjs · tesseract.js · JSZip · lucide-react

## Privacy

Every operation runs in the browser. No file is ever uploaded. Inspect the network tab — you'll see only the static app assets.

## Local development

```bash
npm install
npm run dev
```

## Deploy

The workflow at `.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`.

To enable: in repo Settings → Pages → Source, choose **GitHub Actions**.

## License

MIT
