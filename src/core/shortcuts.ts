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
  | 'brushSizeIncrease'
  | 'brushHardness'
  | 'brushHardnessIncrease'
  | 'brushFlowHigh'
  | 'brushFlowLow'
  | 'activeMap'
  | 'activeMapHeight'
  | 'activeMapOpacity'
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
  | 'zoomOut'
  | 'reset3d'
  | 'toggleRulers'
  | 'toggleGrid'
  | 'togglePanels'
  | 'openShortcuts'
  | 'openGuide'
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

export type CustomShortcutBindings = Partial<Record<ShortcutItemId, readonly string[]>>;

export interface ShortcutItemDef {
  id: ShortcutItemId;
  keys: readonly string[];
  altKeys?: readonly string[];
  customizable: boolean;
}

export interface ShortcutGroupDef {
  id: ShortcutCategoryId;
  items: readonly ShortcutItemDef[];
}

export const SHORTCUT_GROUPS: readonly ShortcutGroupDef[] = [
  {
    id: 'tools',
    items: [
      { id: 'toolBrush', keys: ['B'], customizable: true },
      { id: 'toolEraser', keys: ['E'], customizable: true },
      { id: 'toolSmooth', keys: ['S'], customizable: true },
      { id: 'toolBlur', keys: ['R'], customizable: true },
      { id: 'toolGradient', keys: ['G'], customizable: true },
      { id: 'toolFill', keys: ['F'], customizable: true },
      { id: 'toolEyedropper', keys: ['I'], customizable: true },
      { id: 'toolPan', keys: ['H'], customizable: true },
      { id: 'toolSelectRect', keys: ['M'], customizable: true },
      { id: 'toolSelectEllipse', keys: ['Shift', 'M'], customizable: true },
      { id: 'toolSelectLasso', keys: ['L'], customizable: true },
      { id: 'toolMagicWand', keys: ['W'], customizable: true },
      { id: 'toolMaskBrush', keys: ['Q'], customizable: true },
      { id: 'toolRuler', keys: ['U'], customizable: true },
      { id: 'toolCrossSection', keys: ['X'], customizable: true },
      { id: 'toolPanHold', keys: ['Space'], customizable: false },
    ],
  },
  {
    id: 'brush',
    items: [
      { id: 'brushSize', keys: ['['], customizable: true },
      { id: 'brushSizeIncrease', keys: [']'], customizable: true },
      { id: 'brushHardness', keys: ['Shift', '['], customizable: true },
      { id: 'brushHardnessIncrease', keys: ['Shift', ']'], customizable: true },
      { id: 'brushFlowHigh', keys: ['4–9'], altKeys: ['0'], customizable: false },
      { id: 'brushFlowLow', keys: ['Alt', '1–3'], customizable: false },
    ],
  },
  {
    id: 'mapsAndSelection',
    items: [
      { id: 'activeMap', keys: ['1'], customizable: true },
      { id: 'activeMapHeight', keys: ['2'], customizable: true },
      { id: 'activeMapOpacity', keys: ['3'], customizable: true },
      { id: 'selectAll', keys: ['Ctrl', 'A'], customizable: true },
      { id: 'clearSelection', keys: ['Ctrl', 'D'], customizable: true },
      { id: 'invertSelection', keys: ['Ctrl', 'Shift', 'I'], customizable: true },
    ],
  },
  {
    id: 'history',
    items: [
      { id: 'historyUndo', keys: ['Ctrl', 'Z'], customizable: true },
      { id: 'historyRedo', keys: ['Ctrl', 'Shift', 'Z'], altKeys: ['Ctrl', 'Y'], customizable: true },
      { id: 'historyUndoMap', keys: ['Ctrl', 'Alt', 'Z'], customizable: true },
    ],
  },
  {
    id: 'files',
    items: [
      { id: 'fileNew', keys: ['Ctrl', 'Alt', 'N'], customizable: true },
      { id: 'fileOpen', keys: ['Ctrl', 'O'], customizable: true },
      { id: 'fileImport', keys: ['Ctrl', 'I'], customizable: true },
      { id: 'fileSave', keys: ['Ctrl', 'S'], customizable: true },
      { id: 'fileSaveAs', keys: ['Ctrl', 'Shift', 'S'], customizable: true },
      { id: 'fileExport', keys: ['Ctrl', 'E'], customizable: true },
    ],
  },
  {
    id: 'view',
    items: [
      { id: 'layout2d', keys: ['F1'], customizable: true },
      { id: 'layout3d', keys: ['F2'], customizable: true },
      { id: 'layoutSplit', keys: ['F3'], customizable: true },
      { id: 'viewModes', keys: ['Shift', '1–7'], customizable: false },
      { id: 'zoomFit', keys: ['Ctrl', '0'], customizable: true },
      { id: 'zoom100', keys: ['Ctrl', '1'], customizable: true },
      { id: 'zoomStep', keys: ['+'], customizable: true },
      { id: 'zoomOut', keys: ['-'], customizable: true },
      { id: 'reset3d', keys: ['Home'], customizable: true },
      { id: 'toggleRulers', keys: ['Ctrl', 'R'], customizable: true },
      { id: 'toggleGrid', keys: ['Ctrl', "'"], customizable: true },
      { id: 'togglePanels', keys: ['Tab'], customizable: true },
      { id: 'openShortcuts', keys: ['?'], customizable: true },
      { id: 'openGuide', keys: ['F4'], customizable: true },
      { id: 'cancelOperation', keys: ['Esc'], customizable: false },
    ],
  },
];

const SHORTCUT_ITEMS_BY_ID: ReadonlyMap<ShortcutItemId, ShortcutItemDef> = (() => {
  const map = new Map<ShortcutItemId, ShortcutItemDef>();
  for (const group of SHORTCUT_GROUPS) {
    for (const item of group.items) {
      map.set(item.id, item);
    }
  }
  return map;
})();

export function getShortcutItemDef(id: ShortcutItemId): ShortcutItemDef | undefined {
  return SHORTCUT_ITEMS_BY_ID.get(id);
}

export function isCustomizableShortcutId(id: string): id is ShortcutItemId {
  const def = SHORTCUT_ITEMS_BY_ID.get(id as ShortcutItemId);
  return Boolean(def?.customizable);
}

export function getDefaultShortcutKeys(id: ShortcutItemId): readonly string[] {
  return SHORTCUT_ITEMS_BY_ID.get(id)?.keys ?? [];
}

export function getEffectiveShortcutKeys(
  id: ShortcutItemId,
  customBindings?: CustomShortcutBindings,
): readonly string[] {
  const def = SHORTCUT_ITEMS_BY_ID.get(id);
  if (!def) return [];
  if (def.customizable && customBindings) {
    const custom = customBindings[id];
    if (Array.isArray(custom) && custom.length > 0) {
      return custom;
    }
  }
  return def.keys;
}

export function isShortcutCustomized(
  id: ShortcutItemId,
  customBindings?: CustomShortcutBindings,
): boolean {
  if (!customBindings) return false;
  const custom = customBindings[id];
  if (!Array.isArray(custom) || custom.length === 0) return false;
  const defKeys = getDefaultShortcutKeys(id);
  return serializeShortcutTokens(custom) !== serializeShortcutTokens(defKeys);
}

export function serializeShortcutTokens(tokens: readonly string[]): string {
  return tokens.map((t) => t.trim()).filter(Boolean).join('+');
}

export function sanitizeCustomShortcutBindings(raw: unknown): CustomShortcutBindings {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  const out: CustomShortcutBindings = {};
  for (const [key, val] of Object.entries(obj)) {
    if (!isCustomizableShortcutId(key)) continue;
    if (!Array.isArray(val) || val.length === 0 || val.length > 4) continue;
    const cleanTokens = val
      .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      .map((t) => t.trim());
    if (cleanTokens.length === 0) continue;
    const defKeys = getDefaultShortcutKeys(key);
    if (serializeShortcutTokens(cleanTokens) === serializeShortcutTokens(defKeys)) {
      continue;
    }
    out[key] = cleanTokens;
  }
  return out;
}

export function findConflictingShortcutId(
  targetId: ShortcutItemId,
  candidateTokens: readonly string[],
  customBindings?: CustomShortcutBindings,
): ShortcutItemId | null {
  const targetSig = serializeShortcutTokens(candidateTokens);
  if (!targetSig) return null;
  for (const [id, def] of SHORTCUT_ITEMS_BY_ID.entries()) {
    if (id === targetId || !def.customizable) continue;
    const effective = getEffectiveShortcutKeys(id, customBindings);
    if (serializeShortcutTokens(effective) === targetSig) {
      return id;
    }
  }
  return null;
}

export interface ShortcutKeyEventLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const MODIFIER_CODES = new Set([
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
  'OSLeft',
  'OSRight',
]);

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'OS', 'AltGraph']);

export function normalizeBaseKeyFromEvent(e: Pick<ShortcutKeyEventLike, 'key' | 'code'>): {
  baseToken: string;
  consumedShift: boolean;
} | null {
  if (MODIFIER_CODES.has(e.code) || MODIFIER_KEYS.has(e.key)) {
    return null;
  }
  if (/^Key([A-Z])$/.test(e.code)) {
    return { baseToken: e.code.slice(3).toUpperCase(), consumedShift: false };
  }
  if (/^(?:Digit|Numpad)([0-9])$/.test(e.code)) {
    if (e.key === '?' && e.code === 'Slash') {
      return { baseToken: '?', consumedShift: true };
    }
    const digit = e.code.replace(/^(?:Digit|Numpad)/, '');
    return { baseToken: digit, consumedShift: false };
  }
  if (/^F([1-9]|1[0-2])$/.test(e.key)) {
    return { baseToken: e.key.toUpperCase(), consumedShift: false };
  }
  if (e.code === 'Slash' && e.key === '?') {
    return { baseToken: '?', consumedShift: true };
  }
  if (e.code === 'Slash') {
    return { baseToken: '/', consumedShift: false };
  }
  if (e.code === 'BracketLeft' || e.key === '[' || e.key === '{') {
    return { baseToken: '[', consumedShift: false };
  }
  if (e.code === 'BracketRight' || e.key === ']' || e.key === '}') {
    return { baseToken: ']', consumedShift: false };
  }
  if (e.code === 'Quote' || e.key === "'" || e.key === '"') {
    return { baseToken: "'", consumedShift: false };
  }
  if (e.code === 'Equal' || e.code === 'NumpadAdd' || e.key === '+' || e.key === '=') {
    return { baseToken: '+', consumedShift: e.key === '+' };
  }
  if (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.key === '-' || e.key === '_') {
    return { baseToken: '-', consumedShift: false };
  }
  if (e.code === 'Backquote' || e.key === '`') {
    return { baseToken: '`', consumedShift: false };
  }
  if (e.code === 'Comma' || e.key === ',') {
    return { baseToken: ',', consumedShift: false };
  }
  if (e.code === 'Period' || e.key === '.') {
    return { baseToken: '.', consumedShift: false };
  }
  if (e.code === 'Semicolon' || e.key === ';') {
    return { baseToken: ';', consumedShift: false };
  }
  if (e.code === 'Backslash' || e.key === '\\') {
    return { baseToken: '\\', consumedShift: false };
  }
  if (e.key === 'Home') return { baseToken: 'Home', consumedShift: false };
  if (e.key === 'End') return { baseToken: 'End', consumedShift: false };
  if (e.key === 'PageUp') return { baseToken: 'PageUp', consumedShift: false };
  if (e.key === 'PageDown') return { baseToken: 'PageDown', consumedShift: false };
  if (e.key === 'Tab') return { baseToken: 'Tab', consumedShift: false };
  if (e.key === 'Backspace') return { baseToken: 'Backspace', consumedShift: false };
  if (e.key === 'Delete') return { baseToken: 'Delete', consumedShift: false };
  if (e.key === 'Insert') return { baseToken: 'Insert', consumedShift: false };
  if (e.key === 'ArrowUp') return { baseToken: 'ArrowUp', consumedShift: false };
  if (e.key === 'ArrowDown') return { baseToken: 'ArrowDown', consumedShift: false };
  if (e.key === 'ArrowLeft') return { baseToken: 'ArrowLeft', consumedShift: false };
  if (e.key === 'ArrowRight') return { baseToken: 'ArrowRight', consumedShift: false };
  if (e.key.length === 1 && e.key !== ' ') {
    return { baseToken: e.key.toUpperCase(), consumedShift: false };
  }
  return null;
}

export function eventToShortcutTokens(e: ShortcutKeyEventLike): string[] | null {
  // Never allow binding Escape or Space directly
  if (e.key === 'Escape' || e.code === 'Escape' || e.code === 'Space' || e.key === ' ') {
    return null;
  }
  const base = normalizeBaseKeyFromEvent(e);
  if (!base) return null;

  const tokens: string[] = [];
  if (e.ctrlKey || e.metaKey) tokens.push('Ctrl');
  if (e.altKey) tokens.push('Alt');
  if (e.shiftKey && !base.consumedShift) tokens.push('Shift');
  tokens.push(base.baseToken);
  return tokens;
}

export function matchesShortcutTokens(
  e: ShortcutKeyEventLike,
  expectedTokens: readonly string[],
): boolean {
  if (expectedTokens.length === 0) return false;
  const actual = eventToShortcutTokens(e);
  if (!actual) return false;
  return serializeShortcutTokens(actual) === serializeShortcutTokens(expectedTokens);
}

export function matchesShortcutItem(
  e: ShortcutKeyEventLike,
  id: ShortcutItemId,
  customBindings?: CustomShortcutBindings,
): boolean {
  const effective = getEffectiveShortcutKeys(id, customBindings);
  if (matchesShortcutTokens(e, effective)) return true;

  // If not customized, also allow default altKeys (e.g., Ctrl+Y for historyRedo)
  if (!isShortcutCustomized(id, customBindings)) {
    const def = SHORTCUT_ITEMS_BY_ID.get(id);
    if (def?.altKeys && matchesShortcutTokens(e, def.altKeys)) {
      return true;
    }
  }
  return false;
}

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

export function formatShortcutDisplay(
  id: ShortcutItemId,
  customBindings?: CustomShortcutBindings,
  isMac = false,
): string {
  const tokens = formatShortcutKeys(getEffectiveShortcutKeys(id, customBindings), isMac);
  return tokens.join('+');
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
