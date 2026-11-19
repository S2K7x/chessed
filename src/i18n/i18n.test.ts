import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { en } from './en';
import { fr } from './fr';
import { detectLocale, getLocale, list, loadLocale, num, registerCatalog, setLocale, t, translate, type Catalog, type Message } from './index';

const params = (m: Message) => new Set([...(typeof m === 'string' ? m : `${m.one} ${m.other}`).matchAll(/\{(\w+)\}/g)].map((x) => x[1]));
const pluralCount = (m: Message) => (typeof m === 'string' ? params(m) : new Set([...params(m), 'count']));

it('refuses a language whose catalogue is not loaded', () => {
  expect(() => setLocale('fr')).toThrow(/not loaded/);
});

afterEach(() => setLocale('en'));

describe('catalogues', () => {
  it('have the same keys in French and English', () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });

  it('use the same parameters in both languages', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      // A French message may drop a parameter (a plural "one" form says "1" in words), never add one.
      const extra = [...pluralCount(fr[key])].filter((p) => !pluralCount(en[key]).has(p));
      expect(extra, key).toEqual([]);
      expect(typeof fr[key], key).toBe(typeof en[key]);
    }
  });

  it('has no empty message', () => {
    for (const [key, m] of Object.entries(fr)) {
      const texts = typeof m === 'string' ? [m] : [m.one, m.other];
      for (const text of texts) expect(text.trim().length > 0 || key === 'guess.too.after', key).toBe(true);
    }
  });
});

describe('t', () => {
  beforeAll(() => registerCatalog('fr', fr));

  it('fills in parameters', () => {
    expect(t('explain.preferred', { san: 'Nf3' })).toBe('The engine preferred Nf3.');
  });

  it('keeps a placeholder whose parameter is missing', () => {
    expect(translate('en', 'explain.preferred', {})).toBe('The engine preferred {san}.');
  });

  it('chooses the plural form with the rules of the language', () => {
    expect(t('summary.blunders', { count: 1 })).toBe('1 blunder');
    expect(t('summary.blunders', { count: 0 })).toBe('0 blunders');
    expect(t('summary.blunders', { count: 2 })).toBe('2 blunders');
    setLocale('fr');
    // French uses the singular for 0 and 1.
    expect(t('summary.blunders', { count: 0 })).toBe('0 gaffe');
    expect(t('summary.blunders', { count: 1 })).toBe('1 gaffe');
    expect(t('summary.blunders', { count: 3 })).toBe('3 gaffes');
  });

  it('falls back to English for a message missing from a catalogue', () => {
    const partial = { ...fr } as Record<string, Message>;
    delete partial['nav.games'];
    registerCatalog('fr', partial as Catalog);
    try {
      setLocale('fr');
      expect(t('nav.games')).toBe('Games');
      expect(t('nav.training')).toBe('Entraînement');
    } finally {
      registerCatalog('fr', fr);
    }
  });

  it('puts a no-break space before French high punctuation', () => {
    setLocale('fr');
    expect(t('summary.opening', { opening: 'Partie italienne' })).toBe('Ouverture : Partie italienne.');
    expect(t('guess.question', { me: 'Tal' })).toBe("Qu'a joué Tal ?");
  });

  it('formats numbers and lists in the current language', () => {
    expect(num(75.25, 1)).toBe('75.3');
    expect(list(['a', 'b', 'c'])).toBe('a, b and c');
    setLocale('fr');
    expect(num(75.25, 1)).toBe('75,3');
    expect(list(['a', 'b'])).toBe('a et b');
  });
});

describe('locale selection', () => {
  it('takes the first supported browser language, else English', () => {
    expect(detectLocale(['fr-CA', 'en-US'])).toBe('fr');
    expect(detectLocale(['de-DE', 'en-GB'])).toBe('en');
    expect(detectLocale(['de-DE'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });

  it('loads a catalogue before switching to it', async () => {
    await loadLocale('fr');
    setLocale('fr');
    expect(getLocale()).toBe('fr');
    expect(t('nav.games')).toBe('Parties');
  });
});
