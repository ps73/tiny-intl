import { detectLocale } from './detectLocale';

export function detectBrowserLocale<T extends string>(options: {
  supportedLocales: T[];
  fallbackLocale: T;
}): T {
  const defaultLocale = navigator?.languages?.[0] || navigator?.language;
  if (!defaultLocale) return options.fallbackLocale;
  return detectLocale(defaultLocale, options);
}
