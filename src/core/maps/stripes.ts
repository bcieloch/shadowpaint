export interface RowStripe {
  index: number;
  yStart: number;
  yEnd: number;
  rows: number;
}

/**
 * Splits `[0, height)` into contiguous non-overlapping horizontal row stripes
 * so worker pool tasks can process disjoint output rows in parallel and merge cleanly.
 */
export function splitRowStripes(
  height: number,
  workerCount: number,
  minRowsPerStripe = 64,
): RowStripe[] {
  const h = Math.max(0, Math.floor(height));
  if (h === 0) return [];

  const minRows = Math.max(1, Math.floor(minRowsPerStripe));
  const maxUsefulWorkers = Math.max(1, Math.ceil(h / minRows));
  const count = Math.max(1, Math.min(Math.floor(workerCount), maxUsefulWorkers));
  if (count <= 1) {
    return [{ index: 0, yStart: 0, yEnd: h, rows: h }];
  }

  const stripes: RowStripe[] = [];
  const baseRows = Math.floor(h / count);
  const remainder = h % count;
  let y = 0;

  for (let i = 0; i < count; i++) {
    const rows = baseRows + (i < remainder ? 1 : 0);
    if (rows <= 0) continue;
    stripes.push({
      index: stripes.length,
      yStart: y,
      yEnd: y + rows,
      rows,
    });
    y += rows;
  }

  return stripes;
}
