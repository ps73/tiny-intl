import type { TinyIntl, TinyIntlDict } from '../src';

import { afterEach, describe, it } from 'vitest';

import { createTinyIntl, detectBrowserLocale, detectLocale } from '../src';
import { relativeTimeFormatForDiff } from '../src/utils';

const loadDict = (locale: string): TinyIntlDict => {
  if (locale === 'en-US' || locale === 'sv-SE') {
    return {
      hello: 'Hello, {{name}}!',
      inbox: 'Inbox',
      document: {
        zero: 'Documents',
        one: 'Document',
        other: 'Documents',
      },
      plusXDocumentsSelected: {
        zero: '{{title}} and {{count}} more documents selected',
        one: '{{title}} and {{count}} more document selected',
        other: '{{title}} and {{count}} more documents selected',
      },
    };
  }
  if (locale === 'de-DE') {
    return {
      hello: 'Hallo, {{name}}!',
      inbox: 'Posteingang',
      document: {
        zero: 'Dokumente',
        one: 'Dokument',
        other: 'Dokumente',
      },
      plusXDocumentsSelected: {
        zero: '{{title}} ausgewählt',
        one: '{{title}} und ein weiteres Dokument ausgewählt',
        other: '{{title}} und {{count}} weitere Dokumente ausgewählt',
      },
    };
  }
  return {};
};

describe('@tiny-intl/core', () => {
  let intl: TinyIntl<'en-US' | 'sv-SE' | 'de-DE'>;

  afterEach(async () => {
    await intl.change('en-US');
  });

  it('mount instance', async ({ expect }) => {
    intl = createTinyIntl<'en-US' | 'de-DE' | 'sv-SE'>({
      loadDict: (locale) => {
        return loadDict(locale);
      },
      fallbackLocale: 'en-US',
      supportedLocales: ['en-US', 'de-DE', 'sv-SE'],
      detectLocale: (params) => detectLocale('en-US', params),
    });
    await intl.mount();
    expect(intl.locale).toBe('en-US');
  });

  it('mount instance with single locale', async ({ expect }) => {
    const intl2 = createTinyIntl<'de-DE'>({
      loadDict: (locale) => {
        return loadDict(locale);
      },
      fallbackLocale: 'de-DE',
      supportedLocales: ['de-DE'],
      detectLocale: (params) => detectLocale('de-DE', params),
    });
    await intl2.mount();
    expect(intl2.locale).toBe('de-DE');
    expect(intl2.t('inbox')).toBe('Posteingang');
  });

  it('change locale', async ({ expect }) => {
    await intl.change('de-DE');
    expect(intl.locale).toBe('de-DE');
  });

  it('translate string', async ({ expect }) => {
    await intl.change('de-DE');
    expect(intl.t('inbox')).toBe('Posteingang');
    await intl.change('en-US');
    expect(intl.t('inbox')).toBe('Inbox');
  });

  it('translate string with template', async ({ expect }) => {
    await intl.change('de-DE');
    expect(intl.t('hello', { name: 'John' })).toBe('Hallo, John!');
    expect(intl.t('hello', {})).toBe('Hallo, [name]!');
    await intl.change('en-US');
    expect(intl.t('hello', { name: 'John' })).toBe('Hello, John!');
  });

  it('translate with plural rules', async ({ expect }) => {
    await intl.change('de-DE');
    expect(intl.tc('document', 0)).toBe('Dokumente');
    expect(intl.tc('document', 1)).toBe('Dokument');
    expect(intl.tc('document', 2)).toBe('Dokumente');
    expect(intl.tc('document', 76)).toBe('Dokumente');
    expect(intl.tc('plusXDocumentsSelected', 5, { title: 'My Doc' })).toBe(
      'My Doc und 5 weitere Dokumente ausgewählt',
    );
    expect(intl.tc('plusXDocumentsSelected', 1, { title: 'My Doc' })).toBe(
      'My Doc und ein weiteres Dokument ausgewählt',
    );
  });

  it('date formatting', async ({ expect }) => {
    await intl.change('de-DE');
    expect(intl.dt('2021-01-01', { dateStyle: 'full' })).toBe('Freitag, 1. Januar 2021');
    await intl.change('en-US');
    expect(intl.dt('2021-01-01', { era: 'long' })).toBe('1/1/2021 Anno Domini');
  });

  it('relative time formatting', async ({ expect }) => {
    const oldDateNow = Date.now;
    Date.now = () => new Date('2020-01-01').getTime();
    await intl.change('de-DE');
    expect(intl.rt('2021-01-01')).toBe('in 1 Jahr');
    expect(intl.rt('2019-12-31T23:59:00.000z', { style: 'long' })).toBe('vor 1 Minute');
    expect(intl.rt('2019-12-31T04:00:00.000z')).toBe('vor 20 Stunden');
    await intl.change('en-US');
    expect(intl.rt('2022-01-01')).toBe('in 2 years');
    Date.now = oldDateNow;
  });

  it('number formatting', async ({ expect }) => {
    const cases: [number, deExp: string, usExp: string][] = [
      [1000, '1.000', '1,000'],
      [10000.25, '10.000,25', '10,000.25'],
      [1000000, '1.000.000', '1,000,000'],
      [1000000000, '1.000.000.000', '1,000,000,000'],
    ];
    await intl.change('de-DE');
    cases.forEach(([number, expected]) => {
      expect(intl.n(number)).toBe(expected);
    });
    await intl.change('en-US');
    cases.forEach(([number, , expected]) => {
      expect(intl.n(number)).toBe(expected);
    });
  });

  it('sorting and collator', async ({ expect }) => {
    const array = ['Z', 'a', 'z', 'ä'];
    await intl.change('de-DE');
    expect(intl.sort(array)).toEqual(['a', 'ä', 'z', 'Z']);
    expect(intl.sort(array, { caseFirst: 'upper' })).toEqual(['a', 'ä', 'Z', 'z']);
    await intl.change('en-US');
    expect(intl.sort(array)).toEqual(['a', 'ä', 'z', 'Z']);
    await intl.change('sv-SE');
    expect(intl.sort(array)).toEqual(['a', 'z', 'Z', 'ä']);

    await intl.change('de-DE');
    const collator = intl.collator({ caseFirst: 'upper' });
    const complexList = [{ name: 'Z' }, { name: 'a' }].sort((a, b) => collator(a.name, b.name)); // [{ name: 'a' }, { name: 'Z' }]
    expect(complexList).toEqual([{ name: 'a' }, { name: 'Z' }]);
  });

  it('list formatting', async ({ expect }) => {
    await intl.change('de-DE');
    expect(intl.list(['a', 'b', 'c'])).toBe('a, b und c');
    expect(intl.list(['a', 'b', 'c'], { type: 'disjunction' })).toBe('a, b oder c');
    expect(intl.list(['a', 'b', 'c'], { type: 'disjunction' })).toBe(
      intl.list(['a', 'b', 'c'], 'OR'),
    );
    await intl.change('en-US');
    expect(intl.list(['a', 'b', 'c'])).toBe('a, b, and c');
    expect(intl.list(['a', 'b', 'c'], { type: 'disjunction' })).toBe('a, b, or c');
  });

  it('fallbacks if newer Intl features are not supported', async ({ expect }) => {
    await intl.change('de-DE');
    /* eslint-disable @typescript-eslint/ban-ts-comment */
    // @ts-ignore
    const oldListFormat = Intl.ListFormat;
    // @ts-ignore
    Intl.ListFormat = undefined as any;
    expect(intl.list(['a', 'b', 'c'])).toBe('a, b, c');
    // @ts-ignore
    Intl.ListFormat = oldListFormat;

    const oldCollator = Intl.Collator;
    // @ts-ignore
    Intl.Collator = undefined;
    expect(intl.sort(['Z', 'a', 'z', 'ä'])).toEqual(['a', 'ä', 'z', 'Z']);
    Intl.Collator = oldCollator;

    const oldRelativeTimeFormat = Intl.RelativeTimeFormat;
    // @ts-ignore
    Intl.RelativeTimeFormat = undefined;
    const oldDateNow = Date.now;
    Date.now = () => new Date('2020-01-01').getTime();
    expect(
      intl.rt('2021-01-01', {
        fallback: (value, unit) => `${value} ${unit}`,
      }),
    ).toBe('1 years');
    expect(intl.rt('2021-01-01')).toBe('');
    // @ts-ignore
    Intl.RelativeTimeFormat = oldRelativeTimeFormat;
    Date.now = oldDateNow;
    /* eslint-enable @typescript-eslint/ban-ts-comment */
  });

  it('static dict', async ({ expect }) => {
    await intl.change('de-DE');
    expect(intl.t('hello-world')).toBe('[hello-world]');
    await intl.change('en-US');
    await intl.change('de-DE', {
      'hello-world': 'Hallo Welt!',
    });
    expect(intl.t('hello-world')).toBe('Hallo Welt!');
  });

  it('subscribe to locale change', async ({ expect }) => {
    let changeCount = 0;
    const unsubscribe = intl.subscribe((nextLocale) => {
      if (changeCount === 0) expect(nextLocale).toBe('de-DE');
      if (changeCount === 1) expect(nextLocale).toBe('en-US');
      expect(intl.getLocale()).toBe(nextLocale);
      changeCount += 1;
    });
    await intl.change('de-DE');
    await intl.change('en-US');
    unsubscribe();
  });

  it('uses fallback language', async ({ expect }) => {
    const intl2 = createTinyIntl<'en-US' | 'de-DE' | 'sv-SE'>({
      loadDict,
      fallbackLocale: 'de-DE',
      supportedLocales: ['en-US', 'de-DE', 'sv-SE'],
    });
    await intl2.mount();
    await intl2.mount();
    expect(intl2.locale).toBe('de-DE');
  });

  it('detect locale', ({ expect }) => {
    let detected = detectLocale('en', {
      fallbackLocale: 'en-US',
      supportedLocales: ['en-US', 'de-DE', 'sv-SE'],
    });
    expect(detected).toBe('en-US');
    detected = detectLocale('en', {
      fallbackLocale: 'de-DE',
      supportedLocales: ['de-DE', 'sv-SE'],
    });
    expect(detected).toBe('de-DE');
  });

  it('detect browser locale', ({ expect }) => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    // eslint-disable-next-line no-global-assign
    globalThis.navigator = undefined;
    let detected = detectBrowserLocale({
      supportedLocales: ['en-US', 'de-DE', 'sv-SE'],
      fallbackLocale: 'de-DE',
    });
    expect(detected).toBe('de-DE');
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    // eslint-disable-next-line no-global-assign
    globalThis.navigator = {
      languages: ['sv-SE', 'en-US'],
      language: 'en-US',
    };
    detected = detectBrowserLocale({
      supportedLocales: ['en-US', 'de-DE', 'sv-SE'],
      fallbackLocale: 'de-DE',
    });
    expect(detected).toBe('sv-SE');
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    // eslint-disable-next-line no-global-assign
    globalThis.navigator = {
      language: 'en-US',
    };
    detected = detectBrowserLocale({
      supportedLocales: ['en-US', 'de-DE', 'sv-SE'],
      fallbackLocale: 'de-DE',
    });
    expect(detected).toBe('en-US');
    globalThis.navigator = {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      language: undefined,
      languages: [],
    };
    detected = detectBrowserLocale({
      supportedLocales: ['en-US', 'de-DE', 'sv-SE'],
      fallbackLocale: 'de-DE',
    });
    expect(detected).toBe('de-DE');
    globalThis.navigator = {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      language: undefined,
    };
    detected = detectBrowserLocale({
      supportedLocales: ['en-US', 'de-DE', 'sv-SE'],
      fallbackLocale: 'de-DE',
    });
    expect(detected).toBe('de-DE');
  });

  it('relative time format helper', ({ expect }) => {
    const cases = [
      [-3, -3, 'seconds'],
      [59, 59, 'seconds'],
      [-61, -1, 'minutes'],
      [-119, -2, 'minutes'],
      [3599, 60, 'minutes'],
      [-3600, -1, 'hours'],
      [86399, 24, 'hours'],
      [-86400, -1, 'days'],
      [2620799, 30, 'days'],
      [-2620800, -1, 'months'],
      [31449599, 12, 'months'],
      [-31449600, -1, 'years'],
      [31449600, 1, 'years'],
    ] as const;

    cases.forEach(([v, r, u]) => {
      const [result, unit] = relativeTimeFormatForDiff(v * 1000);
      expect(result).toBe(r);
      expect(unit).toBe(u);
    });
  });
});
