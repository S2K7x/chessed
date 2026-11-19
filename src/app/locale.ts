import { detectLocale, isLocale, loadLocale, setLocale, type Locale } from '../i18n';

/**
 * The interface language is kept in localStorage (not in IndexedDB) so that
 * it is known synchronously at start-up, before the first render: no flash of
 * English for a French reader.
 */
const KEY = 'chess-coach.locale';

export function savedLocale(): Locale | undefined {
  try {
    const v = localStorage.getItem(KEY);
    return isLocale(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

export function saveLocale(locale: Locale): void {
  try {
    localStorage.setItem(KEY, locale);
  } catch {
    // Private mode or storage disabled: the choice lasts for this visit.
  }
  document.documentElement.lang = locale;
}

/** The saved language, else the browser's, loaded and made current. */
export async function startLocale(): Promise<Locale> {
  const wanted = savedLocale() ?? detectLocale();
  let locale: Locale = wanted;
  try {
    await loadLocale(wanted);
  } catch {
    locale = 'en';
  }
  setLocale(locale);
  document.documentElement.lang = locale;
  return locale;
}
