import { detectLocale } from './detectLocale';

export function detectBrowserLocale<T extends string>(options: {
  supportedLocales: T[];
  fallbackLocale: T;
}): T {
  if (typeof navigator === 'undefined') return options.fallbackLocale;
  const defaultLocale = navigator?.languages?.[0] || navigator?.language;
  if (!defaultLocale) return options.fallbackLocale;
  return detectLocale(defaultLocale, options);
}
