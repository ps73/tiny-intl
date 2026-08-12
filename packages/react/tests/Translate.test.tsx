import type { TinyIntl, TinyIntlDict } from '@tiny-intl/core';

import { cleanup, render, screen } from '@testing-library/react';
import { createTinyIntl, detectLocale } from '@tiny-intl/core';
import { afterEach, describe, it } from 'vitest';

import { Translate } from '../src/Translate';
import { TinyIntlContext } from '../src/useIntl';

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

  it('renders a plain string translation', async ({ expect }) => {
    intl = await createIntl();
    render(
      <TinyIntlContext.Provider value={intl}>
        <Translate name="inbox" />
      </TinyIntlContext.Provider>,
    );
    expect(screen.getByText('Inbox')).toBeTruthy();
  });

  it('renders the plural form when count is set', async ({ expect }) => {
    intl = await createIntl();
    render(
      <TinyIntlContext.Provider value={intl}>
        <Translate name="document" count={2} />
      </TinyIntlContext.Provider>,
    );
    expect(screen.getByText('Documents')).toBeTruthy();
  });

  it('renders a formatted number', async ({ expect }) => {
    intl = await createIntl();
    render(
      <TinyIntlContext.Provider value={intl}>
        <Translate number={1000} />
      </TinyIntlContext.Provider>,
    );
    expect(screen.getByText('1,000')).toBeTruthy();
  });

  it('renders a formatted date', async ({ expect }) => {
    intl = await createIntl();
    render(
      <TinyIntlContext.Provider value={intl}>
        <Translate date="2021-01-01" options={{ dateStyle: 'full' }} />
      </TinyIntlContext.Provider>,
    );
    expect(screen.getByText('Friday, January 1, 2021')).toBeTruthy();
  });

  it('passes the value to a function-as-children', async ({ expect }) => {
    intl = await createIntl();
    render(
      <TinyIntlContext.Provider value={intl}>
        <Translate name="inbox">{(value) => <strong>{value}</strong>}</Translate>
      </TinyIntlContext.Provider>,
    );
    const el = screen.getByText('Inbox');
    expect(el.tagName).toBe('STRONG');
  });
});
