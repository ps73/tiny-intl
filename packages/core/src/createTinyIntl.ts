/* eslint-disable @typescript-eslint/naming-convention */
import { flattie } from 'flattie';

export type TinyIntlPluralDefinition = {
  zero?: string;
  one: string;
  two?: string;
  few?: string;
  other: string;
  many?: string;
};

export type TinyIntlDict = {
  [key: string]: string | TinyIntlPluralDefinition | TinyIntlDict;
};

export type TinyIntlFlatDict = {
  [key: string]: string;
};

export type TinyIntlTranslateTemplate = {
  [key: string]: string | number;
};

type CreateTinyIntlOptions<Locales extends string> = {
  fallbackLocale: Locales;
  fallbackDict?: TinyIntlDict;
  supportedLocales: Locales[];
  /**
   * @description Regex to match template variables, default example {{templateVar}}
   * @default /{{(.*?)}}/g
   * */
  templateRegex?: RegExp;
  loadDict?: (locale: Locales) => Promise<TinyIntlDict>;
  detectLocale?: (param: { supportedLocales: Locales[]; fallbackLocale: Locales }) => Locales;
};

export type TinyIntl<Locales extends string> = {
  locale: Locales;
  getLocale: () => Locales;
  change: (locale: Locales) => Promise<TinyIntlFlatDict>;
  t: (key: string, templateParams?: TinyIntlTranslateTemplate) => string;
  tc: (key: string, count: number, templateParams?: TinyIntlTranslateTemplate) => string;
  n: (number: number, options?: Intl.NumberFormatOptions) => string;
  d: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  subscribe: (cb: () => void) => () => void;
  mount: () => Promise<void>;
};

export function createTinyIntl<Locales extends string>(
  i18nOptions: CreateTinyIntlOptions<Locales>,
): TinyIntl<Locales> {
  const { fallbackLocale, loadDict, fallbackDict } = i18nOptions;
  const templateRegex = i18nOptions.templateRegex || /{{(.*?)}}/g;

  let mounted = false;
  let locale: Locales = fallbackLocale;
  let pluralRules: Intl.PluralRules = new Intl.PluralRules(fallbackLocale);
  let numberFormatCache = new Map<string, Intl.NumberFormat>();
  let dateFormatCache = new Map<string, Intl.DateTimeFormat>();
  let dict: TinyIntlFlatDict = flattie(fallbackDict || {});
  const subscriptions = new Set<() => void>();

  async function change(nextLocale: Locales, staticDict?: TinyIntlDict) {
    if (locale === nextLocale) {
      return dict;
    }
    locale = nextLocale;
    pluralRules = new Intl.PluralRules(locale);
    numberFormatCache = new Map<string, Intl.NumberFormat>();
    dateFormatCache = new Map<string, Intl.DateTimeFormat>();
    if (loadDict) {
      const nextDict = await loadDict(locale);
      dict = flattie<TinyIntlFlatDict, TinyIntlDict>(nextDict);
    } else if (staticDict) {
      dict = flattie<TinyIntlFlatDict, TinyIntlDict>(staticDict);
    }
    subscriptions.forEach((cb) => cb());
    return dict;
  }

  function template(str: string, templateParams: TinyIntlTranslateTemplate) {
    return str.replace(
      templateRegex,
      (_, key: string) => templateParams[key]?.toString() || `[${key}]`,
    );
  }

  function t(key: string, templateParams?: TinyIntlTranslateTemplate): string {
    const value = dict[key] || dict[`${key}.one`] || `[${key}]`;
    if (templateParams) {
      return template(value, templateParams);
    }
    return value;
  }

  function tc(key: string, count: number, templateParams?: TinyIntlTranslateTemplate): string {
    const pluralKey = pluralRules.select(count);
    const tKey = `${key}.${pluralKey}`;
    return t(tKey, templateParams);
  }

  function n(number: number, options?: Intl.NumberFormatOptions): string {
    const cacheKey = JSON.stringify(options || {});
    let formatter = numberFormatCache.get(locale);
    if (!formatter) {
      formatter = new Intl.NumberFormat(locale, options);
      numberFormatCache.set(cacheKey, formatter);
    }
    return formatter.format(number);
  }

  function d(date: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
    const dateValue = new Date(date);
    const cacheKey = JSON.stringify(options || {});
    let formatter = dateFormatCache.get(locale);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat(locale, options);
      dateFormatCache.set(cacheKey, formatter);
    }
    return formatter.format(dateValue);
  }

  function subscribe(cb: () => void) {
    subscriptions.add(cb);

    return () => {
      subscriptions.delete(cb);
    };
  }

  function detectDefaultLocale() {
    if (i18nOptions.detectLocale) {
      return i18nOptions.detectLocale({
        supportedLocales: i18nOptions.supportedLocales,
        fallbackLocale,
      });
    }
    return fallbackLocale;
  }

  async function mount() {
    if (mounted) return;
    mounted = true;
    await change(detectDefaultLocale());
  }

  return {
    get locale() {
      return locale;
    },
    getLocale() {
      return locale;
    },
    change,
    subscribe,
    t,
    tc,
    n,
    d,
    mount,
  };
}
