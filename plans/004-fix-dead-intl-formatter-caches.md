# Plan 004: Fix the five `Intl` formatter caches in core — every one is written with one key and read with another, so none of them ever hits

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 794eb48..HEAD -- packages/core/src/createTinyIntl.ts packages/core/tests`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW — output values are unchanged; only the number of `Intl`
  constructions changes. The caches are already cleared on every locale change,
  so keying purely by options is correct.
- **Depends on**: none (core already has a working vitest suite)
- **Category**: perf
- **Planned at**: commit `794eb48`, 2026-08-12

## Why this matters

`createTinyIntl` builds five `Map` caches so that repeated calls to `n()`,
`dt()`, `rt()`, `list()` and `collator()` reuse their `Intl.*Format` instances.
Constructing an `Intl` formatter is the expensive part of the operation — it
resolves locale data and builds the format pattern — while `.format()` on an
existing instance is comparatively cheap. That is why the cache exists.

The cache does not work. Each function computes a `cacheKey` from its options,
**writes** the formatter under `cacheKey`, and then **reads** with
`cache.get(locale)`. `locale` is a value like `'de-DE'`; the stored keys are
`'_'` or a JSON string like `'{"dateStyle":"full"}'`. They can never be equal,
so every lookup misses and a brand-new `Intl` formatter is constructed on
**every single call** to any of those five functions. The `Map`s fill up and are
never read.

For the library's core use case — a list view formatting a few hundred numbers
or dates per render — this is the difference between five formatter
constructions and several hundred. It is a one-character-per-site fix in a
package that advertises itself on being small and fast.

There is no correctness bug today: because the lookup always misses, the
formatter is always built with the caller's actual options. That also means the
naive "fix" of keying by `locale` would be actively wrong — it would return a
formatter built with someone else's options. The fix below keys by `cacheKey`
alone, which is safe precisely because `change()` clears all five caches.

## Current state

### Files and their roles

- `packages/core/src/createTinyIntl.ts` — the whole of `createTinyIntl`,
  including the five caches, the `newCacheKey` helper, and the `change()`
  function that clears them.
- `packages/core/tests/index.test.ts` — the existing suite; already covers the
  *output* of all five functions, so it protects this refactor. New tests here
  will assert the cache actually hits.

### Excerpt — `packages/core/src/createTinyIntl.ts:65-67` (the key helper)

```ts
function newCacheKey(v?: object | undefined) {
  return v ? JSON.stringify(v) : '_';
}
```

### Excerpt — `packages/core/src/createTinyIntl.ts:78-97` (the caches, and where they are cleared)

```ts
  const numberFormatCache = new Map<string, Intl.NumberFormat>();
  const dateTimeFormatCache = new Map<string, Intl.DateTimeFormat>();
  const relativeTimeFormatCache = new Map<string, Intl.RelativeTimeFormat>();
  const listFormatCache = new Map<string, Intl.ListFormat>();
  const collatorCache = new Map<string, Intl.Collator>();
```

```ts
  async function change(nextLocale: Locales, staticDict?: TinyIntlDict, forceLoad = false) {
    if (locale === nextLocale && !forceLoad) {
      return dict;
    }
    locale = nextLocale;
    pluralRules = new Intl.PluralRules(locale);
    numberFormatCache.clear();
    dateTimeFormatCache.clear();
    relativeTimeFormatCache.clear();
    numberFormatCache.clear();          // <-- line 95: duplicate of line 92
    listFormatCache.clear();
    collatorCache.clear();
```

Every cache is cleared whenever the locale changes — which is what makes
"key by options only" correct. Line 95 clears `numberFormatCache` a second time;
line 92 already did. Harmless, but it is the reason no one noticed that no cache
was clearing wrongly: all five *are* covered.

### Excerpt — `packages/core/src/createTinyIntl.ts:129-206` (the five broken sites)

```ts
  function n(number: number, options?: Intl.NumberFormatOptions): string {
    const cacheKey = newCacheKey(options);
    let formatter = numberFormatCache.get(locale);        // <-- reads `locale`
    if (!formatter) {
      formatter = new Intl.NumberFormat(locale, options);
      numberFormatCache.set(cacheKey, formatter);         // <-- writes `cacheKey`
    }
    return formatter.format(number);
  }

  function dt(date: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
    const dateValue = new Date(date);
    const cacheKey = newCacheKey(options);
    let formatter = dateTimeFormatCache.get(locale);      // <-- same
    if (!formatter) {
      formatter = new Intl.DateTimeFormat(locale, options);
      dateTimeFormatCache.set(cacheKey, formatter);
    }
    return formatter.format(dateValue);
  }

  // Intl.RelativeTimeFormat is not supported in Safari < 14 or on MacOS < 11
  function rt(date: Date | string | number, options?: TinyIntlRelativeTimeFormatOptions): string {
    const { fallback, ...rtOptions } = options || {};
    const [value, unit] = automaticRelativeTimeFormat(date);
    if (!Intl.RelativeTimeFormat) {
      console.warn('Intl.RelativeTimeFormat is not supported in this browser');
      if (fallback) {
        return fallback(value, unit);
      }
      return '';
    }
    const cacheKey = newCacheKey(rtOptions);
    let formatter = relativeTimeFormatCache.get(locale);  // <-- same
    if (!formatter) {
      formatter = new Intl.RelativeTimeFormat(locale, rtOptions);
      relativeTimeFormatCache.set(cacheKey, formatter);
    }
    return formatter.format(value, unit);
  }

  function collator(options?: Intl.CollatorOptions) {
    if (!Intl.Collator) {
      console.warn('Intl.Collator is not supported in this browser');
      return (x: string, y: string) => x.localeCompare(y);
    }
    const cacheKey = newCacheKey(options || {});          // <-- note: `|| {}`
    let formatter = collatorCache.get(locale);            // <-- same
    if (!formatter) {
      formatter = new Intl.Collator(locale, options);
      collatorCache.set(cacheKey, formatter);
    }
    return formatter.compare;
  }

  function list(items: string[], options?: Intl.ListFormatOptions | 'AND' | 'OR') {
    if (!Intl.ListFormat) {
      console.warn('Intl.ListFormat is not supported in this browser');
      return items.join(', ');
    }
    let type: 'conjunction' | 'disjunction' = 'conjunction';
    if (options === 'OR') {
      type = 'disjunction';
    }
    const intlOptions = typeof options === 'string' ? ({ type, style: 'long' } as const) : options;
    const cacheKey = newCacheKey(intlOptions);
    let formatter = listFormatCache.get(locale);          // <-- same
    if (!formatter) {
      formatter = new Intl.ListFormat(locale, intlOptions);
      listFormatCache.set(cacheKey, formatter);
    }
    return formatter.format(items);
  }
```

Note `collator` uses `newCacheKey(options || {})` while the other four use
`newCacheKey(options)`. That produces the key `'{}'` for a no-options call where
the others produce `'_'` — a cosmetic inconsistency worth normalising while you
are here.

### Conventions

- The file starts with `/* eslint-disable @typescript-eslint/naming-convention */`
  — keep it.
- Prettier: `singleQuote: true`, `printWidth: 100`, `trailingComma: "all"`;
  2-space indent.
- Test style: see `packages/core/tests/index.test.ts` — `describe('@tiny-intl/core')`,
  per-test `{ expect }` fixture argument (not an import), `vi` imported from
  `vitest` for stubbing, `afterEach` resetting the locale to `'en-US'`.

## Commands you will need

> Read from `package.json` during planning; `node_modules` was not installed at
> planning time, so these were not executed.

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm install` | exit 0 |
| Core tests | `npm run test --workspace @tiny-intl/core -- --run` | all pass |
| Core coverage | `npm run coverage --workspace @tiny-intl/core` | exit 0 |
| Core build (also typechecks) | `npm run build --workspace @tiny-intl/core` | exit 0 |
| Lint | `npm run lint:all` (or `npm run lint -- packages/core`) | exit 0 |

## Scope

**In scope** (the only files you should modify):

- `packages/core/src/createTinyIntl.ts`
- `packages/core/tests/index.test.ts`
- `plans/README.md` — status row only

**Out of scope** (do NOT touch, even though they look related):

- **`change()`'s early return and its `forceLoad` parameter.** There is a
  separate known issue there (a lost-update race, and `staticDict` being
  silently dropped when the locale is unchanged) recorded in `plans/README.md`.
  Touching `change()` beyond deleting the one duplicate `.clear()` line will
  collide with that work.
- Cache eviction / size bounds. The maps are unbounded by design; see
  Maintenance notes.
- The `console.warn` calls in `rt`, `collator` and `list` — noisy, but changing
  them changes observable behaviour that the existing test at
  `packages/core/tests/index.test.ts:176-208` depends on.
- Anything under `packages/react` or `packages/preact` (or `packages/solid-js`,
  if it is still present — plan 002 deletes it).

## Git workflow

- Branch: `advisor/004-fix-dead-intl-formatter-caches`
- Conventional commits (commitlint enforced). Prior art in `git log`:
  `fix(core): improved performance by using param for initial dict loading`.
  Suggested: `fix(core): read Intl formatter caches with the key they are written with`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Write the failing cache-hit tests first

Add a new block to `packages/core/tests/index.test.ts`, inside the existing
`describe('@tiny-intl/core')`. It must prove the cache hits by counting
constructor calls:

```ts
  it('reuses cached Intl formatters', async ({ expect }) => {
    await intl.change('en-US');

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
```

Repeat the same shape for `Intl.DateTimeFormat` (via `intl.dt`),
`Intl.RelativeTimeFormat` (via `intl.rt` — stub `Date.now` as at
`packages/core/tests/index.test.ts:119-129`), `Intl.ListFormat` (via
`intl.list`) and `Intl.Collator` (via `intl.collator`). Five tests, or one test
with five sections.

Add one more test proving the cache is invalidated on locale change:

```ts
  it('rebuilds Intl formatters after a locale change', async ({ expect }) => {
    await intl.change('en-US');
    const spy = vi.spyOn(Intl, 'NumberFormat');
    intl.n(1000);
    await intl.change('de-DE');
    intl.n(1000);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
```

If `vi.spyOn(Intl, 'NumberFormat')` does not work with `new` in vitest 0.34,
fall back to `vi.stubGlobal` with a hand-rolled counting wrapper that delegates
to the original constructor — the same `vi.stubGlobal` technique the suite
already uses for `navigator` at `packages/core/tests/index.test.ts:258`. Note
which approach you used in your report.

**Verify**: `npm run test --workspace @tiny-intl/core -- --run` → the new
cache-hit tests **fail**, each reporting 3 (or 2) constructor calls where 1 was
expected. The locale-change test should already pass. If the cache-hit tests
pass before the fix, STOP — the bug does not reproduce.

### Step 2: Read each cache with the key it is written with

In `packages/core/src/createTinyIntl.ts`, change five lines. In each function,
the `.get(locale)` becomes `.get(cacheKey)`:

| Line | Function | From | To |
|---|---|---|---|
| 131 | `n` | `numberFormatCache.get(locale)` | `numberFormatCache.get(cacheKey)` |
| 142 | `dt` | `dateTimeFormatCache.get(locale)` | `dateTimeFormatCache.get(cacheKey)` |
| 162 | `rt` | `relativeTimeFormatCache.get(locale)` | `relativeTimeFormatCache.get(cacheKey)` |
| 176 | `collator` | `collatorCache.get(locale)` | `collatorCache.get(cacheKey)` |
| 200 | `list` | `listFormatCache.get(locale)` | `listFormatCache.get(cacheKey)` |

Do not change anything else in those functions — in particular, the `new Intl.*`
constructions must keep passing `locale` as their first argument. `locale` is
still the right thing to *construct* with; it is only wrong as a *lookup key*.

While in `collator` (line 175), normalise the key computation for consistency
with the other four:

```ts
    const cacheKey = newCacheKey(options);
```

(dropping the `|| {}`, so a no-options call keys as `'_'` like everywhere else).

**Verify**:

```bash
grep -n "Cache.get(locale)" packages/core/src/createTinyIntl.ts
```
→ no output.

```bash
grep -c "Cache.get(cacheKey)" packages/core/src/createTinyIntl.ts
```
→ `5`.

```bash
npm run test --workspace @tiny-intl/core -- --run
```
→ all tests pass, including the new cache-hit tests and all 18 pre-existing
tests. **The pre-existing tests are the real safety net here** — they assert
concrete formatted output for de-DE, en-US and sv-SE across numbers, dates,
relative times, sorting and lists. If any of them now fails, the caching change
has altered output and something is wrong.

### Step 3: Remove the duplicate cache clear

At `packages/core/src/createTinyIntl.ts:95`, delete the second
`numberFormatCache.clear();` (line 92 already does it). The block should end up
as exactly five `.clear()` calls, one per cache:

```ts
    numberFormatCache.clear();
    dateTimeFormatCache.clear();
    relativeTimeFormatCache.clear();
    listFormatCache.clear();
    collatorCache.clear();
```

Do not otherwise modify `change()`.

**Verify**:

```bash
grep -c "numberFormatCache.clear()" packages/core/src/createTinyIntl.ts
```
→ `1`.

### Step 4: Full verification

```bash
npm run build --workspace @tiny-intl/core
npm run coverage --workspace @tiny-intl/core
npm run lint:all
```

**Verify**: build exits 0; coverage run exits 0 with all tests passing; lint
exits 0.

## Test plan

- **File**: `packages/core/tests/index.test.ts` (existing).
- **Structural pattern**: the file itself — `describe('@tiny-intl/core')`,
  per-test `{ expect }` fixture, `vi` for stubbing, `afterEach` resetting to
  `'en-US'`. Place the new tests after the existing `'list formatting'` test so
  related concerns stay together.
- **New cases**:
  1. `n` constructs one `Intl.NumberFormat` across repeated identical calls
  2. …and a second for a different options object
  3. `dt` — same two properties
  4. `rt` — same two properties (with `Date.now` stubbed)
  5. `list` — same two properties
  6. `collator` — same two properties
  7. a locale change forces reconstruction
- **Regression protection**: the 18 pre-existing tests already pin the formatted
  output of every affected function in three locales. They must all still pass
  unmodified — do not adjust an existing assertion to accommodate this change.
- **Verification**: `npm run test --workspace @tiny-intl/core -- --run` → all
  pass, with ≥ 6 new tests.

## Done criteria

ALL must hold:

- [ ] `grep -n "Cache.get(locale)" packages/core/src/createTinyIntl.ts` → no output
- [ ] `grep -c "Cache.get(cacheKey)" packages/core/src/createTinyIntl.ts` → `5`
- [ ] `grep -c "numberFormatCache.clear()" packages/core/src/createTinyIntl.ts` → `1`
- [ ] `npm run test --workspace @tiny-intl/core -- --run` exits 0, with ≥ 6 new tests
- [ ] All 18 pre-existing core tests pass **without any assertion being modified**
      (`git diff packages/core/tests/index.test.ts` shows additions only)
- [ ] `npm run build --workspace @tiny-intl/core` exits 0
- [ ] `npm run lint:all` exits 0
- [ ] `git status --porcelain` lists only files from the In-scope list
- [ ] `plans/README.md` status row for 004 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The Step 1 cache-hit tests pass **before** the fix — the bug does not
  reproduce and the diagnosis is wrong.
- `packages/core/src/createTinyIntl.ts:131` does not read
  `let formatter = numberFormatCache.get(locale);` — the code has drifted.
- Any pre-existing test in `packages/core/tests/index.test.ts` fails after Step
  2. Do **not** edit that test to make it pass; the change has altered output,
  which it must not, and that needs investigating.
- You conclude the cache should be keyed by `` `${locale}:${cacheKey}` ``.
  It should not — `change()` clears every cache on locale change, so the locale
  is already implied. If you believe `change()` can be reached without clearing,
  report that finding instead of working around it.
- `vi.spyOn` on an `Intl` constructor cannot be made to work after two attempts
  with both the `spyOn` and `stubGlobal` approaches.

## Maintenance notes

- **Unbounded growth, accepted**: each cache now grows one entry per distinct
  options object per locale, cleared on every locale change. For normal usage
  (a handful of format configurations) that is a few entries. A caller
  generating options dynamically — e.g. `{ currency: order.currency }` across
  many currencies — would grow the map. If that ever becomes a real
  problem, an LRU bound is the fix; do not pre-emptively add one.
- **Key stability**: `newCacheKey` uses `JSON.stringify`, whose output depends
  on property insertion order. `{ style: 'currency', currency: 'EUR' }` and
  `{ currency: 'EUR', style: 'currency' }` produce different keys and therefore
  two formatters. Correct, just slightly wasteful. Sorting keys before
  stringifying would fix it, at the cost of doing more work on the hot path.
- **What a reviewer should scrutinise**: that every `new Intl.*(...)` call still
  receives `locale` as its first argument, and that the diff to the existing
  test file is additions only.
- If `change()` is ever refactored to *not* clear the caches (for example, to
  cache across locales), these keys must immediately become locale-qualified.
  That is the one change that would silently break this fix.
