/* eslint-disable @typescript-eslint/naming-convention */
import { flattie } from 'flattie';

import { automaticRelativeTimeFormat } from './utils';

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

export type TinyIntlRelativeTimeFormatOptions = Intl.RelativeTimeFormatOptions & {
  fallback?: (v: number, u: Intl.RelativeTimeFormatUnit) => string;
};

export type TinyIntlSubscriptionCallback<Locales extends string> = (nextLocale: Locales) => void;

export type CreateTinyIntlOptions<Locales extends string> = {
  fallbackLocale: Locales;
  fallbackDict?: TinyIntlDict;
  supportedLocales: Locales[];
  /**
   * @description Regex to match template variables, default example {{templateVar}}
   * @default /{{(.*?)}}/g
   * */
  templateRegex?: RegExp;
  loadDict?: (locale: Locales) => Promise<TinyIntlDict> | TinyIntlDict;
  detectLocale?: (param: { supportedLocales: Locales[]; fallbackLocale: Locales }) => Locales;
};

export type TinyIntl<Locales extends string> = {
  locale: Locales;
  getLocale: () => Locales;
  change: (locale: Locales, staticDict?: TinyIntlDict) => Promise<TinyIntlFlatDict>;
  t: (key: string, templateParams?: TinyIntlTranslateTemplate) => string;
  tc: (key: string, count: number, templateParams?: TinyIntlTranslateTemplate) => string;
  n: (number: number, options?: Intl.NumberFormatOptions) => string;
  dt: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  /**
   * @deprecated use dt instead. Will be removed in stable release.
   */
  d: TinyIntl<Locales>['dt'];
  rt: (date: Date | string | number, options?: TinyIntlRelativeTimeFormatOptions) => string;
  collator: (options?: Intl.CollatorOptions) => (x: string, y: string) => number;
  sort: (items: string[], options?: Intl.CollatorOptions) => string[];
  list: (items: string[], options?: Intl.ListFormatOptions) => string;
  subscribe: (cb: TinyIntlSubscriptionCallback<Locales>) => () => void;
  mount: () => Promise<void>;
};

function newCacheKey(v?: object | undefined) {
  return v ? JSON.stringify(v) : '_';
}

export function createTinyIntl<Locales extends string>(
  i18nOptions: CreateTinyIntlOptions<Locales>,
): TinyIntl<Locales> {
  const { fallbackLocale, loadDict, fallbackDict } = i18nOptions;
  const templateRegex = i18nOptions.templateRegex || /{{(.*?)}}/g;

  let mounted = false;
  let locale: Locales = fallbackLocale;
  let pluralRules: Intl.PluralRules = new Intl.PluralRules(fallbackLocale);
  const numberFormatCache = new Map<string, Intl.NumberFormat>();
  const dateTimeFormatCache = new Map<string, Intl.DateTimeFormat>();
  const relativeTimeFormatCache = new Map<string, Intl.RelativeTimeFormat>();
  const listFormatCache = new Map<string, Intl.ListFormat>();
  const collatorCache = new Map<string, Intl.Collator>();
  let dict: TinyIntlFlatDict = flattie(fallbackDict || {});
  const subscriptions = new Set<TinyIntlSubscriptionCallback<Locales>>();

  async function change(nextLocale: Locales, staticDict?: TinyIntlDict, forceLoad = false) {
    if (locale === nextLocale && !forceLoad) {
      return dict;
    }
    locale = nextLocale;
    pluralRules = new Intl.PluralRules(locale);
    numberFormatCache.clear();
    dateTimeFormatCache.clear();
    relativeTimeFormatCache.clear();
    numberFormatCache.clear();
    listFormatCache.clear();
    collatorCache.clear();
    if (staticDict) {
      dict = flattie<TinyIntlFlatDict, TinyIntlDict>(staticDict);
    } else if (loadDict) {
      const nextDict = await loadDict(locale);
      dict = flattie<TinyIntlFlatDict, TinyIntlDict>(nextDict);
    }
    subscriptions.forEach((cb) => cb(locale));
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
    return template(value, templateParams || {});
  }

  function tc(key: string, count: number, templateParams?: TinyIntlTranslateTemplate): string {
    const pluralKey = pluralRules.select(count);
    const tKey = `${key}.${pluralKey}`;
    return t(tKey, {
      count,
      ...templateParams,
    });
  }

  function n(number: number, options?: Intl.NumberFormatOptions): string {
    const cacheKey = newCacheKey(options);
    let formatter = numberFormatCache.get(locale);
    if (!formatter) {
      formatter = new Intl.NumberFormat(locale, options);
      numberFormatCache.set(cacheKey, formatter);
    }
    return formatter.format(number);
  }

  function dt(date: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
    const dateValue = new Date(date);
    const cacheKey = newCacheKey(options);
    let formatter = dateTimeFormatCache.get(locale);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat(locale, options);
      dateTimeFormatCache.set(cacheKey, formatter);
    }
    return formatter.format(dateValue);
  }

  // Intl.RelativeTimeFormat is not supported in Safari < 14 or on MacOS < 11
  function rt(date: Date | string | number, options?: TinyIntlRelativeTimeFormatOptions): string {
    const { fallback, ...rtOptions } = options || {};
    const [value, unit] = automaticRelativeTimeFormat(date);
    if (!Intl.RelativeTimeFormat) {
      console.warn('Intl.RelativeTimeFormat is not supported in this browser');
      if (fallback) {
        return fallback(value, unit);
      }
      return '';
    }
    const cacheKey = newCacheKey(rtOptions);
    let formatter = relativeTimeFormatCache.get(locale);
    if (!formatter) {
      formatter = new Intl.RelativeTimeFormat(locale, rtOptions);
      relativeTimeFormatCache.set(cacheKey, formatter);
    }
    return formatter.format(value, unit);
  }

  function collator(options?: Intl.CollatorOptions) {
    if (!Intl.Collator) {
      console.warn('Intl.Collator is not supported in this browser');
      return (x: string, y: string) => x.localeCompare(y);
    }
    const cacheKey = newCacheKey(options || {});
    let formatter = collatorCache.get(locale);
    if (!formatter) {
      formatter = new Intl.Collator(locale, options);
      collatorCache.set(cacheKey, formatter);
    }
    return formatter.compare;
  }

  function sort(items: string[], options?: Intl.CollatorOptions): string[] {
    const fn = collator(options);
    return [...items].sort(fn);
  }

  function list(items: string[], options?: Intl.ListFormatOptions | 'AND' | 'OR') {
    if (!Intl.ListFormat) {
      console.warn('Intl.ListFormat is not supported in this browser');
      return items.join(', ');
    }
    let type: 'conjunction' | 'disjunction' = 'conjunction';
    if (options === 'OR') {
      type = 'disjunction';
    }
    const intlOptions = typeof options === 'string' ? ({ type, style: 'long' } as const) : options;
    const cacheKey = newCacheKey(intlOptions);
    let formatter = listFormatCache.get(locale);
    if (!formatter) {
      formatter = new Intl.ListFormat(locale, intlOptions);
      listFormatCache.set(cacheKey, formatter);
    }
    return formatter.format(items);
  }

  function subscribe(cb: TinyIntlSubscriptionCallback<Locales>) {
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
    await change(detectDefaultLocale(), undefined, true);
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
    d: dt,
    dt,
    rt,
    collator,
    sort,
    list,
    mount,
  };
}
