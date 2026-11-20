import { describe, expect, it } from 'vitest';
import {
  clampPanelSizesForBreakpoint,
  COMPACT_PANEL_BOUNDS,
  DESKTOP_PANEL_BOUNDS,
  getPanelBounds,
  getViewportBreakpoint,
  isRightTabId,
} from '@/core/layout';

describe('core/layout', () => {
  it('detects responsive viewport breakpoints at 1024 and 1280 px thresholds', () => {
    expect(getViewportBreakpoint(1440)).toBe('desktop');
    expect(getViewportBreakpoint(1280)).toBe('desktop');
    expect(getViewportBreakpoint(1279)).toBe('compact');
    expect(getViewportBreakpoint(1024)).toBe('compact');
    expect(getViewportBreakpoint(1023)).toBe('drawer');
    expect(getViewportBreakpoint(768)).toBe('drawer');
  });

  it('guarantees compact panel bounds never starve the 320 px minimum viewport at 1024 px', () => {
    const compact = getPanelBounds('compact');
    expect(compact.leftMax + compact.viewportMin + compact.rightMax).toBeLessThanOrEqual(1024);
    const desktop = getPanelBounds('desktop');
    expect(desktop.leftMax + desktop.viewportMin + desktop.rightMax).toBeLessThanOrEqual(1280);
  });

  it('clamps panel sizes cleanly per breakpoint with sensible defaults', () => {
    expect(clampPanelSizesForBreakpoint({}, 'desktop')).toEqual({
      leftPanelSize: DESKTOP_PANEL_BOUNDS.leftDefault,
      rightPanelSize: DESKTOP_PANEL_BOUNDS.rightDefault,
    });
    expect(clampPanelSizesForBreakpoint({}, 'compact')).toEqual({
      leftPanelSize: COMPACT_PANEL_BOUNDS.leftDefault,
      rightPanelSize: COMPACT_PANEL_BOUNDS.rightDefault,
    });
    expect(
      clampPanelSizesForBreakpoint({ leftPanelSize: 120, rightPanelSize: 900 }, 'desktop'),
    ).toEqual({
      leftPanelSize: DESKTOP_PANEL_BOUNDS.leftMin,
      rightPanelSize: DESKTOP_PANEL_BOUNDS.rightMax,
    });
    expect(
      clampPanelSizesForBreakpoint({ leftPanelSize: 360.4, rightPanelSize: 420.6 }, 'compact'),
    ).toEqual({
      leftPanelSize: COMPACT_PANEL_BOUNDS.leftMax,
      rightPanelSize: COMPACT_PANEL_BOUNDS.rightMax,
    });
  });

  it('validates right panel tab IDs', () => {
    expect(isRightTabId('map')).toBe(true);
    expect(isRightTabId('canvas')).toBe(true);
    expect(isRightTabId('export')).toBe(true);
    expect(isRightTabId('invalid')).toBe(false);
    expect(isRightTabId(42)).toBe(false);
  });
});
