import { describe, expect, it } from 'vitest';
import { createTranslator, getDictionary, SUPPORTED_LOCALES, translate } from '@/i18n';

function flattenLeaves(obj: unknown, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  if (typeof obj !== 'object' || obj === null) return result;
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') {
      result[path] = v;
    } else {
      Object.assign(result, flattenLeaves(v, path));
    }
  }
  return result;
}

function extractPlaceholders(value: string): string[] {
  const matches = value.match(/\{([a-zA-Z0-9_]+)\}/g) ?? [];
  return [...new Set(matches)].sort();
}

describe('i18n dictionaries', () => {
  it('en and pl have identical keys, non-empty values, and matching placeholders', () => {
    const enLeaves = flattenLeaves(getDictionary('en'));
    const enKeys = Object.keys(enLeaves).sort();
    expect(enKeys.length).toBeGreaterThan(0);

    for (const locale of SUPPORTED_LOCALES) {
      const leaves = flattenLeaves(getDictionary(locale));
      expect(Object.keys(leaves).sort()).toEqual(enKeys);

      for (const key of enKeys) {
        const val = leaves[key];
        expect(val, `${locale}.${key} should be non-empty`).toBeTruthy();
        expect(val?.trim().length, `${locale}.${key} should not be whitespace`).toBeGreaterThan(0);
        expect(
          extractPlaceholders(val ?? ''),
          `Placeholder mismatch at ${locale}.${key}`,
        ).toEqual(extractPlaceholders(enLeaves[key] ?? ''));
      }
    }
  });

  it('translates and interpolates cleanly', () => {
    const tEn = createTranslator('en');
    const tPl = createTranslator('pl');
    expect(tEn('app.name')).toBe('ShadowPaint');
    expect(tPl('language.label')).toBe('Język');
    expect(translate('en', 'common.cancel')).toBe('Cancel');
    expect(translate('pl', 'common.cancel')).toBe('Anuluj');
  });
});
