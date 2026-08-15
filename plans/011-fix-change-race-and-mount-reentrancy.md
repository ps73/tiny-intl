# Plan 011: Fix `change()`'s lost-update race, its dropped `staticDict`, and `mount()`'s re-entrancy

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed as in scope. If any STOP condition occurs, stop and
> report — do not improvise.
>
> **Drift check (run first)**:
> `git diff --stat 5afc2ca..HEAD -- packages/core scripts`

## Status

- **Priority**: P1 — the last substantive correctness bugs in core
- **Effort**: M
- **Risk**: MED — changes async ordering and when subscribers fire; **will trip
  the bundle-size budget** (deliberately, Step 5)
- **Depends on**: plans 001–010 (merged into `main` at `5afc2ca`)
- **Category**: bug
- **Planned at**: commit `5afc2ca`, 2026-08-12

## Why this matters

`createTinyIntl` is sold on async dictionary loading — the documented pattern in
every README is `loadDict: async (loc) => (await import(\`./locales/${loc}.json\`)).default`.
That path has three defects, all in `packages/core/src/createTinyIntl.ts`.

### 1. Lost-update race (lines 86-106)

```ts
  async function change(nextLocale: Locales, staticDict?: TinyIntlDict, forceLoad = false) {
    if (locale === nextLocale && !forceLoad) {
      return dict;
    }
    locale = nextLocale;
    pluralRules = new Intl.PluralRules(locale);
    // …caches cleared…
    if (staticDict) {
      dict = flattie<TinyIntlFlatDict, TinyIntlDict>(staticDict);
    } else if (loadDict) {
      const nextDict = await loadDict(locale);
      dict = flattie<TinyIntlFlatDict, TinyIntlDict>(nextDict);
    }
    subscriptions.forEach((cb) => cb(locale));
    return dict;
  }
```

`locale` is assigned **before** the `await`, and nothing guards the assignment
after it. Two overlapping calls — a user clicking a language switcher twice, or a
route change racing a manual switch — interleave like this:

1. `change('de')` sets `locale = 'de'`, starts loading German
2. `change('en')` sets `locale = 'en'`, starts loading English
3. English resolves first → `dict` = English ✓
4. German resolves second → `dict` = **German** ✗

Final state: `locale === 'en'` with a German dictionary, and subscribers were
notified twice with conflicting results. The UI shows German while
`getLocale()` says English.

There is a second, subtler bug on the same line: `await loadDict(locale)` reads
the **mutable** `locale`, not the `nextLocale` parameter. A concurrent call that
reassigns `locale` between entry and this line makes a request for the wrong
locale entirely.

### 2. `staticDict` is silently dropped (line 87)

`change('de-DE', someDict)` while already on `de-DE` hits the early return and
**ignores `someDict` completely**. There is no way to swap the dictionary for the
current locale — the caller gets the old `dict` back with no error.

### 3. `mount()` is not re-entrancy-safe (lines 226-230)

```ts
  async function mount() {
    if (mounted) return;
    mounted = true;
    await change(detectDefaultLocale(), undefined, true);
  }
```

`mounted` is set **synchronously before** the await, so a second concurrent
`mount()` returns an already-resolved promise while the first is still loading.
The caller believes mounting finished and renders against an empty dictionary.

This is not hypothetical: both adapter READMEs tell users to call `mount()` in an
effect, and **React 18 StrictMode invokes effects twice in development**.

### There is also a type/runtime mismatch

The runtime `change` takes three parameters; the public type declares two
(`packages/core/src/createTinyIntl.ts:48`), so `forceLoad` is unreachable for
TypeScript consumers even though it exists.

## Current state

- `packages/core/src/createTinyIntl.ts:86-106` — `change`, quoted above.
- `packages/core/src/createTinyIntl.ts:226-230` — `mount`, quoted above.
- `packages/core/src/createTinyIntl.ts:75` — `let mounted = false;` (becomes
  unused; delete it).
- `packages/core/src/createTinyIntl.ts:48` — the public `change` type.
- Existing test at `packages/core/tests/index.test.ts` calls
  `await intl2.mount(); await intl2.mount();` and expects `de-DE` — that must
  keep passing.
- Existing `'static dict'` test does `change('en-US')` then
  `change('de-DE', {...})` — a real locale change, so it does **not** exercise
  bug 2. A new test must.

### Conventions

- Prettier: `singleQuote: true`, `printWidth: 100`, `trailingComma: "all"`.
- Test style — `packages/core/tests/index.test.ts`: single
  `describe('@tiny-intl/core')`, per-test `{ expect }` fixture, `vi` from
  `vitest`, `afterEach` resetting to `'en-US'`.
- File starts with `/* eslint-disable @typescript-eslint/naming-convention */` — keep it.
- Commitlint scope: `core`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm ci` | exit 0 |
| Build | `npm run build` | exit 0 |
| Core tests | `npm run test --workspace @tiny-intl/core -- --run` | all pass |
| Size | `npm run size` | see Step 5 |
| Lint | `npm run lint:all` | exit 0 |

**Never use root `npm test`** — it is lerna-based and reports the *main
checkout's* results from a worktree. Use the per-package form.

## Scope

**In scope**:

- `packages/core/src/createTinyIntl.ts` — `change`, `mount`, the `change` type,
  and the now-unused `mounted` variable
- `packages/core/tests/index.test.ts` — additive tests
- `scripts/size-budget.json` — deliberate core bump (Step 5)

**Out of scope**:

- `packages/react/**`, `packages/preact/**` — no adapter changes. Their existing
  28 tests must keep passing untouched.
- `t()`, `tc()`, the formatter caches, `flattie`.
- The deprecated `d` alias (a separate release decision).
- Making `locale` update *after* the load rather than before. That is a larger
  behavioural change — `getLocale()` currently updates synchronously and
  something may rely on it. Keep the synchronous assignment; this plan fixes the
  lost update, not the transient.

## Git workflow

- Conventional commits, scope `core`. Suggested:
  `fix(core): guard change() against lost updates and make mount() re-entrant`.
- The budget bump goes in **the same commit**, reason in the body.
- Do NOT push or open a PR.

## Steps

### Step 1: Add a generation guard to `change()`

Replace `change` in `packages/core/src/createTinyIntl.ts`. Add the counter
alongside the other closure state (near `let mounted = false;`):

```ts
  let generation = 0;
```

```ts
  async function change(nextLocale: Locales, staticDict?: TinyIntlDict, forceLoad = false) {
    if (locale === nextLocale && !forceLoad && !staticDict) {
      return dict;
    }
    generation += 1;
    const gen = generation;
    locale = nextLocale;
    pluralRules = new Intl.PluralRules(locale);
    numberFormatCache.clear();
    dateTimeFormatCache.clear();
    relativeTimeFormatCache.clear();
    listFormatCache.clear();
    collatorCache.clear();
    if (staticDict) {
      dict = flattie<TinyIntlFlatDict, TinyIntlDict>(staticDict);
    } else if (loadDict) {
      const nextDict = await loadDict(nextLocale);
      if (gen !== generation) {
        return dict;
      }
      dict = flattie<TinyIntlFlatDict, TinyIntlDict>(nextDict);
    }
    subscriptions.forEach((cb) => cb(locale));
    return dict;
  }
```

Four changes, each load-bearing:

1. `&& !staticDict` in the early return — fixes bug 2. Passing a dictionary is
   always meaningful, even for the current locale.
2. `generation += 1; const gen = generation;` — a monotonic token captured before
   the await.
3. `await loadDict(nextLocale)` — the **parameter**, not the mutable `locale`.
4. `if (gen !== generation) return dict;` — a superseded call discards its result
   and, critically, **returns before notifying subscribers**. Only the winning
   call notifies.

**Verify**:

```bash
npm run build --workspace @tiny-intl/core
npm run test --workspace @tiny-intl/core -- --run
```
→ build exits 0; **all 26 existing tests pass unchanged**. If any existing test
changes result, STOP — you have altered pinned behaviour.

### Step 2: Make `mount()` re-entrant

Replace the `mounted` flag with the in-flight promise. Delete
`let mounted = false;` and add:

```ts
  let mountPromise: Promise<void> | undefined;
```

```ts
  async function mount() {
    if (!mountPromise) {
      mountPromise = change(detectDefaultLocale(), undefined, true).then(() => undefined);
    }
    return mountPromise;
  }
```

Every caller now awaits the *same* promise, so a second `mount()` resolves only
when the first has actually finished loading. The `.then(() => undefined)` keeps
the public `Promise<void>` signature.

**Verify**: `grep -c "mounted" packages/core/src/createTinyIntl.ts` → `0`;
tests still pass, including the existing double-`mount()` test.

### Step 3: Expose `forceLoad` in the public type

At `packages/core/src/createTinyIntl.ts:48`:

```ts
  change: (
    locale: Locales,
    staticDict?: TinyIntlDict,
    forceLoad?: boolean,
  ) => Promise<TinyIntlFlatDict>;
```

Type-only — **zero runtime bytes**. It makes an already-existing parameter
reachable rather than adding anything.

**Verify**: `npm run build --workspace @tiny-intl/core` exits 0; the emitted
`packages/core/lib/esm/createTinyIntl.d.ts` shows the three-parameter signature.

### Step 4: Add tests

Add to `packages/core/tests/index.test.ts` — **additive only**, do not modify
existing tests or fixtures. You will need a `loadDict` you can stall on
purpose; build it locally inside each test rather than changing the shared
fixture. A deferred-promise helper is the clearest way:

```ts
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
```

Also add:

- **Subscribers fire once, for the winner only.** Same racy setup; subscribe a
  counting callback; run two overlapping changes; assert the callback saw only
  the winning locale and was not called for the superseded one.
- **`staticDict` applies for the current locale.** `await intl.change('de-DE')`,
  then `await intl.change('de-DE', { foo: 'bar' })`, then
  `expect(intl.t('foo')).toBe('bar')`. This fails before Step 1.
- **Concurrent `mount()` awaits one load.** A `loadDict` that counts calls and
  resolves on a deferred; call `mount()` twice **without awaiting between**;
  resolve; `await Promise.all([...])`; assert `loadDict` ran once and that the
  dictionary is populated when *both* promises have resolved. This fails before
  Step 2 — the second `mount()` resolves early.

**Verify** each new test is meaningful, one at a time:

```bash
git stash push -- packages/core/src/createTinyIntl.ts
npm run test --workspace @tiny-intl/core -- --run
git stash pop
```
→ with the source reverted, the **race test, the staticDict test and the
concurrent-mount test must all FAIL**. Record the output. If any of them passes
without the fix, it is not testing what it claims and must be rewritten.

Then restore and confirm everything passes.

### Step 5: Deal with the bundle-size budget — deliberately

Core will grow. Its budget is 1440 B with the current size at 1438 B, so
`npm run size` is expected to fail:

```bash
npm run build
npm run size; echo "exit=$?"
```

Record the exact new size, raise **only** the core entry in
`scripts/size-budget.json` to the measured value rounded up to the next 10 B,
and re-run → exits 0. Put the reason in the commit body.

**If core grew by more than 60 B, STOP and report before bumping.** This change
should cost roughly a counter, two comparisons and a promise field.

Do not touch the react or preact budgets.

### Step 6: Full verification

```bash
npm run build
npm run test --workspace @tiny-intl/core -- --run
npm run test --workspace @tiny-intl/react -- --run
npm run test --workspace @tiny-intl/preact -- --run
npm run lint:all
npm run publint
npm run attw
npm run size
git status --porcelain
```

**Verify**: all exit 0; core has 26 + your new tests; **react 14 and preact 14
unchanged**; `git status` lists only in-scope files.

## Test plan

- **File**: `packages/core/tests/index.test.ts`, additive only (`git diff` must
  show zero deletions).
- **Cases**: out-of-order load resolution; subscriber notified only for the
  winner; `staticDict` applied for the current locale; concurrent `mount()`
  sharing one load.
- **Red-then-green**: Step 4 stashes the source and requires three of the new
  tests to fail. Required in the report.
- **Regression protection**: 26 existing core tests and both adapters' 14 pass
  unmodified.

## Done criteria

ALL must hold:

- [ ] `grep -c "mounted" packages/core/src/createTinyIntl.ts` → `0`
- [ ] `grep -c "loadDict(nextLocale)" packages/core/src/createTinyIntl.ts` → `1`
- [ ] Core tests pass, ≥ 30 total
- [ ] react 14 and preact 14 passing, unchanged
- [ ] `git diff main..HEAD -- packages/core/tests/index.test.ts` shows additions only
- [ ] `git diff main..HEAD -- packages/react packages/preact` → no output
- [ ] Step 4's stash run showed the race, staticDict and mount tests failing (output in report)
- [ ] `npm run size` exits 0; only core's budget raised, to the next 10 B above measured
- [ ] `npm run lint:all`, `npm run publint`, `npm run attw` exit 0
- [ ] `git status --porcelain` lists only in-scope files

## STOP conditions

Stop and report back (do not improvise) if:

- Any of the 26 existing core tests changes result.
- Any adapter test fails.
- The source does not match the `change`/`mount` excerpts in "Why this matters".
- Core grows more than 60 B.
- Any of the three new tests passes *without* the fix.
- You find yourself wanting to defer the `locale` assignment until after the
  load, or to edit an adapter, `t()`, `tc()` or the caches.

## Maintenance notes

- **The transient is deliberately not fixed.** Between entry and the load
  resolving, `getLocale()` reports the new locale while `dict` still holds the
  old one. Deferring the assignment would fix that but changes when
  `getLocale()` updates — a bigger behavioural decision, and a candidate for the
  next major.
- **Subscriber semantics changed**: a superseded `change()` no longer notifies.
  That is the point — it previously notified with a locale whose dictionary it
  had just failed to install — but any consumer counting notifications will see
  fewer.
- **`change()` now honours `staticDict` for the current locale**, which is a
  behaviour change for anyone who relied on the no-op. Release notes.
- **What a reviewer should scrutinise**: that `loadDict` is called with
  `nextLocale` and not `locale`, and that the superseded branch returns *before*
  `subscriptions.forEach`.
