import { describe, expect, it } from 'vitest';
import {
  adjustBrushHardnessValue,
  adjustBrushSizeValue,
  eventToShortcutTokens,
  findConflictingShortcutId,
  formatShortcutDisplay,
  formatShortcutKeys,
  getEffectiveShortcutKeys,
  isEditableTargetElement,
  isMacPlatform,
  isShortcutCustomized,
  matchesShortcutItem,
  parseBrushFlowShortcut,
  sanitizeCustomShortcutBindings,
  SHORTCUT_GROUPS,
} from '@/core/shortcuts';

describe('core/shortcuts', () => {
  it('defines unique shortcut items across all 6 categories', () => {
    expect(SHORTCUT_GROUPS).toHaveLength(6);
    const ids = new Set<string>();
    for (const group of SHORTCUT_GROUPS) {
      expect(group.items.length).toBeGreaterThan(0);
      for (const item of group.items) {
        expect(item.keys.length).toBeGreaterThan(0);
        expect(ids.has(item.id)).toBe(false);
        ids.add(item.id);
      }
    }
    expect(ids.has('fileNew')).toBe(true);
    expect(ids.has('fileImport')).toBe(true);
    expect(ids.has('openShortcuts')).toBe(true);
    expect(ids.has('openGuide')).toBe(true);
    expect(ids.has('togglePanels')).toBe(true);
  });

  it('formats Ctrl/Alt modifiers for macOS and non-macOS platforms', () => {
    expect(isMacPlatform('MacIntel')).toBe(true);
    expect(isMacPlatform('Linux x86_64')).toBe(false);
    expect(formatShortcutKeys(['Ctrl', 'Alt', 'N'], true)).toEqual(['Cmd', 'Opt', 'N']);
    expect(formatShortcutKeys(['Ctrl', 'Shift', 'S'], false)).toEqual(['Ctrl', 'Shift', 'S']);
    expect(formatShortcutDisplay('fileSave', undefined, true)).toBe('Cmd+S');
  });

  it('normalizes keyboard events, detects conflicts, and matches custom shortcut bindings', () => {
    expect(
      eventToShortcutTokens({
        key: 'K',
        code: 'KeyK',
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: true,
      }),
    ).toEqual(['Shift', 'K']);

    expect(
      eventToShortcutTokens({
        key: '?',
        code: 'Slash',
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: true,
      }),
    ).toEqual(['?']);

    expect(
      eventToShortcutTokens({
        key: 'Escape',
        code: 'Escape',
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      }),
    ).toBeNull();

    const bindings = sanitizeCustomShortcutBindings({
      toolBrush: ['K'],
      toolEraser: ['E'], // matches default -> stripped
      invalidId: ['Z'],
    });
    expect(bindings).toEqual({ toolBrush: ['K'] });
    expect(isShortcutCustomized('toolBrush', bindings)).toBe(true);
    expect(isShortcutCustomized('toolEraser', bindings)).toBe(false);
    expect(getEffectiveShortcutKeys('toolBrush', bindings)).toEqual(['K']);

    expect(findConflictingShortcutId('toolEraser', ['K'], bindings)).toBe('toolBrush');
    expect(findConflictingShortcutId('toolEraser', ['F'], bindings)).toBe('toolFill');

    expect(
      matchesShortcutItem(
        {
          key: 'k',
          code: 'KeyK',
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          shiftKey: false,
        },
        'toolBrush',
        bindings,
      ),
    ).toBe(true);
  });

  it('detects editable targets properly', () => {
    expect(isEditableTargetElement({ tagName: 'INPUT' })).toBe(true);
    expect(isEditableTargetElement({ tagName: 'textarea' })).toBe(true);
    expect(isEditableTargetElement({ tagName: 'SELECT' })).toBe(true);
    expect(isEditableTargetElement({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isEditableTargetElement({ tagName: 'DIV', isContentEditable: false })).toBe(false);
    expect(isEditableTargetElement(null)).toBe(false);
  });

  it('adjusts brush size and hardness within valid bounds', () => {
    expect(adjustBrushSizeValue(40, 'px', 60, 1.18)).toBe(47);
    expect(adjustBrushSizeValue(1, 'px', 60, 1 / 1.18)).toBe(1);
    expect(adjustBrushSizeValue(2000, 'px', 60, 1.18)).toBe(2000);
    expect(adjustBrushSizeValue(1, 'cm', 60, 1.5)).toBe(1.5);

    expect(adjustBrushHardnessValue(0.75, 0.05)).toBe(0.8);
    expect(adjustBrushHardnessValue(0.75, -0.05)).toBe(0.7);
    expect(adjustBrushHardnessValue(0.98, 0.05)).toBe(1);
    expect(adjustBrushHardnessValue(0.02, -0.05)).toBe(0);
  });

  it('maps brush flow digits while leaving 1-3 reserved for map selection without Alt', () => {
    expect(parseBrushFlowShortcut(0, false)).toBe(1);
    expect(parseBrushFlowShortcut(5, false)).toBe(0.5);
    expect(parseBrushFlowShortcut(9, false)).toBe(0.9);
    expect(parseBrushFlowShortcut(1, false)).toBeNull();
    expect(parseBrushFlowShortcut(2, false)).toBeNull();
    expect(parseBrushFlowShortcut(3, false)).toBeNull();
    expect(parseBrushFlowShortcut(1, true)).toBe(0.1);
    expect(parseBrushFlowShortcut(2, true)).toBe(0.2);
    expect(parseBrushFlowShortcut(3, true)).toBe(0.3);
  });
});
