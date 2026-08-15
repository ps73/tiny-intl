# Plan 010: Make the documented `zero` plural key actually reachable

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed as in scope. If any STOP condition occurs, stop and
> report — do not improvise.
>
> **Drift check (run first)**:
> `git diff --stat bd386af..HEAD -- packages/core scripts`

## Status

- **Priority**: P1 — a documented, typed API that silently does nothing
- **Effort**: S
- **Risk**: MED — changes `tc()` output for existing dictionaries that define
  `zero`, and **will trip the bundle-size budget** (deliberately; see Step 4)
- **Depends on**: plans 001–009 (merged into `main` at `bd386af`)
- **Category**: bug
- **Planned at**: commit `bd386af`, 2026-08-12

## Why this matters

Every README in this repo advertises the `zero` plural key:

```json
"document": {
  "one": "Document",
  "other": "Documents"
  // supports also zero, two, few, many
}
```

`TinyIntlPluralDefinition` exposes it as `zero?: string`
(`packages/core/src/createTinyIntl.ts:5-12`), and every test fixture defines it.

**It is unreachable in English and German** — the two locales the project's own
examples use. Verified directly:

```
$ node -e "console.log(new Intl.PluralRules('de-DE').select(0))"
other
$ node -e "console.log(new Intl.PluralRules('en-US').select(0))"
other
```

CLDR gives neither locale a `zero` category — that category exists only for
languages like Arabic, Latvian and Welsh. And `tc()` maps straight through
`pluralRules.select(count)` with no special case for 0
(`packages/core/src/createTinyIntl.ts:120-127`):

```ts
  function tc(key: string, count: number, templateParams?: TinyIntlTranslateTemplate): string {
    const pluralKey = pluralRules.select(count);
    const tKey = `${key}.${pluralKey}`;
    return t(tKey, {
      count,
      ...templateParams,
    });
  }
```

So a user who writes what the docs imply —

```json
"document": { "zero": "No documents", "one": "1 document", "other": "{{count}} documents" }
```

— and calls `tc('document', 0)` gets **"0 documents"**, never "No documents".
The key they wrote is dead, with no error and no warning.

The fix: when `count` is 0 **and** the dictionary defines a `zero` entry for that
key, use it; otherwise fall back to the CLDR category exactly as today. Locales
that genuinely have a CLDR `zero` category are unaffected — `select(0)` already
returns `'zero'` there, so both paths agree.

This is the same special-case i18next and friends make, and it is what the docs
have been promising all along.

## Current state

### The function to change — `packages/core/src/createTinyIntl.ts:120-127`

Quoted in full above.

### `t()`, which `tc()` delegates to — `packages/core/src/createTinyIntl.ts:115-118`

```ts
  function t(key: string, templateParams?: TinyIntlTranslateTemplate): string {
    const value = dict[key] || dict[`${key}.one`] || `[${key}]`;
    return template(value, templateParams || {});
  }
```

Note it uses `||`, so an **empty-string** translation is treated as missing. That
is a separate known issue (deferred finding 4) and is **out of scope** — but it
means your presence check in Step 1 should use the same truthiness convention as
the rest of the file rather than introducing a stricter one for this key alone.

### `dict` is flat

`dict` is the flattened dictionary (`TinyIntlFlatDict`), so the entry you are
looking for is at the key `` `${key}.zero` ``, e.g. `document.zero`.

### ⚠ The existing fixtures cannot detect this bug

Every test fixture in the repo defines `zero` and `other` as the **same string**:

```ts
      document: {
        zero: 'Dokumente',
        one: 'Dokument',
        other: 'Dokumente',
      },
```

That is true in `packages/core/tests/index.test.ts` and in both adapters'
`tests/Translate.test.tsx`. Consequences:

- A test written against `document` **cannot** prove this fix — both branches
  return the same string.
- Conversely, the adapters' `count={0}` regression tests (added by plan 003,
  asserting `'Dokumente'`) keep passing after this change, because the `zero`
  entry they now hit holds that same value. **Do not modify the `document`
  fixture entry** — it is pinned by those adapter tests, which are out of scope.

So Step 2 adds a **new** fixture entry whose `zero` differs from its `other`.

### Conventions

- Prettier: `singleQuote: true`, `printWidth: 100`, `trailingComma: "all"`.
- Test style — `packages/core/tests/index.test.ts`: single
  `describe('@tiny-intl/core')`, per-test `{ expect }` fixture argument, `vi`
  imported from `vitest`, `afterEach` resetting the locale to `'en-US'`.
- Commitlint scopes: `core`, `react`, `preact`.
- The file starts with `/* eslint-disable @typescript-eslint/naming-convention */` — keep it.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm ci` | exit 0 |
| Build all | `npm run build` | exit 0 |
| Core tests | `npm run test --workspace @tiny-intl/core -- --run` | all pass |
| All tests | per-package, see Step 5 | 24+ / 14 / 14 |
| Size | `npm run size` | see Step 4 |
| Lint | `npm run lint:all` | exit 0 |

**Do not use root `npm test` to verify.** It is lerna-based, and lerna resolves
the workspace root to the *main checkout* rather than your worktree — it will
report the wrong tree's results. Always use
`npm run test --workspace <pkg> -- --run`.

## Scope

**In scope**:

- `packages/core/src/createTinyIntl.ts` — `tc()` only
- `packages/core/tests/index.test.ts` — additive: one new fixture entry + tests
- `packages/core/README.md` — document the special case
- `scripts/size-budget.json` — deliberate budget bump (Step 4)

**Out of scope**:

- **The `document` fixture entry** in any package — pinned by the adapters'
  plan-003 regression tests.
- `packages/react/**` and `packages/preact/**` entirely. The behaviour lives in
  core; the adapters inherit it and their existing tests still pass.
- `t()`'s `||` empty-string handling (deferred finding 4).
- `TinyIntlPluralDefinition` — `zero?: string` is already correct; this plan
  makes it *work*, it does not change the type.
- Any other `Intl` behaviour.

## Git workflow

- Conventional commits, scope `core`. Suggested:
  `fix(core): use the zero plural entry when count is 0`.
- The budget bump belongs in **the same commit** as the size increase that
  causes it, with the reason in the commit body.
- Do NOT push or open a PR.

## Steps

### Step 1: Change `tc()`

Replace the body of `tc` in `packages/core/src/createTinyIntl.ts`:

```ts
  function tc(key: string, count: number, templateParams?: TinyIntlTranslateTemplate): string {
    const zeroKey = `${key}.zero`;
    const tKey = count === 0 && dict[zeroKey] ? zeroKey : `${key}.${pluralRules.select(count)}`;
    return t(tKey, {
      count,
      ...templateParams,
    });
  }
```

Use `count === 0`, not `!count` — `!count` is also true for `NaN`, which should
keep falling through to `pluralRules.select` rather than silently rendering the
zero form.

The `dict[zeroKey]` truthiness check matches the convention `t()` already uses.

**Verify**:

```bash
npm run build --workspace @tiny-intl/core
npm run test --workspace @tiny-intl/core -- --run
```
→ build exits 0; **all 24 existing tests still pass**. They must, because every
existing fixture has `zero === other`. If any existing assertion changes, STOP —
that means a fixture distinguishes the two and you have altered pinned behaviour.

### Step 2: Add a fixture entry that can actually detect the bug

In `packages/core/tests/index.test.ts`, add a **new** key to the `loadDict`
fixture — do not touch `document` or `plusXDocumentsSelected`.

To the `en-US` / `sv-SE` branch:

```ts
      trash: {
        zero: 'Trash is empty',
        one: '1 item in trash',
        other: '{{count}} items in trash',
      },
```

To the `de-DE` branch:

```ts
      trash: {
        zero: 'Papierkorb ist leer',
        one: '1 Element im Papierkorb',
        other: '{{count}} Elemente im Papierkorb',
      },
```

The point is that `zero` and `other` now differ, so an assertion can tell which
branch ran.

### Step 3: Add the tests

In the same file, after the existing `'translate with plural rules'` test:

```ts
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
    await intl.change('en-US');
    // `plusXDocumentsSelected` has no zero entry in the de-DE fixture branch…
    await intl.change('de-DE');
    expect(intl.tc('plusXDocumentsSelected', 0, { title: 'My Doc' })).toBe(
      'My Doc und 0 weitere Dokumente ausgewählt',
    );
  });
```

**Check the second test against the actual fixture before relying on it.** Read
the `de-DE` branch of `loadDict`: if `plusXDocumentsSelected` *does* define a
`zero` entry there, this test proves nothing — in that case add a second new
fixture entry with **no** `zero` key (e.g. `folder: { one: …, other: … }`) and
assert `tc('folder', 0)` returns the `other` form. Say in your report which of
the two you used and why.

This second test is the important one: it proves the fix is additive and does
not hijack count-0 for dictionaries that never opted in.

**Verify**:

```bash
npm run test --workspace @tiny-intl/core -- --run
```
→ all pass, including the two new tests. Then prove they catch the bug:

```bash
git stash push -- packages/core/src/createTinyIntl.ts
npm run test --workspace @tiny-intl/core -- --run
```
→ the **first** new test must FAIL (`tc('trash', 0)` returns the `other` form).
The second must still pass. Record the failure output — that is the evidence the
test is meaningful.

```bash
git stash pop
npm run test --workspace @tiny-intl/core -- --run
```
→ all pass again.

### Step 4: Deal with the bundle-size budget — deliberately

`tc()` grew, so `@tiny-intl/core` will grow. Its budget has only **8 B** of
headroom (1422 B against 1430 B), so `npm run size` is expected to fail:

```bash
npm run build
npm run size; echo "exit=$?"
```

**Record the exact new size.** Then raise the budget in
`scripts/size-budget.json` to the new measured value **rounded up to the next
10 bytes** — the same convention the existing budgets use — and re-run:

```bash
npm run size; echo "exit=$?"
```
→ exits 0 with three `✓` rows.

This is the budget guard working as designed: growth is allowed, but it has to
be an explicit, reviewable edit. Put the reason in the commit body — something
like "core grows N B: tc() now prefers an explicit zero entry at count 0".

**If core grew by more than ~30 B**, STOP and report before bumping. That would
be far more than this change should cost, and suggests the implementation is
heavier than the one in Step 1.

Do **not** change the react or preact budgets — they are untouched by this and
must stay where they are.

### Step 5: Docs and full verification

Add a short note to `packages/core/README.md`, in the "Translating strings"
section right after the `intl.tc` examples, so the special case is discoverable:

```markdown
> [!NOTE]
> `zero` is honoured whenever `count` is `0` and the key defines a `zero` entry,
> even in locales whose CLDR plural rules have no `zero` category (English and
> German among them, where `0` otherwise selects `other`). Without a `zero`
> entry, `0` falls back to the locale's own category.
```

Then verify everything:

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

**Verify**: all exit 0. Core has 26 tests (24 + 2 new); **react 14 and preact 14
are unchanged** — the adapters must be completely unaffected. `git status` lists
only in-scope files.

## Test plan

- **File**: `packages/core/tests/index.test.ts` (additive only — `git diff`
  must show no deletions).
- **New fixture**: a `trash` entry whose `zero` differs from its `other`, in both
  locale branches. The existing `document` entry cannot detect this bug and is
  pinned by adapter tests.
- **Cases**:
  1. `tc('trash', 0)` → the `zero` string, in en-US and de-DE
  2. `tc('trash', 1)` and `tc('trash', 5)` → unchanged CLDR behaviour
  3. a key with **no** `zero` entry at count 0 → still the `other` form
- **Red-then-green**: Step 3 stashes the source change and confirms test 1 fails
  without it. Required in the report.
- **Regression protection**: the 24 existing core tests and both adapters' 14
  must pass unmodified.

## Done criteria

ALL must hold:

- [ ] `npm run test --workspace @tiny-intl/core -- --run` → 26 passing
- [ ] react 14 and preact 14 passing, unchanged
- [ ] `git diff bd386af..HEAD -- packages/core/tests/index.test.ts` shows **additions only**
- [ ] `git diff bd386af..HEAD -- packages/react packages/preact` → **no output**
- [ ] Step 3's stash test showed the first new test failing without the fix (output in report)
- [ ] `npm run size` exits 0; `scripts/size-budget.json` raised only for core, to the next 10 B above the measured value
- [ ] `npm run lint:all`, `npm run publint`, `npm run attw` all exit 0
- [ ] `git status --porcelain` lists only in-scope files

## STOP conditions

Stop and report back (do not improvise) if:

- Any of the 24 existing core tests changes result after Step 1.
- Any adapter test fails — the adapters should be entirely unaffected.
- `packages/core/src/createTinyIntl.ts:120-127` does not match the `tc` excerpt
  in "Current state".
- Core's bundle size grows by more than ~30 B.
- The stash check in Step 3 does **not** show the first new test failing.
- You find yourself wanting to edit the `document` fixture entry, `t()`, or
  anything under `packages/react` or `packages/preact`.

## Maintenance notes

- **This is a behaviour change for existing users** who already define `zero` in
  an en/de dictionary: they currently get the `other` string at count 0 and will
  now get their `zero` string. That is the behaviour the docs always described,
  and it only affects dictionaries that explicitly opted in by writing the key —
  but it belongs in the release notes.
- **Interaction with deferred finding 4**: because the presence check uses
  truthiness (matching `t()`), a deliberately **empty** `zero: ''` entry will not
  be picked up. If finding 4 is ever fixed by switching `t()` to `??`, switch
  this check at the same time and for the same reason.
- **`two`, `few` and `many` need no equivalent** — unlike `zero`, they are never
  selected for a fixed count the way `0` is; they map to genuine CLDR categories
  and reach dictionaries normally in the locales that have them.
- **What a reviewer should scrutinise**: that the fallback path is genuinely
  unchanged for keys without a `zero` entry, and that the budget bump is the
  minimum needed rather than a round-up with slack.
