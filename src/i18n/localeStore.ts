import { create } from 'zustand';
import { DEFAULT_LOCALE, type Locale } from '@/i18n';
import { setMetaValue } from '@/persistence/db';

const STORAGE_KEY = 'shadowpaint.locale';

function readInitialLocale(): Locale {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'en' || stored === 'pl') {
        return stored;
      }
    }
  } catch {
    // Ignore storage access errors in restricted contexts
  }
  return DEFAULT_LOCALE;
}

function applyDocumentLocale(locale: Locale): void {
  try {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, locale);
    }
    if (typeof indexedDB !== 'undefined') {
      void setMetaValue('locale', locale).catch(() => {});
    }
  } catch {
    // Ignore storage access errors
  }
}

export interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const initialLocale = readInitialLocale();
if (typeof document !== 'undefined') {
  document.documentElement.lang = initialLocale;
}

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: initialLocale,
  setLocale: (locale) => {
    applyDocumentLocale(locale);
    set({ locale });
  },
}));
