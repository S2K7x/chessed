import { en } from './en';

/**
 * A small typed dictionary: English is bundled (it is the source catalogue,
 * the type of every other one, and the fallback), other locales are loaded on
 * demand. Keys and their `{params}` are checked by the compiler.
 */

export const LOCALES = ['en', 'fr'] as const;
export type Locale = (typeof LOCALES)[number];

/** A message with plural forms, chosen with Intl.PluralRules from `count`. */
export interface Plural {
  one: string;
  other: string;
}
export type Message = string | Plural;
export type MessageKey = keyof typeof en;
/** Every catalogue has exactly the keys of the English one. */
export type Catalog = { readonly [K in MessageKey]: Message };

type ParamNames<S extends string> = S extends `${string}{${infer P}}${infer R}` ? P | ParamNames<R> : never;
type ParamsOfMessage<M> = M extends string ? ParamNames<M> : M extends Plural ? ParamNames<M['one'] | M['other']> | 'count' : never;
export type ParamsOf<K extends MessageKey> = ParamsOfMessage<(typeof en)[K]>;
type Args<K extends MessageKey> = [ParamsOf<K>] extends [never] ? [] : [params: Record<ParamsOf<K>, string | number>];

const catalogs: Partial<Record<Locale, Catalog>> = { en };
let current: Locale = 'en';
const pluralRules = new Map<Locale, Intl.PluralRules>();

export const getLocale = (): Locale => current;

export const isLocale = (x: unknown): x is Locale => typeof x === 'string' && (LOCALES as readonly string[]).includes(x);

/** The first supported language of the browser, else English. */
export function detectLocale(languages: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]): Locale {
  for (const l of languages) {
    const base = l?.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return 'en';
}

/** Loads a catalogue (a separate chunk, cached offline by the service worker). */
export async function loadLocale(locale: Locale): Promise<void> {
  if (catalogs[locale]) return;
  if (locale === 'fr') catalogs.fr = (await import('./fr')).fr;
}

/** Makes `locale` the language of `t()`; its catalogue must be loaded first. */
export function setLocale(locale: Locale): void {
  if (!catalogs[locale]) throw new Error(`Locale ${locale} is not loaded`);
  current = locale;
}

/** Test helper and escape hatch: registers a catalogue without loading it. */
export function registerCatalog(locale: Locale, catalog: Catalog): void {
  catalogs[locale] = catalog;
}

function pick(m: Message, locale: Locale, count: unknown): string {
  if (typeof m === 'string') return m;
  let rules = pluralRules.get(locale);
  if (!rules) pluralRules.set(locale, (rules = new Intl.PluralRules(locale)));
  return rules.select(typeof count === 'number' ? count : Number(count)) === 'one' ? m.one : m.other;
}

/** French typography: a no-break space before : ; ? ! so that they never start a line. */
const typography = (s: string, locale: Locale) => (locale === 'fr' ? s.replace(/ ([:;?!])/g, ' $1') : s);

export function translate<K extends MessageKey>(locale: Locale, key: K, params?: Record<string, string | number>): string {
  const m = catalogs[locale]?.[key] ?? en[key];
  const text = pick(m, locale, params?.count);
  const filled = params ? text.replace(/\{(\w+)\}/g, (all, name: string) => (name in params ? String(params[name]) : all)) : text;
  return typography(filled, locale);
}

/** The message `key` in the current language, with its parameters filled in. */
export function t<K extends MessageKey>(key: K, ...args: Args<K>): string {
  return translate(current, key, args[0]);
}

/** A number in the current language ("75.3" or "75,3"). */
export function num(x: number, digits = 0): string {
  return x.toLocaleString(current, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** "a, b and c" in the current language. */
export function list(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${t('common.and')} ${items[items.length - 1]}`;
}

/** The text with its first letter in upper case. */
export const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
