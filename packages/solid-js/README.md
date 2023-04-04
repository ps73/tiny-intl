# @tiny-intl/solid-js

A tiny library to translate or transform strings, dates and numbers based on native Intl.

## Installation

```bash
npm install @tiny-intl/solid-js
```

## Usage

```json
// en-US.json
{
  "messages": {
    "hello": "Hello {{name}}!",
    "document": {
      "one": "Document",
      "other": "Documents"
      // supports also zero, two, few, many
    }
  }
}
```

```jsx
import { createTinyIntl, detectBrowserLocale } from '@tiny-intl/core';
import { TinyIntlContext } from '@tiny-intl/solid-js';

const intl = createTinyIntl({
  fallbackLocale: 'en-US',
  supportedLocales: ['en-US', 'de-DE'],
  loadDict: async (nextLoc) => {
    const dict = (await import(`./locales/${nextLoc}.json`)).default;
    return dict.messages;
  },
  detectLocale: ({ supportedLocales, fallbackLocale }) => {
    // or any custom logic
    return detectBrowserLocale({ supportedLocales, fallbackLocale });
  },
});

const App = () => {
  const [i18nMounted, setI18nMounted] = createSignal(false);

  intl.mount().then(() => {
    setI18nMounted(true);
  });

  return (
    <TinyIntlContext.Provider value={intl}>
      <Show when={i18nMounted()}>
        <AppContent />
      </Show>
    </TinyIntlContext.Provider>
  );
};
```

### Translating strings

This package uses native plural rules from Intl [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules).

```jsx
import { useIntl, Translate } from '@tiny-intl/solid-js';

// via primitive
const MyComponent = () => {
  const { t, tc } = useIntl();

  return (
    <div>
      {/* Hello John! */}
      {t('hello', { name: 'John' })()}
      {/* Documents */}
      {tc('document', 2)()}
    </div>
  );
};

// via component
const MyComponent = () => {
  return (
    <div>
      {/* Hello John! */}
      <Translate name="hello" options={{ name: 'John' }} />
      {/* Documents */}
      <Translate name="document" count={2} />
    </div>
  );
};
```

### Formatting dates

Look at [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat) for more options.

```jsx
import { useIntl } from '@tiny-intl/solid-js';

// via primitive
const MyComponent = () => {
  const { d } = useIntl();

  return (
    <div>
      {/* Tuesday, April 6, 2021 */}
      {d(new Date(), { dateStyle: 'full' })()}
    </div>
  );
};

// via component
const MyComponent = () => {
  return (
    <div>
      {/* Tuesday, April 6, 2021 */}
      <Translate date={new Date()} options={{ dateStyle: 'fullDate' }} />
    </div>
  );
};
```

### Formatting numbers

Look at [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat) for more options.

```jsx
import { useIntl } from '@tiny-intl/solid-js';

// via primitive
const MyComponent = () => {
  const { n } = useIntl();

  return (
    <div>
      {/* €123,456.79 */}
      {n(123456.789, { style: 'currency', currency: 'EUR' })()}
    </div>
  );
};

// via component
const MyComponent = () => {
  return (
    <div>
      {/* €123,456.79 */}
      <Translate number={123456.789} options={{ style: 'currency', currency: 'EUR' }} />
    </div>
  );
};
```

### Change locale

```jsx
import { useIntl } from '@tiny-intl/solid-js';

const MyComponent = () => {
  const { change, getLocale } = useIntl();

  return (
    <div>
      <span>{getLocale()}</span>
      <button onClick={() => change('de-DE')}>German</button>
    </div>
  );
};
```
