export const SPLIT_RATIO_MIN = 0.2;
export const SPLIT_RATIO_MAX = 0.8;
export const SPLIT_DEFAULT_RATIO = 0.5;
export const SPLIT_MIN_PANE_PX = 160;

export interface PaneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SplitPanes {
  totalWidth: number;
  totalHeight: number;
  splitRatio: number;
  dividerX: number;
  leftPane: PaneRect;
  rightPane: PaneRect;
}

export function clampSplitRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return SPLIT_DEFAULT_RATIO;
  return Math.min(SPLIT_RATIO_MAX, Math.max(SPLIT_RATIO_MIN, ratio));
}

export function computeSplitPanes(
  totalWidth: number,
  totalHeight: number,
  splitRatio: number,
): SplitPanes {
  const safeW = Math.max(2, Math.round(Number.isFinite(totalWidth) ? totalWidth : 2));
  const safeH = Math.max(1, Math.round(Number.isFinite(totalHeight) ? totalHeight : 1));
  const clampedRatio = clampSplitRatio(splitRatio);

  const minPane = Math.min(SPLIT_MIN_PANE_PX, Math.floor(safeW / 2));
  const rawDivider = Math.round(safeW * clampedRatio);
  const dividerX = Math.max(minPane, Math.min(safeW - minPane, rawDivider));
  const rightWidth = Math.max(1, safeW - dividerX);

  return {
    totalWidth: safeW,
    totalHeight: safeH,
    splitRatio: dividerX / safeW,
    dividerX,
    leftPane: {
      x: 0,
      y: 0,
      width: dividerX,
      height: safeH,
    },
    rightPane: {
      x: dividerX,
      y: 0,
      width: rightWidth,
      height: safeH,
    },
  };
}

export function isPointInPane(x: number, y: number, pane: PaneRect): boolean {
  return x >= pane.x && x < pane.x + pane.width && y >= pane.y && y < pane.y + pane.height;
}
