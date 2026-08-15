import type { TinyIntl, TinyIntlDict } from '@tiny-intl/core';

import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { createTinyIntl, detectLocale } from '@tiny-intl/core';
import { afterEach, describe, it } from 'vitest';

import { TinyIntlContext, useIntl } from '../src/useIntl';

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

async function createIntl() {
  const intl = createTinyIntl<'en-US' | 'de-DE' | 'sv-SE'>({
    loadDict: (locale) => loadDict(locale),
    fallbackLocale: 'en-US',
    supportedLocales: ['en-US', 'de-DE', 'sv-SE'],
    detectLocale: (params) => detectLocale('en-US', params),
  });
  await intl.mount();
  return intl;
}

describe('@tiny-intl/react', () => {
  let intl: TinyIntl<'en-US' | 'sv-SE' | 'de-DE'>;

  afterEach(cleanup);

  it('throws outside a provider', ({ expect }) => {
    expect(() => renderHook(() => useIntl())).toThrow(
      'useIntl must be used within a TinyIntlContext.Provider',
    );
  });

  it('t() returns the translated string for the mounted locale', async ({ expect }) => {
    intl = await createIntl();
    const { result } = renderHook(() => useIntl(), {
      wrapper: ({ children }) => (
        <TinyIntlContext.Provider value={intl}>{children}</TinyIntlContext.Provider>
      ),
    });
    expect(result.current.t('inbox')).toBe('Inbox');
  });

  it('re-renders with the German string after intl.change', async ({ expect }) => {
    intl = await createIntl();

    function Inbox() {
      const { t } = useIntl();
      return <span>{t('inbox')}</span>;
    }

    render(
      <TinyIntlContext.Provider value={intl}>
        <Inbox />
      </TinyIntlContext.Provider>,
    );

    expect(screen.getByText('Inbox')).toBeTruthy();

    await act(async () => {
      await intl.change('de-DE');
    });

    expect(screen.getByText('Posteingang')).toBeTruthy();
  });

  it('n() and dt() format per locale', async ({ expect }) => {
    intl = await createIntl();
    await act(async () => {
      await intl.change('de-DE');
    });

    const { result } = renderHook(() => useIntl(), {
      wrapper: ({ children }) => (
        <TinyIntlContext.Provider value={intl}>{children}</TinyIntlContext.Provider>
      ),
    });

    expect(result.current.n(1000)).toBe('1.000');
    expect(result.current.dt('2021-01-01', { dateStyle: 'full' })).toBe('Freitag, 1. Januar 2021');
  });
});
