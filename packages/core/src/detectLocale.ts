export function detectLocale<T extends string>(
  locale: string,
  options: {
    supportedLocales: T[];
    fallbackLocale: T;
  },
): T {
  const defaultLocale = locale;
  const iso4Code = options.supportedLocales.find((loc) => loc === defaultLocale);
  if (iso4Code) return iso4Code;
  const iso2Code = options.supportedLocales
    .map((loc) => [loc.split('-')[0], loc] as const)
    .find(([matchLoc]) => matchLoc === defaultLocale.split('-')[0])?.[1];
  return iso2Code || options.fallbackLocale;
}
