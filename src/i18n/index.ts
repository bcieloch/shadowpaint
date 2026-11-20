import { en } from '@/i18n/locales/en';
import { pl } from '@/i18n/locales/pl';

export type Locale = 'en' | 'pl';

export const DEFAULT_LOCALE: Locale = 'en';
export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'pl'];

export type DeepStringRecord<T> = {
  readonly [K in keyof T]: T[K] extends string ? string : DeepStringRecord<T[K]>;
};

export type TranslationDictionary = DeepStringRecord<typeof en>;

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;

type NestedKeyOf<T> = {
  [K in keyof T & string]: T[K] extends string ? K : Join<K, NestedKeyOf<T[K]>>;
}[keyof T & string];

export type TranslationKey = NestedKeyOf<typeof en>;

export type TranslationParams = Record<string, string | number>;

export type Translator = (key: TranslationKey, params?: TranslationParams) => string;

const DICTIONARIES: Record<Locale, TranslationDictionary> = {
  en,
  pl,
};

export function getDictionary(locale: Locale): TranslationDictionary {
  return DICTIONARIES[locale];
}

function lookupPath(dict: TranslationDictionary, key: string): string {
  const parts = key.split('.');
  let current: unknown = dict;
  for (const part of parts) {
    if (typeof current !== 'object' || current === null || !(part in current)) {
      return key;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : key;
}

export function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) => {
    const val = params[name];
    return val === undefined ? match : String(val);
  });
}

export function translate(
  locale: Locale,
  key: TranslationKey,
  params?: TranslationParams,
): string {
  const dict = getDictionary(locale);
  const template = lookupPath(dict, key);
  return interpolate(template, params);
}

export function createTranslator(locale: Locale): Translator {
  return (key, params) => translate(locale, key, params);
}
