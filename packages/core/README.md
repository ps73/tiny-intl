# @gridventures/tiny-intl-core

A tiny (~1kB gzipped) library to translate or transform strings, dates and numbers based on native Intl.

## Installation

```bash
npm install @gridventures/tiny-intl-core
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

```js
import { createTinyIntl, detectBrowserLocale } from '@gridventures/tiny-intl-core';

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

// ...

await intl.mount();
```

### Translating strings

This package uses native plural rules from Intl [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules).

```js
intl.t('hello', { name: 'John' }); // Hello John!
intl.tc('document', 2); // Documents
```

### Formatting dates

Look at [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat) for more options.

```js
intl.d(new Date(), { dateStyle: 'full' }); // Tuesday, April 6, 2021
```

### Formatting numbers

Look at [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat) for more options.

```js
intl.n(123456.789, { style: 'currency', currency: 'EUR' }); // €123,456.79
```

### Listen to locale changes

```js
const dispose = intl.subscribe(() => {
  console.log(intl.getLocale()); // de-DE
});

await intl.change('de-DE'); // de-DE

dispose(); // stop listening
```
