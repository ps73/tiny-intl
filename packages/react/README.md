# @tiny-intl/react

A tiny library to translate or transform strings, dates and numbers based on native Intl.

## Installation

```bash
npm install @tiny-intl/react
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
import { TinyIntlContext } from '@tiny-intl/react';

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
  const [i18nMounted, setI18nMounted] = useState(false);

  useEffect(() => {
    intl.mount().then(() => {
      setI18nMounted(true);
    });
  }, []);

  return (
    <TinyIntlContext.Provider value={intl}>
      {i18nMounted && <AppContent />}
    </TinyIntlContext.Provider>
  );
};
```

### Translating strings

This package uses native plural rules from Intl [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules).

```jsx
import { useIntl, Translate } from '@tiny-intl/react';

// via hook
// MyComponent will re-render on locale change
const MyComponent = () => {
  const { t, tc } = useIntl();

  return (
    <div>
      {/* Hello John! */}
      {t('hello', { name: 'John' })}
      {/* Documents */}
      {tc('document', 2)}
    </div>
  );
};

// via component
// MyComponent will not re-render on locale change
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
import { useIntl } from '@tiny-intl/react';

// via hook
// MyComponent will re-render on locale change
const MyComponent = () => {
  const { dt } = useIntl();

  return (
    <div>
      {/* Tuesday, April 6, 2021 */}
      {dt(new Date(), { dateStyle: 'full' })}
    </div>
  );
};

// via component
// MyComponent will not re-render on locale change
const MyComponent = () => {
  return (
    <div>
      {/* Tuesday, April 6, 2021 */}
      <Translate date={new Date()} options={{ dateStyle: 'fullDate' }} />
    </div>
  );
};
```

### Relative Time Formatting

Look at [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat) for more options.

```jsx
import { useIntl } from '@tiny-intl/react';

// via hook
// MyComponent will re-render on locale change
const MyComponent = () => {
  const { rt } = useIntl();
  const date = new Date('2023-10-18T21:44:00.000z');

  return (
    <div>
      {/* 1 day ago */}
      {rt(date)}
    </div>
  );
};

// via component
// MyComponent will not re-render on locale change
const MyComponent = () => {
  return (
    <div>
      {/* 1 day ago */}
      <Translate date={new Date()} relative options={{}} />
    </div>
  );
};
```

### Formatting numbers

Look at [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat) for more options.

```jsx
import { useIntl } from '@tiny-intl/react';

// via hook
// MyComponent will re-render on locale change
const MyComponent = () => {
  const { n } = useIntl();

  return (
    <div>
      {/* €123,456.79 */}
      {n(123456.789, { style: 'currency', currency: 'EUR' })}
    </div>
  );
};

// via component
// MyComponent will not re-render on locale change
const MyComponent = () => {
  return (
    <div>
      {/* €123,456.79 */}
      <Translate number={123456.789} options={{ style: 'currency', currency: 'EUR' }} />
    </div>
  );
};
```

### List Formatting

Look at [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/ListFormat) for more options.

> [!NOTE]  
> Only available via hook.

```jsx
import { useIntl } from '@tiny-intl/react';

// via hook
// MyComponent will re-render on locale change
const MyComponent = () => {
  const { list } = useIntl();

  return (
    <div>
      {/* a, b, and c */}
      {list(['a', 'b', 'c'])}
      {/* a, b, or c */}
      {list(['a', 'b', 'c'], 'OR')}
      {/* a b c */}
      {list(['a', 'b', 'c'], { type: 'unit', style: 'narrow' })}
    </div>
  );
};
```

### Sorting

Look at [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Collator) for more options.

> [!NOTE]
> Only available via hook.

```jsx
import { useIntl } from '@tiny-intl/react';

// via hook
// MyComponent will re-render on locale change
const MyComponent = () => {
  const { sort, collator } = useIntl();

  return (
    <div>
      {/* en-US: ['a', 'ä', 'Z', 'z'], swedish: ['a', 'Z', 'z', 'ä'] */}
      {sort(['Z', 'a', 'z', 'ä'], { caseFirst: 'upper' })}
      {/* [{ name: 'a' }, { name: 'Z' }] */}
      {[{ name: 'Z' }, { name: 'a' }].sort((a, b) => collator(a.name, b.name))}
    </div>
  );
};
```

### Change locale

```jsx
import { useIntl } from '@tiny-intl/react';

const MyComponent = () => {
  const { change } = useIntl();

  return (
    <div>
      <button onClick={() => change('de-DE')}>German</button>
    </div>
  );
};
```
