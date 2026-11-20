export function formatMm(mm: number, decimals = 3): string {
  return `${mm.toFixed(decimals)} mm`;
}

export function formatCm(cm: number, decimals = 2): string {
  return `${cm.toFixed(decimals)} cm`;
}

export function formatPx(px: number): string {
  return `${Math.round(px)} px`;
}

export function formatPercent(pct: number, decimals = 1): string {
  return `${pct.toFixed(decimals)}%`;
}

export function formatDpi(dpi: number): string {
  return `${dpi.toFixed(1)} DPI`;
}

export function formatHexRgb(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
