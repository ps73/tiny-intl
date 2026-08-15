import type { TinyIntl, TinyIntlDict } from '../src';

import { vi, afterEach, describe, it } from 'vitest';

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
      trash: {
        zero: 'Trash is empty',
        one: '1 item in trash',
        other: '{{count}} items in trash',
      },
      folder: {
        one: '1 folder',
        other: '{{count}} folders',
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
      trash: {
        zero: 'Papierkorb ist leer',
        one: '1 Element im Papierkorb',
        other: '{{count}} Elemente im Papierkorb',
      },
      folder: {
        one: '1 Ordner',
        other: '{{count}} Ordner',
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

  it('uses the zero entry when count is 0 and one is defined', async ({ expect }) => {
    await intl.change('en-US');
    expect(intl.tc('trash', 0)).toBe('Trash is empty');
    expect(intl.tc('trash', 1)).toBe('1 item in trash');
    expect(intl.tc('trash', 5)).toBe('5 items in trash');

    await intl.change('de-DE');
    expect(intl.tc('trash', 0)).toBe('Papierkorb ist leer');
    expect(intl.tc('trash', 5)).toBe('5 Elemente im Papierkorb');
  });

  it('falls back to the CLDR category when no zero entry is defined', async ({ expect }) => {
    await intl.change('de-DE');
    expect(intl.tc('folder', 0)).toBe('0 Ordner');
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

  // Forces a genuine locale change (twice, landing back on en-US) so every
  // formatter cache is guaranteed empty before we start counting constructor
  // calls. A plain `await intl.change('en-US')` is not reliable here because
  // if the shared `intl` instance already sits on 'en-US' (the common case,
  // since afterEach resets to it) that call hits the `change()` early return
  // and clears nothing, leaving caches polluted by whichever earlier test
  // ran last.
  async function resetFormatterCaches() {
    await intl.change('de-DE');
    await intl.change('en-US');
  }

  // `vi.spyOn(Intl, 'RelativeTimeFormat' | 'ListFormat')` blows up with
  // "Constructor ... requires 'new'" in this environment (unlike NumberFormat,
  // DateTimeFormat and Collator, which spy fine) — vitest's spy wrapper loses
  // the internal slot these two constructors check for. As a fallback, swap
  // the constructor for a subclass that counts `super()` calls, then restore
  // it — the same direct-reassignment technique already used below in
  // 'fallbacks if newer Intl features are not supported'.
  function countingConstructor<T extends new (...args: never[]) => unknown>(original: T) {
    const state = { calls: 0 };
    class Counting extends (original as new (...args: never[]) => unknown) {
      constructor(...args: never[]) {
        super(...args);
        state.calls += 1;
      }
    }
    return { ctor: Counting as unknown as T, state };
  }

  it('reuses cached Intl.NumberFormat instances', async ({ expect }) => {
    await resetFormatterCaches();

    const numberFormatSpy = vi.spyOn(Intl, 'NumberFormat');
    intl.n(1);
    intl.n(2);
    intl.n(3);
    expect(numberFormatSpy).toHaveBeenCalledTimes(1);

    intl.n(4, { style: 'percent' });
    intl.n(5, { style: 'percent' });
    expect(numberFormatSpy).toHaveBeenCalledTimes(2);
    numberFormatSpy.mockRestore();
  });

  it('reuses cached Intl.DateTimeFormat instances', async ({ expect }) => {
    await resetFormatterCaches();

    const dateTimeFormatSpy = vi.spyOn(Intl, 'DateTimeFormat');
    intl.dt('2021-01-01');
    intl.dt('2021-06-15');
    intl.dt('2022-12-31');
    expect(dateTimeFormatSpy).toHaveBeenCalledTimes(1);

    intl.dt('2021-01-01', { dateStyle: 'full' });
    intl.dt('2021-06-15', { dateStyle: 'full' });
    expect(dateTimeFormatSpy).toHaveBeenCalledTimes(2);
    dateTimeFormatSpy.mockRestore();
  });

  it('reuses cached Intl.RelativeTimeFormat instances', async ({ expect }) => {
    await resetFormatterCaches();

    const oldDateNow = Date.now;
    Date.now = () => new Date('2020-01-01').getTime();

    /* eslint-disable @typescript-eslint/ban-ts-comment */
    const originalRelativeTimeFormat = Intl.RelativeTimeFormat;
    const { ctor, state } = countingConstructor(originalRelativeTimeFormat);
    // @ts-ignore
    Intl.RelativeTimeFormat = ctor;

    intl.rt('2021-01-01');
    intl.rt('2021-02-01');
    intl.rt('2021-03-01');
    expect(state.calls).toBe(1);

    intl.rt('2021-01-01', { style: 'long' });
    intl.rt('2021-02-01', { style: 'long' });
    expect(state.calls).toBe(2);

    // @ts-ignore
    Intl.RelativeTimeFormat = originalRelativeTimeFormat;
    /* eslint-enable @typescript-eslint/ban-ts-comment */
    Date.now = oldDateNow;
  });

  it('reuses cached Intl.ListFormat instances', async ({ expect }) => {
    await resetFormatterCaches();

    /* eslint-disable @typescript-eslint/ban-ts-comment */
    const originalListFormat = Intl.ListFormat;
    const { ctor, state } = countingConstructor(originalListFormat);
    // @ts-ignore
    Intl.ListFormat = ctor;

    intl.list(['a', 'b', 'c']);
    intl.list(['d', 'e']);
    intl.list(['f']);
    expect(state.calls).toBe(1);

    intl.list(['a', 'b', 'c'], { type: 'disjunction' });
    intl.list(['d', 'e'], { type: 'disjunction' });
    expect(state.calls).toBe(2);

    // @ts-ignore
    Intl.ListFormat = originalListFormat;
    /* eslint-enable @typescript-eslint/ban-ts-comment */
  });

  it('reuses cached Intl.Collator instances', async ({ expect }) => {
    await resetFormatterCaches();

    const collatorSpy = vi.spyOn(Intl, 'Collator');
    intl.collator();
    intl.collator();
    intl.collator();
    expect(collatorSpy).toHaveBeenCalledTimes(1);

    intl.collator({ caseFirst: 'upper' });
    intl.collator({ caseFirst: 'upper' });
    expect(collatorSpy).toHaveBeenCalledTimes(2);
    collatorSpy.mockRestore();
  });

  it('rebuilds Intl formatters after a locale change', async ({ expect }) => {
    await resetFormatterCaches();

    const spy = vi.spyOn(Intl, 'NumberFormat');
    intl.n(1000);
    await intl.change('de-DE');
    intl.n(1000);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
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
    vi.stubGlobal('navigator', undefined);
    let detected = detectBrowserLocale({
      supportedLocales: ['en-US', 'de-DE', 'sv-SE'],
      fallbackLocale: 'de-DE',
    });
    expect(detected).toBe('de-DE');
    vi.stubGlobal('navigator', {
      languages: ['sv-SE', 'en-US'],
      language: 'en-US',
    });
    detected = detectBrowserLocale({
      supportedLocales: ['en-US', 'de-DE', 'sv-SE'],
      fallbackLocale: 'de-DE',
    });
    expect(detected).toBe('sv-SE');
    vi.stubGlobal('navigator', {
      language: 'en-US',
      languages: undefined,
    });
    detected = detectBrowserLocale({
      supportedLocales: ['en-US', 'de-DE', 'sv-SE'],
      fallbackLocale: 'de-DE',
    });
    expect(detected).toBe('en-US');
    vi.stubGlobal('navigator', {
      language: undefined,
      languages: [],
    });
    detected = detectBrowserLocale({
      supportedLocales: ['en-US', 'de-DE', 'sv-SE'],
      fallbackLocale: 'de-DE',
    });
    expect(detected).toBe('de-DE');
    vi.stubGlobal('navigator', {
      language: undefined,
    });
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

  it('applies a staticDict for the current locale without a real change', async ({ expect }) => {
    await intl.change('de-DE');
    await intl.change('de-DE', { foo: 'bar' });
    expect(intl.t('foo')).toBe('bar');
  });

  it('discards a superseded change when loads resolve out of order', async ({ expect }) => {
    const resolvers: Record<string, (d: TinyIntlDict) => void> = {};
    const racy = createTinyIntl<'en-US' | 'de-DE'>({
      fallbackLocale: 'en-US',
      supportedLocales: ['en-US', 'de-DE'],
      loadDict: (loc) =>
        new Promise((resolve) => {
          resolvers[loc] = resolve;
        }),
    });

    const first = racy.change('de-DE');
    const second = racy.change('en-US');

    // resolve the *newer* request first, then the stale one
    resolvers['en-US']({ greeting: 'Hello' });
    resolvers['de-DE']({ greeting: 'Hallo' });
    await Promise.all([first, second]);

    expect(racy.getLocale()).toBe('en-US');
    expect(racy.t('greeting')).toBe('Hello'); // NOT 'Hallo'
  });

  it('notifies subscribers only for the winning change, not the superseded one', async ({
    expect,
  }) => {
    const resolvers: Record<string, (d: TinyIntlDict) => void> = {};
    const racy = createTinyIntl<'en-US' | 'de-DE'>({
      fallbackLocale: 'en-US',
      supportedLocales: ['en-US', 'de-DE'],
      loadDict: (loc) =>
        new Promise((resolve) => {
          resolvers[loc] = resolve;
        }),
    });

    const seenLocales: string[] = [];
    racy.subscribe((nextLocale) => {
      seenLocales.push(nextLocale);
    });

    const first = racy.change('de-DE');
    const second = racy.change('en-US');

    resolvers['en-US']({ greeting: 'Hello' });
    resolvers['de-DE']({ greeting: 'Hallo' });
    await Promise.all([first, second]);

    expect(seenLocales).toEqual(['en-US']);
  });

  it('mount() is re-entrant and shares one load between concurrent callers', async ({ expect }) => {
    let calls = 0;
    let resolveLoad: (d: TinyIntlDict) => void = () => {};
    const intl3 = createTinyIntl<'de-DE'>({
      fallbackLocale: 'de-DE',
      supportedLocales: ['de-DE'],
      loadDict: () => {
        calls += 1;
        return new Promise((resolve) => {
          resolveLoad = resolve;
        });
      },
    });

    const mount1 = intl3.mount();
    const mount2 = intl3.mount();

    let mount2Resolved = false;
    mount2.then(
      () => {
        mount2Resolved = true;
      },
      () => {},
    );

    // Flush a few microtask ticks without resolving the load yet. A
    // re-entrant mount2 must NOT resolve here — only a buggy mount() that
    // returns an already-"mounted" promise while the first load is still in
    // flight would resolve this early.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mount2Resolved).toBe(false);
    expect(calls).toBe(1);

    resolveLoad({ inbox: 'Posteingang' });
    await Promise.all([mount1, mount2]);

    expect(mount2Resolved).toBe(true);
    expect(calls).toBe(1);
    expect(intl3.t('inbox')).toBe('Posteingang');
  });
});
