import { useStore } from '../app/store';
import { LOCALES, t, type Locale } from '../i18n';

/** English / French switch: a short select in the header, radio buttons in Settings. */
export function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const { locale } = useStore();
  const { setLanguage } = useStore.getState();
  if (compact) {
    return (
      <select className="lang-switch" aria-label={t('language.label')} value={locale} onChange={(e) => void setLanguage(e.target.value as Locale)}>
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {l.toUpperCase()}
          </option>
        ))}
      </select>
    );
  }
  return (
    <fieldset>
      <legend>{t('language.label')}</legend>
      {LOCALES.map((l) => (
        <label key={l} className="radio" lang={l}>
          <input type="radio" name="language" checked={locale === l} onChange={() => void setLanguage(l)} />
          {t(`language.${l}`)}
        </label>
      ))}
    </fieldset>
  );
}
