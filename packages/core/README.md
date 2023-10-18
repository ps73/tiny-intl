# @tiny-intl/core

A tiny (~1kB gzipped) library to translate or transform strings, dates and numbers based on native Intl.

## Installation

```bash
npm install @tiny-intl/core
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
import { createTinyIntl, detectBrowserLocale } from '@tiny-intl/core';

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

// Or plural
intl.tc('document', 2); // Documents
intl.tc('plusXDocumentsSelected', 3, { title: 'My-Doc' }); // My-Doc and 3 other documents selected
intl.tc('plusXDocumentsSelected', 1, { title: 'My-Doc' }); // My-Doc and one other document selected
```

### Formatting dates and date-times

Look at [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat) for more options.

> [!IMPORTANT]  
> intl.d is deprecated and will be deleted in next major version. Use intl.dt instead.

```js
intl.dt(new Date(), { dateStyle: 'full' }); // Tuesday, April 6, 2021
```

### Relative Time Formatting

Look at [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat) for more options.

```js
const myDate = new Date('2023-10-17T21:44:00.000z');

intl.rt(myDate); // 1 day ago
```

### Formatting numbers

Look at [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat) for more options.

```js
intl.n(123456.789, { style: 'currency', currency: 'EUR' }); // €123,456.79
```

### Sorting

Look at [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Collator) for more options.

```js
const list = intl.sort(['Z', 'a', 'z', 'ä'], { caseFirst: 'upper' }); // en-US: ['a', 'ä', 'Z', 'z'], swedish: ['a', 'Z', 'z', 'ä']

// for complex lists
const collator = intl.collator({ caseFirst: 'upper' });
const complexList = [{ name: 'Z' }, { name: 'a' }].sort((a, b) => collator(a.name, b.name)); // [{ name: 'a' }, { name: 'Z' }]
```

### List Format

Look at [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/ListFormat) for more options.

```js
intl.list(['a', 'b', 'c']); // a, b, and c

// disjunction
intl.list(['a', 'b', 'c'], 'OR'); // a, b, or c
intl.list(['a', 'b', 'c'], { type: 'disjunction' }); // a, b, or c

// unit
intl.list(['a', 'b', 'c'], { type: 'unit', style: 'narrow' }); // a b c
```

### Listen to locale changes

```js
const unsubscribe = intl.subscribe(() => {
  console.log(intl.getLocale()); // de-DE
});

await intl.change('de-DE'); // de-DE

unsubscribe(); // stop listening
```
