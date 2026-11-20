import regularFontUrl from '@/assets/fonts/DejaVuSans.ttf?url';
import boldFontUrl from '@/assets/fonts/DejaVuSans-Bold.ttf?url';

export interface PdfFontData {
  regularBase64: string;
  boldBase64: string;
}

let cachedFontsPromise: Promise<PdfFontData> | null = null;

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    chunks.push(String.fromCharCode(...slice));
  }
  return btoa(chunks.join(''));
}

async function fetchFontBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch PDF font (${response.status})`);
  }
  const buffer = await response.arrayBuffer();
  return arrayBufferToBase64(buffer);
}

export function loadPdfFontData(): Promise<PdfFontData> {
  if (!cachedFontsPromise) {
    cachedFontsPromise = Promise.all([
      fetchFontBase64(regularFontUrl),
      fetchFontBase64(boldFontUrl),
    ])
      .then(([regularBase64, boldBase64]) => ({ regularBase64, boldBase64 }))
      .catch((err) => {
        cachedFontsPromise = null;
        throw err;
      });
  }
  return cachedFontsPromise;
}
