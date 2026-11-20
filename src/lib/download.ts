export function sanitizeExportSlug(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'untitled';
}

export function formatExportTimestamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${y}${m}${d}-${hh}${mm}`;
}

export function buildExportZipFilename(projectName: string, date = new Date()): string {
  return `shadowpaint_${sanitizeExportSlug(projectName)}_${formatExportTimestamp(date)}.zip`;
}

export function triggerDownload(
  data: Uint8Array | string,
  mimeType: string,
  fileName: string,
): void {
  const blobPart: BlobPart =
    typeof data === 'string'
      ? data
      : new Uint8Array(
          data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
        );
  const blob = new Blob([blobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
