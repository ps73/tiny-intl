# Plan 013: Treat empty-string dictionary values as present, and let a failed `mount()` be retried

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed as in scope. If any STOP condition occurs, stop and
> report — do not improvise.
>
> **Drift check (run first)**:
> `git diff --stat 7f5fdba..HEAD -- packages/core README.md scripts`

## Status

- **Priority**: P1 — both raised as blocking findings in review of PR #7
- **Effort**: S
- **Risk**: MED — changes what `t()` returns for empty translations, which is a
  behaviour change; and **may trip the size budget** (deliberately, Step 5)
- **Depends on**: plans 001–012 (merged into `main` at `7f5fdba`)
- **Category**: bug
- **Planned at**: commit `7f5fdba`, 2026-08-15

## Why this matters

Review of PR #7 raised two correctness findings. Both reproduce.

### 1. Empty-string values are treated as missing

`tc()` decides whether a `zero` entry exists using **truthiness**
(`packages/core/src/createTinyIntl.ts:130`):

```ts
    const tKey = count === 0 && dict[zeroKey] ? zeroKey : `${key}.${pluralRules.select(count)}`;
```

An empty string is a legitimate translation — "render nothing here" is a real
localisation need, and it is common for a language to omit a word another
language requires. Reproduced against the built package:

```
dict = { trash: { zero: '', one: '1 item', other: '{{count}} items' } }
tc('trash', 0)  →  "0 items"        // expected ""
```

This directly contradicts the note plan 010 added to `packages/core/README.md`,
which promises the `zero` entry is used "whenever `count` is `0` and the key
defines a `zero` entry". The key *is* defined. That inconsistency is ours, and
it shipped in the same plan that wrote the promise.

The same truthiness pattern sits in `t()` (line 116) and `template()` (line 111):

```ts
    const value = dict[key] || dict[`${key}.one`] || `[${key}]`;
    …
      (_, key: string) => templateParams[key]?.toString() || `[${key}]`,
```

```
t('nothing')  where dict = { nothing: '' }   →  "[nothing]"   // expected ""
```

So an empty translation renders as a **missing-key marker**, and an empty
template parameter renders as `[name]`.

**These are all fixable at zero byte cost.** `??` is the same length as `||` and
differs only for `''` — exactly the case that is wrong today. For `tc()`, the
`in` operator is a true presence check and is two characters longer than the
truthiness test.

### 2. A failed `mount()` can never be retried

Plan 011 made `mount()` re-entrant by caching the in-flight promise
(`packages/core/src/createTinyIntl.ts:235-240`):

```ts
  async function mount() {
    if (!mountPromise) {
      mountPromise = change(detectDefaultLocale(), undefined, true).then(() => undefined);
    }
    return mountPromise;
  }
```

If `loadDict` rejects — a network blip fetching a dictionary chunk, the single
most likely runtime failure in this library — `mountPromise` holds a **rejected
promise forever**. Every subsequent `mount()` returns that same rejection. There
is no way to recover without constructing a new instance.

For context, the pre-plan-011 behaviour was different but no better: `mounted`
was set before the await, so a failed mount left the instance permanently
"mounted" with an empty dictionary, failing silently. Neither version can retry.
Clearing the cached promise on rejection makes retry possible for the first
time.

## Current state

The three truthiness sites and `mount()` are quoted above. Note `dict` is a flat
`TinyIntlFlatDict` (`{ [key: string]: string }`) produced by `flattie`, so
values are always strings or absent.

### Conventions

- Prettier: `singleQuote: true`, `printWidth: 100`, `trailingComma: "all"`.
- Test style — `packages/core/tests/index.test.ts`: single
  `describe('@tiny-intl/core')`, per-test `{ expect }` fixture, `vi` from
  `vitest`, `afterEach` resetting to `'en-US'`.
- Commitlint scope: `core` (or none for the root README).
- **Never use root `npm test` to verify from a worktree** — it is lerna-based and
  reports the main checkout's results. Use
  `npm run test --workspace <pkg> -- --run`.

## Scope

**In scope**:

- `packages/core/src/createTinyIntl.ts` — `t()`, `template()`, `tc()`, `mount()`
- `packages/core/tests/index.test.ts` — additive tests
- `README.md` (root) — one wording nit (Step 6)
- `scripts/size-budget.json` — deliberate bump if needed (Step 5)

**Out of scope**:

- `packages/react/**`, `packages/preact/**` — no adapter changes; their 28 tests
  must pass untouched.
- The formatter caches, `flattie`, `change()`'s generation guard.
- `packages/core/README.md` — its note becomes *correct* as a result of this
  change; do not reword it.
- The deprecated `d` alias.

## Git workflow

- Conventional commits. Suggested: `fix(core): treat empty strings as present
  values`, `fix(core): allow mount() to be retried after a failed load`.
- Any budget bump goes in the same commit as the growth, reason in the body.
- Do NOT push or open a PR.

## Steps

### Step 1: Reproduce both findings

```bash
npm ci
npm run build
node -e "
const {createTinyIntl}=require('./packages/core/lib/cjs/index.js');
(async()=>{
const i=createTinyIntl({fallbackLocale:'en-US',supportedLocales:['en-US'],
  loadDict:()=>({trash:{zero:'',one:'1 item',other:'{{count}} items'},nothing:''})});
await i.mount();
console.log('tc zero:', JSON.stringify(i.tc('trash',0)));
console.log('t empty:', JSON.stringify(i.t('nothing')));
})()"
```

**Expected**: `tc zero: "0 items"` and `t empty: "[nothing]"`. Record both. If
either already returns `""`, STOP — the diagnosis is stale.

### Step 2: Use presence semantics instead of truthiness

Three edits in `packages/core/src/createTinyIntl.ts`:

`template()`:
```ts
      (_, key: string) => templateParams[key]?.toString() ?? `[${key}]`,
```

`t()`:
```ts
    const value = dict[key] ?? dict[`${key}.one`] ?? `[${key}]`;
```

`tc()`:
```ts
    const tKey = count === 0 && zeroKey in dict ? zeroKey : `${key}.${pluralRules.select(count)}`;
```

`??` is byte-identical to `||` after minification and differs only for `''`.
`in` is a genuine presence check; it is safe here because the probed key always
ends in `.zero`, which no `Object.prototype` member can match.

**Verify**:

```bash
npm run build --workspace @tiny-intl/core
npm run test --workspace @tiny-intl/core -- --run
```
→ build exits 0; **all 30 existing tests pass unchanged**. If any existing test
changes result, STOP and report which — that would mean a fixture relies on an
empty value being treated as missing.

### Step 3: Let a failed `mount()` be retried

```ts
  async function mount() {
    if (!mountPromise) {
      mountPromise = change(detectDefaultLocale(), undefined, true).then(
        () => undefined,
        (err) => {
          mountPromise = undefined;
          throw err;
        },
      );
    }
    return mountPromise;
  }
```

The rejection handler clears the cache **before** rethrowing, so the caller still
sees the error and a later `mount()` starts a fresh load. Concurrent callers
already holding the promise still get the rejection — only *subsequent* calls
retry.

**Verify**: `npm run test --workspace @tiny-intl/core -- --run` → still 30
passing, including the existing re-entrancy test from plan 011.

### Step 4: Add tests

Additive only. Four cases:

```ts
  it('treats an empty string as a present translation', async ({ expect }) => {
    const empty = createTinyIntl<'en-US'>({
      fallbackLocale: 'en-US',
      supportedLocales: ['en-US'],
      loadDict: () => ({
        blank: '',
        trash: { zero: '', one: '1 item', other: '{{count}} items' },
        greet: 'Hi{{suffix}}',
      }),
    });
    await empty.mount();
    expect(empty.t('blank')).toBe('');
    expect(empty.tc('trash', 0)).toBe('');
    expect(empty.tc('trash', 2)).toBe('2 items');
    expect(empty.t('greet', { suffix: '' })).toBe('Hi');
    expect(empty.t('missing')).toBe('[missing]'); // genuinely absent keys unchanged
  });

  it('allows mount() to be retried after a failed load', async ({ expect }) => {
    let attempt = 0;
    const flaky = createTinyIntl<'en-US'>({
      fallbackLocale: 'en-US',
      supportedLocales: ['en-US'],
      loadDict: () => {
        attempt += 1;
        if (attempt === 1) return Promise.reject(new Error('network'));
        return Promise.resolve({ hello: 'Hello' });
      },
    });

    await expect(flaky.mount()).rejects.toThrow('network');
    await flaky.mount();
    expect(flaky.t('hello')).toBe('Hello');
    expect(attempt).toBe(2);
  });
```

The last assertion in the first test matters: a genuinely **absent** key must
still produce the `[key]` marker. The fix must distinguish "empty" from
"missing", not collapse them.

**Verify the tests are meaningful**:

```bash
git stash push -- packages/core/src/createTinyIntl.ts
npm run test --workspace @tiny-intl/core -- --run
git stash pop
```
→ with the source reverted, **both new tests must FAIL**. Record the output. Then
restore and confirm everything passes.

### Step 5: Bundle-size budget

```bash
npm run build
npm run size; echo "exit=$?"
```

The `??` swaps are byte-neutral; `in` and the rejection handler are not. Core has
9 B of headroom (1461 B against 1470 B), so this may or may not trip.

- If it passes, change nothing.
- If it fails, record the new size, raise **only** the core entry to the measured
  value rounded up to the next 10 B, and re-run → exit 0.

**If core grew by more than 40 B, STOP and report before bumping.**

### Step 6: Fix the root README wording

`README.md` currently says:

```markdown
> `@tiny-intl/solid-js` was removed in the next release. Published versions up
> to 1.2.0 remain installable from npm but are no longer maintained.
```

"in the next release" is written from the perspective of an unreleased change and
goes stale the moment this merges. Change the first sentence to:

```markdown
> `@tiny-intl/solid-js` has been removed. Published versions up
```

Leave the second sentence as it is.

**Verify**: `grep -c "in the next release" README.md` → `0`.

### Step 7: Full verification

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

**Verify**: all exit 0; core has 32 tests (30 + 2); **react 14 and preact 14
unchanged**; `git status` lists only in-scope files.

## Test plan

- **File**: `packages/core/tests/index.test.ts`, additive only.
- **Cases**: empty translation, empty `zero` entry, empty template parameter,
  absent key still marked `[key]`, and `mount()` retry after rejection.
- **Red-then-green**: Step 4 requires both new tests to fail with the source
  reverted. Required in the report.
- **Regression protection**: the 30 existing core tests and both adapters' 14
  must pass unmodified.

## Done criteria

ALL must hold:

- [ ] `grep -c 'dict\[key\] ||' packages/core/src/createTinyIntl.ts` → `0`
- [ ] `grep -c 'zeroKey in dict' packages/core/src/createTinyIntl.ts` → `1`
- [ ] `grep -c "in the next release" README.md` → `0`
- [ ] Core tests → 32 passing; react 14 and preact 14 unchanged
- [ ] Step 4's stash run showed **both** new tests failing (output in report)
- [ ] `npm run size` exits 0
- [ ] `npm run lint:all`, `npm run publint`, `npm run attw` exit 0
- [ ] `git diff` on the test file shows additions only
- [ ] `git status --porcelain` lists only in-scope files

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1 does not reproduce both findings.
- Any of the 30 existing core tests changes result after Step 2.
- Any adapter test fails.
- Either new test passes without the fix.
- Core grows more than 40 B.
- You find yourself wanting to edit an adapter, the caches, `change()`, or
  `packages/core/README.md`.

## Maintenance notes

- **Behaviour change worth a release note**: an empty-string translation now
  renders as an empty string instead of `[key]`. Dictionaries that used `''` as
  an accidental placeholder — expecting the marker to reveal it — will silently
  render nothing instead. That is the correct semantics, but it is a change.
- **`in` versus `Object.hasOwn`**: `in` walks the prototype chain. It is safe
  here only because the probed key always ends in `.zero`. If the lookup shape
  ever changes, switch to `Object.hasOwn` and pay the bytes.
- **What a reviewer should scrutinise**: that a genuinely absent key still yields
  `[key]`, and that the `mount()` rejection handler clears the cache *before*
  rethrowing rather than after.
