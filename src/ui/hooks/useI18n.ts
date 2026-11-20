import { useMemo } from 'react';
import { createTranslator, type Locale, type Translator } from '@/i18n';
import { useLocaleStore } from '@/i18n/localeStore';

export function useI18n(): {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translator;
} {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const t = useMemo(() => createTranslator(locale), [locale]);
  return { locale, setLocale, t };
}
