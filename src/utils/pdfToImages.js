import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export async function pdfToImages(file) {
  const arrayBuffer = await file.arrayBuffer();
  console.log(`[PDF] Loading PDF (${(arrayBuffer.byteLength / 1024).toFixed(1)} KB)...`);
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  console.log(`[PDF] PDF loaded: ${pdf.numPages} page(s)`);
  const images = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;
    const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
    images.push(base64);
    console.log(`[PDF] Page ${i}/${pdf.numPages} rendered (${viewport.width}x${viewport.height}, ${(base64.length / 1024).toFixed(1)} KB)`);
  }

  return images;
}
