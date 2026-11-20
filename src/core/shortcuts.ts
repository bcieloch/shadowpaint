export type ShortcutCategoryId =
  | 'tools'
  | 'brush'
  | 'mapsAndSelection'
  | 'view'
  | 'files'
  | 'history';

export type ShortcutItemId =
  | 'toolBrush'
  | 'toolEraser'
  | 'toolSmooth'
  | 'toolBlur'
  | 'toolGradient'
  | 'toolFill'
  | 'toolEyedropper'
  | 'toolPan'
  | 'toolSelectRect'
  | 'toolSelectEllipse'
  | 'toolSelectLasso'
  | 'toolMagicWand'
  | 'toolMaskBrush'
  | 'toolRuler'
  | 'toolCrossSection'
  | 'toolPanHold'
  | 'brushSize'
  | 'brushHardness'
  | 'brushFlowHigh'
  | 'brushFlowLow'
  | 'activeMap'
  | 'selectAll'
  | 'clearSelection'
  | 'invertSelection'
  | 'layout2d'
  | 'layout3d'
  | 'layoutSplit'
  | 'viewModes'
  | 'zoomFit'
  | 'zoom100'
  | 'zoomStep'
  | 'reset3d'
  | 'toggleRulers'
  | 'toggleGrid'
  | 'togglePanels'
  | 'openShortcuts'
  | 'cancelOperation'
  | 'fileNew'
  | 'fileOpen'
  | 'fileImport'
  | 'fileSave'
  | 'fileSaveAs'
  | 'fileExport'
  | 'historyUndo'
  | 'historyRedo'
  | 'historyUndoMap';

export interface ShortcutItemDef {
  id: ShortcutItemId;
  keys: readonly string[];
  altKeys?: readonly string[];
}

export interface ShortcutGroupDef {
  id: ShortcutCategoryId;
  items: readonly ShortcutItemDef[];
}

export const SHORTCUT_GROUPS: readonly ShortcutGroupDef[] = [
  {
    id: 'tools',
    items: [
      { id: 'toolBrush', keys: ['B'] },
      { id: 'toolEraser', keys: ['E'] },
      { id: 'toolSmooth', keys: ['S'] },
      { id: 'toolBlur', keys: ['R'] },
      { id: 'toolGradient', keys: ['G'] },
      { id: 'toolFill', keys: ['F'] },
      { id: 'toolEyedropper', keys: ['I'] },
      { id: 'toolPan', keys: ['H'] },
      { id: 'toolSelectRect', keys: ['M'] },
      { id: 'toolSelectEllipse', keys: ['Shift', 'M'] },
      { id: 'toolSelectLasso', keys: ['L'] },
      { id: 'toolMagicWand', keys: ['W'] },
      { id: 'toolMaskBrush', keys: ['Q'] },
      { id: 'toolRuler', keys: ['U'] },
      { id: 'toolCrossSection', keys: ['X'] },
      { id: 'toolPanHold', keys: ['Space'] },
    ],
  },
  {
    id: 'brush',
    items: [
      { id: 'brushSize', keys: ['['], altKeys: [']'] },
      { id: 'brushHardness', keys: ['Shift', '['], altKeys: ['Shift', ']'] },
      { id: 'brushFlowHigh', keys: ['4–9'], altKeys: ['0'] },
      { id: 'brushFlowLow', keys: ['Alt', '1–3'] },
    ],
  },
  {
    id: 'mapsAndSelection',
    items: [
      { id: 'activeMap', keys: ['1'], altKeys: ['2 / 3'] },
      { id: 'selectAll', keys: ['Ctrl', 'A'] },
      { id: 'clearSelection', keys: ['Ctrl', 'D'] },
      { id: 'invertSelection', keys: ['Ctrl', 'Shift', 'I'] },
    ],
  },
  {
    id: 'history',
    items: [
      { id: 'historyUndo', keys: ['Ctrl', 'Z'] },
      { id: 'historyRedo', keys: ['Ctrl', 'Shift', 'Z'], altKeys: ['Ctrl', 'Y'] },
      { id: 'historyUndoMap', keys: ['Ctrl', 'Alt', 'Z'] },
    ],
  },
  {
    id: 'files',
    items: [
      { id: 'fileNew', keys: ['Ctrl', 'Alt', 'N'] },
      { id: 'fileOpen', keys: ['Ctrl', 'O'] },
      { id: 'fileImport', keys: ['Ctrl', 'I'] },
      { id: 'fileSave', keys: ['Ctrl', 'S'] },
      { id: 'fileSaveAs', keys: ['Ctrl', 'Shift', 'S'] },
      { id: 'fileExport', keys: ['Ctrl', 'E'] },
    ],
  },
  {
    id: 'view',
    items: [
      { id: 'layout2d', keys: ['F1'] },
      { id: 'layout3d', keys: ['F2'] },
      { id: 'layoutSplit', keys: ['F3'] },
      { id: 'viewModes', keys: ['Shift', '1–7'] },
      { id: 'zoomFit', keys: ['Ctrl', '0'] },
      { id: 'zoom100', keys: ['Ctrl', '1'] },
      { id: 'zoomStep', keys: ['+'], altKeys: ['-'] },
      { id: 'reset3d', keys: ['Home'] },
      { id: 'toggleRulers', keys: ['Ctrl', 'R'] },
      { id: 'toggleGrid', keys: ['Ctrl', "'"] },
      { id: 'togglePanels', keys: ['Tab'] },
      { id: 'openShortcuts', keys: ['?'] },
      { id: 'cancelOperation', keys: ['Esc'] },
    ],
  },
];

export function isMacPlatform(platform?: string): boolean {
  const value =
    platform ??
    (typeof navigator !== 'undefined' ? navigator.platform : '');
  return /Mac|iPhone|iPad|iPod/i.test(value);
}

export function formatShortcutToken(token: string, isMac: boolean): string {
  if (!isMac) return token;
  if (token === 'Ctrl') return 'Cmd';
  if (token === 'Alt') return 'Opt';
  return token;
}

export function formatShortcutKeys(keys: readonly string[], isMac: boolean): string[] {
  return keys.map((token) => formatShortcutToken(token, isMac));
}

export function isEditableTargetElement(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as { tagName?: unknown; isContentEditable?: unknown };
  if (el.isContentEditable === true) return true;
  if (typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function adjustBrushSizeValue(
  sizeValue: number,
  sizeUnit: 'px' | 'cm',
  pxPerCm: number,
  scale: number,
): number {
  if (sizeUnit === 'px') {
    return Math.max(
      1,
      Math.min(
        2000,
        scale > 1
          ? Math.max(sizeValue + 1, Math.round(sizeValue * scale))
          : Math.min(sizeValue - 1, Math.round(sizeValue * scale)),
      ),
    );
  }
  const safePxPerCm = Math.max(0.001, pxPerCm);
  const minCm = Math.max(0.05, Number((1 / safePxPerCm).toFixed(2)));
  const maxCm = Math.max(0.5, Number((2000 / safePxPerCm).toFixed(2)));
  return Math.max(minCm, Math.min(maxCm, Number((sizeValue * scale).toFixed(2))));
}

export function adjustBrushHardnessValue(hardness: number, delta: number): number {
  const next = Math.round((hardness + delta) * 100) / 100;
  return Math.max(0, Math.min(1, next));
}

export function parseBrushFlowShortcut(digit: number, altKey: boolean): number | null {
  if (!Number.isInteger(digit)) return null;
  if (!altKey) {
    if (digit === 0) return 1;
    if (digit >= 4 && digit <= 9) return Number((digit * 0.1).toFixed(2));
    return null;
  }
  if (digit >= 1 && digit <= 3) {
    return Number((digit * 0.1).toFixed(2));
  }
  return null;
}
