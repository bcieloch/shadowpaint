export interface GridDivision {
  index: number;
  label: string;
  startCm: number;
  endCm: number;
}

export interface PdfTileSpec {
  id: string;
  col: number;
  row: number;
  x0Mm: number;
  y0Mm: number;
  tileWmm: number;
  tileHmm: number;
  srcX: number;
  srcY: number;
  srcW: number;
  srcH: number;
  overlapLeftMm: number;
  overlapRightMm: number;
  overlapTopMm: number;
  overlapBottomMm: number;
}

export interface ComputeTilesParams {
  widthCm: number;
  heightCm: number;
  widthPx: number;
  heightPx: number;
  slotWmm: number;
  slotHmm: number;
  overlapMm?: number;
}

export function columnIndexToLetters(col: number): string {
  let n = Math.max(0, Math.floor(col));
  let result = '';
  while (true) {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
    if (n < 0) break;
  }
  return result;
}

export function formatTileId(col: number, row: number): string {
  return `${columnIndexToLetters(col)}${Math.max(1, Math.floor(row) + 1)}`;
}

export function computeGridDivisions(
  totalCm: number,
  spacingCm: number,
  axis: 'col' | 'row',
): GridDivision[] {
  const safeTotal = Math.max(0.1, totalCm);
  const safeSpacing = Math.max(0.5, spacingCm);
  const count = Math.max(1, Math.ceil((safeTotal - 1e-6) / safeSpacing));
  const divisions: GridDivision[] = [];

  for (let i = 0; i < count; i++) {
    const startCm = i * safeSpacing;
    const endCm = Math.min(safeTotal, (i + 1) * safeSpacing);
    divisions.push({
      index: i,
      label: axis === 'col' ? columnIndexToLetters(i) : String(i + 1),
      startCm,
      endCm,
    });
  }

  return divisions;
}

export function computeTiles1to1Layout(params: ComputeTilesParams): PdfTileSpec[] {
  const widthMm = Math.max(1, params.widthCm * 10);
  const heightMm = Math.max(1, params.heightCm * 10);
  const widthPx = Math.max(1, Math.round(params.widthPx));
  const heightPx = Math.max(1, Math.round(params.heightPx));
  const overlapMm = Math.max(0, Math.min(params.overlapMm ?? 10, params.slotWmm * 0.25, params.slotHmm * 0.25));

  const slotWmm = Math.max(20, params.slotWmm);
  const slotHmm = Math.max(20, params.slotHmm);
  const stepXmm = Math.max(10, slotWmm - overlapMm);
  const stepYmm = Math.max(10, slotHmm - overlapMm);

  const xStarts: number[] = [0];
  while ((xStarts[xStarts.length - 1] ?? 0) + slotWmm < widthMm - 0.01) {
    xStarts.push((xStarts[xStarts.length - 1] ?? 0) + stepXmm);
  }

  const yStarts: number[] = [0];
  while ((yStarts[yStarts.length - 1] ?? 0) + slotHmm < heightMm - 0.01) {
    yStarts.push((yStarts[yStarts.length - 1] ?? 0) + stepYmm);
  }

  const tiles: PdfTileSpec[] = [];
  for (let row = 0; row < yStarts.length; row++) {
    const y0Mm = yStarts[row] ?? 0;
    const y1Mm = Math.min(heightMm, y0Mm + slotHmm);
    const tileHmm = Math.max(0.1, y1Mm - y0Mm);

    const srcY = Math.max(0, Math.min(heightPx - 1, Math.floor((y0Mm / heightMm) * heightPx)));
    const srcY1 = Math.max(srcY + 1, Math.min(heightPx, Math.ceil((y1Mm / heightMm) * heightPx)));

    for (let col = 0; col < xStarts.length; col++) {
      const x0Mm = xStarts[col] ?? 0;
      const x1Mm = Math.min(widthMm, x0Mm + slotWmm);
      const tileWmm = Math.max(0.1, x1Mm - x0Mm);

      const srcX = Math.max(0, Math.min(widthPx - 1, Math.floor((x0Mm / widthMm) * widthPx)));
      const srcX1 = Math.max(srcX + 1, Math.min(widthPx, Math.ceil((x1Mm / widthMm) * widthPx)));

      tiles.push({
        id: formatTileId(col, row),
        col,
        row,
        x0Mm,
        y0Mm,
        tileWmm,
        tileHmm,
        srcX,
        srcY,
        srcW: srcX1 - srcX,
        srcH: srcY1 - srcY,
        overlapLeftMm: col > 0 ? Math.min(overlapMm, tileWmm) : 0,
        overlapRightMm: x1Mm < widthMm - 0.01 ? Math.min(overlapMm, tileWmm) : 0,
        overlapTopMm: row > 0 ? Math.min(overlapMm, tileHmm) : 0,
        overlapBottomMm: y1Mm < heightMm - 0.01 ? Math.min(overlapMm, tileHmm) : 0,
      });
    }
  }

  return tiles;
}
