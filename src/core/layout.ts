export type ViewportBreakpoint = 'desktop' | 'compact' | 'drawer';

export const RIGHT_TAB_IDS = [
  'map',
  'canvas',
  'light',
  'material',
  'section',
  'export',
] as const;

export type RightTabId = (typeof RIGHT_TAB_IDS)[number];

export interface UiLayoutPreference {
  leftPanelSize?: number;
  rightPanelSize?: number;
  panelsHidden?: boolean;
  splitRatio?: number;
  rightTab?: RightTabId;
}

export interface PanelBounds {
  leftDefault: number;
  leftMin: number;
  leftMax: number;
  rightDefault: number;
  rightMin: number;
  rightMax: number;
  viewportMin: number;
}

export const DESKTOP_BREAKPOINT_PX = 1280;
export const COMPACT_BREAKPOINT_PX = 1024;

export const DESKTOP_PANEL_BOUNDS: PanelBounds = {
  leftDefault: 264,
  leftMin: 200,
  leftMax: 380,
  rightDefault: 320,
  rightMin: 240,
  rightMax: 460,
  viewportMin: 320,
};

export const COMPACT_PANEL_BOUNDS: PanelBounds = {
  leftDefault: 224,
  leftMin: 188,
  leftMax: 300,
  rightDefault: 268,
  rightMin: 220,
  rightMax: 340,
  viewportMin: 320,
};

export function getViewportBreakpoint(viewportWidth: number): ViewportBreakpoint {
  if (!Number.isFinite(viewportWidth) || viewportWidth >= DESKTOP_BREAKPOINT_PX) {
    return 'desktop';
  }
  if (viewportWidth >= COMPACT_BREAKPOINT_PX) {
    return 'compact';
  }
  return 'drawer';
}

export function getPanelBounds(breakpoint: ViewportBreakpoint): PanelBounds {
  return breakpoint === 'compact' ? COMPACT_PANEL_BOUNDS : DESKTOP_PANEL_BOUNDS;
}

function clampFiniteInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.round(Math.max(min, Math.min(max, value)));
}

export function clampPanelSizesForBreakpoint(
  sizes: { leftPanelSize?: number; rightPanelSize?: number },
  breakpoint: ViewportBreakpoint,
): { leftPanelSize: number; rightPanelSize: number } {
  const bounds = getPanelBounds(breakpoint);
  return {
    leftPanelSize: clampFiniteInt(
      sizes.leftPanelSize,
      bounds.leftDefault,
      bounds.leftMin,
      bounds.leftMax,
    ),
    rightPanelSize: clampFiniteInt(
      sizes.rightPanelSize,
      bounds.rightDefault,
      bounds.rightMin,
      bounds.rightMax,
    ),
  };
}

export function isRightTabId(value: unknown): value is RightTabId {
  return typeof value === 'string' && (RIGHT_TAB_IDS as readonly string[]).includes(value);
}
