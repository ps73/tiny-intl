# Plan 001: Establish a working verification baseline — tests for the react and preact adapters, and a CI pipeline that runs them

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 794eb48..HEAD -- packages/react packages/preact .github package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (adds test/CI infrastructure only; no runtime source changes)
- **Depends on**: none. Assumes `plans/002-remove-solid-js-support.md` lands —
  see "A note on `packages/solid-js`" below.
- **Category**: tests
- **Planned at**: commit `794eb48`, 2026-08-12

## Why this matters

This repo publishes framework adapters to npm, and not one of them has a single
automated test. Only `@tiny-intl/core` has a suite, and CI runs only that one
package — it never lints, never typechecks, and never builds the adapters.

That gap has already shipped a broken package. The Solid adapter's `useIntl()`
returned `'[undefined]'` from every primitive it exposed
(`packages/solid-js/src/useIntl.tsx:22` called `fn.call(args)`, which passes the
argument array as `this` and forwards no arguments) — for its entire published
life. One render test would have caught it. That package is being deleted rather
than fixed (plan 002), but react and preact are built the same way, by the same
copy-paste, and have the same amount of coverage: none.

After this plan lands, `npm test` at the repo root runs a real suite for all
three remaining packages, CI runs lint + tests on every push, and plan 003 has a
verification gate to prove its fix works and stays fixed.

### A note on `packages/solid-js`

`plans/002-remove-solid-js-support.md` deletes that package. This plan therefore
covers **react and preact only** and never touches `packages/solid-js`, whether
or not 002 has run yet. There is no ordering constraint between the two plans.

If plan 002 is later rejected, `packages/solid-js` will be left with no test
harness and this plan must be re-scoped to add one — budget extra time for it,
because getting `vite-plugin-solid` to cooperate with vitest 0.34 is
substantially harder than the react/preact setup below.

## Current state

### Files and their roles

- `package.json` — root workspace manifest (npm workspaces + lerna). Has a `lint`
  script with **no target argument**, and no `test` script at all.
- `.github/workflows/unit-tests.yml` — the only CI workflow. Runs core's coverage
  script and nothing else, using deprecated action versions.
- `packages/core/vite.config.ts` — the only package with a vitest config
  (`test: {}` at the bottom, via `defineConfig` from `vitest/config`).
- `packages/core/tests/index.test.ts` — the only test file in the repo; **use it
  as the structural pattern** for all new tests.
- `packages/react/package.json`, `packages/preact/package.json` — no `test`
  script, no test runner in `devDependencies`.
- `packages/react/vite.config.ts`, `packages/preact/vite.config.ts` — build-only
  configs; `defineConfig` is imported from `vite`, not `vitest/config`, and there
  is no `test` key.

### Excerpt — root `package.json:5-13` (the lint script has no target)

```json
  "scripts": {
    "lint": "eslint --config ./.eslintrc.cjs --ignore-path ./.eslintignore --cache",
    "release": "lerna publish --no-private",
    "git-hooks:commit-msg": "commitlint --edit",
    "git-hooks:pre-commit": "lint-staged",
    "preversion": "lerna run coverage && lerna run build",
    "prepare": "husky install"
  },
```

`npm run lint` with no file arguments lints nothing. It only ever does work via
`.lintstagedrc`, which appends staged filenames:

```json
{
  "packages/**/*.{ts,tsx,js,jsx}": "npm run lint"
}
```

### Excerpt — `.github/workflows/unit-tests.yml` (entire file)

```yaml
name: Run unit tests

on:
  push:
    branches: ['*']
  pull_request:
    branches: ['*']
jobs:
  build:
    name: 'Run tests'
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [16, 18, 20, 21]

    steps:
    - name: checkout
      uses: actions/checkout@v4
    - name: restore caches
      uses: actions/cache@v2
      with:
        path: |
          ./node_modules
          ./.coverage
          ./.eslintcache
        key: ${{ runner.os }}-${{ matrix.node-version }}-${{ hashFiles('package-lock.json') }}
    - name: Run tests
      uses: actions/setup-node@v2
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'
    - run: npm install && cd packages/core && npm run coverage
```

Problems, all of which this plan fixes: `actions/cache@v2` and
`actions/setup-node@v2` run on the retired Node 16 action runtime; the cache step
runs *before* `setup-node` and duplicates `setup-node`'s own `cache: 'npm'`;
`npm install` is used despite a committed `package-lock.json`; the matrix
includes Node 16 and 21, both long past end-of-life; the step labelled
`Run tests` is actually the Node setup step; and only `packages/core` is tested.

### Excerpt — `packages/core/vite.config.ts` (the vitest config pattern to copy)

```ts
import { defineConfig } from 'vitest/config'; // eslint-disable-line import/no-unresolved

export default defineConfig({
  plugins: [ /* dts, visualizer */ ],
  build: { /* ... */ },
  test: {},
});
```

### Excerpt — `packages/core/tests/index.test.ts:1-6, 44-62` (the test style to match)

```ts
import type { TinyIntl, TinyIntlDict } from '../src';

import { vi, afterEach, describe, it } from 'vitest';

import { createTinyIntl, detectBrowserLocale, detectLocale } from '../src';
import { relativeTimeFormatForDiff } from '../src/utils';

describe('@tiny-intl/core', () => {
  let intl: TinyIntl<'en-US' | 'sv-SE' | 'de-DE'>;

  afterEach(async () => {
    await intl.change('en-US');
  });

  it('mount instance', async ({ expect }) => {
    intl = createTinyIntl<'en-US' | 'de-DE' | 'sv-SE'>({
      loadDict: (locale) => loadDict(locale),
      fallbackLocale: 'en-US',
      supportedLocales: ['en-US', 'de-DE', 'sv-SE'],
      detectLocale: (params) => detectLocale('en-US', params),
    });
    await intl.mount();
    expect(intl.locale).toBe('en-US');
  });
```

**Conventions you must match**, all visible above:

- Tests live in a `tests/` directory beside `src/`, **not** co-located with
  source files. Import from `'../src'`, not from `'../lib'` or the package name.
- `expect` is taken from the **per-test fixture argument**
  (`it('name', async ({ expect }) => {...})`), not imported from `vitest`.
  Keep doing that.
- Only `vi`, `afterEach`, `describe`, `it` are imported from `vitest`.
- Single top-level `describe` named after the package (`'@tiny-intl/core'` →
  use `'@tiny-intl/react'` etc.).
- Formatting is Prettier with `singleQuote: true`, `printWidth: 100`,
  `trailingComma: "all"` (see `.prettierrc`). 2-space indent (see `.editorconfig`).

### Excerpt — `packages/react/package.json:25-46` (no test script, no runner)

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "peerDependencies": {
    "react": ">=18.0.0",
    "react-dom": ">=18.0.0"
  },
  "dependencies": {
    "@tiny-intl/core": "^1.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.0.28",
    "@vitejs/plugin-react": "^4.1.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "rollup-plugin-visualizer": "^5.9.0",
    "typescript": "^5.2.2",
    "vite": "^4.5.2",
    "vite-plugin-dts": "3.6.0"
  }
```

`packages/preact/package.json` has the same shape with `preact` in place of react.

### Version constraint you must respect

The repo is on **vitest `^0.34.6`** and **vite `^4.5.2`** (see
`packages/core/package.json:37-46`). Do **not** upgrade either in this plan —
a vitest 0→3 and vite 4→7 migration is a separate, larger piece of work
(recorded in `plans/README.md` under deferred findings). Install testing
libraries whose versions are compatible with vitest 0.34 / vite 4.

## Commands you will need

> These were read from `package.json` / CI config during planning. `node_modules`
> was **not** installed at planning time, so none of them were executed — expect
> to discover the real behaviour of `npm run build` in Step 1.

| Purpose | Command | Expected on success |
|---|---|---|
| Install (root, workspaces) | `npm install` | exit 0 |
| Core tests | `npm run test --workspace @tiny-intl/core -- --run` | all pass |
| Core coverage | `npm run coverage --workspace @tiny-intl/core` | exit 0 |
| Typecheck+build one adapter | `npm run build --workspace @tiny-intl/react` | exit 0 |
| Lint (after Step 4) | `npm run lint:all` | exit 0 |
| All tests (after Step 4) | `npm test` | all pass |

## Scope

**In scope** (the only files you should modify or create):

- `package.json` (root) — add `test` / `lint:all` scripts
- `.github/workflows/unit-tests.yml` — rewrite
- `packages/react/package.json`, `packages/react/vite.config.ts`,
  `packages/react/tests/useIntl.test.tsx` (create),
  `packages/react/tests/Translate.test.tsx` (create)
- `packages/preact/package.json`, `packages/preact/vite.config.ts`,
  `packages/preact/tests/useIntl.test.tsx` (create),
  `packages/preact/tests/Translate.test.tsx` (create)
- `package-lock.json` — will change as a result of installing devDependencies;
  commit the result.
- `plans/README.md` — status row only

**Out of scope** (do NOT touch, even though they look related):

- **`packages/solid-js/**` — do not add tests, a `test` script, or a vitest
  config there.** That package is being deleted by
  `plans/002-remove-solid-js-support.md`. If the directory still exists when you
  run, simply leave it alone.
- **Any file under `packages/react/src/` or `packages/preact/src/`.** This plan
  adds tests that document *current* behaviour. Fixing behaviour is plan 003.
- `packages/core/**` — core already has a working suite; do not restructure it.
- Upgrading vitest, vite, eslint, prettier, lerna or typescript major versions.
- `.eslintrc.cjs` — unless a new test file trips a lint rule, in which case see
  Step 4.

## Git workflow

- Branch: `advisor/001-adapter-test-and-ci-baseline`
- The repo enforces **conventional commits** via commitlint
  (`commitlint.config.js` + `.husky/commit-msg`), with scopes restricted to
  `core`, `react`, `solid-js`, `preact` (plan 002 removes `solid-js` from that
  list). Recent history for reference:
  `test(core): use stubs for mocking navigator variable`,
  `ci: implement unit testing inside github action`,
  `chore: updated outdated dev dependencies`.
  Use `test(react): ...`, `test(preact): ...`, `ci: ...`, `chore: ...`.
- Commit per step or per logical unit. Do NOT push or open a PR unless the
  operator instructed it.

## Steps

### Step 1: Record the current build/typecheck baseline before changing anything

Install and find out what actually works today. Each adapter's `build` script is
`tsc && vite build`, so it doubles as a typecheck.

```bash
npm install
npm run build --workspace @tiny-intl/react
npm run build --workspace @tiny-intl/preact
npm run test --workspace @tiny-intl/core -- --run
```

Write the exit status and, on failure, the **first 30 lines of error output** for
each of these four commands into your final report.

**Known baseline, measured 2026-08-12 — do not act on any of it, just confirm
it still holds:**

- All four commands exited 0. `npx tsc --noEmit` also exits 0 in both
  `packages/react` and `packages/preact`. There is no pre-existing type error.
- The **preact** build prints 6 non-fatal `TS2742` diagnostics from
  `vite-plugin-dts` ("The inferred type of 'useIntl' cannot be named without a
  reference to …/createTinyIntl. This is likely not portable."). The build still
  exits 0. As a result `packages/preact/lib/types/useIntl.d.ts` is **never
  emitted**, even though `lib/types/index.d.ts` re-exports from it. React emits
  all three declaration files correctly.

That preact declaration gap is a real shipped bug, but it is **out of scope
here** — it has its own plan (006). If you observe it, note it and move on. If
you observe something *different* from the baseline above, record the exact
output; the repo has drifted.

**Verify**: all four commands have been run and their results recorded. This step
cannot "fail" — it is a measurement.

### Step 2: Add the test harness to `@tiny-intl/react`

2a. Add devDependencies and a `test` script to `packages/react/package.json`:

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "coverage": "vitest run --coverage"
  },
```

Install (from the repo root, so npm workspaces hoists correctly):

```bash
npm install -D --workspace @tiny-intl/react \
  vitest@^0.34.6 @vitest/coverage-v8@^0.34.6 jsdom@^22 \
  @testing-library/react@^14
```

2b. Give the package a vitest config. `packages/react/vite.config.ts` currently
imports `defineConfig` from `'vite'`. Change that import to `'vitest/config'` and
add a `test` block — matching how `packages/core/vite.config.ts` does it. Leave
every existing `plugins` and `build` entry exactly as it is:

```ts
import { defineConfig } from 'vitest/config'; // eslint-disable-line import/no-unresolved

export default defineConfig({
  plugins: [ /* unchanged */ ],
  build: { /* unchanged */ },
  test: {
    environment: 'jsdom',
    globals: false,
  },
});
```

2c. Create `packages/react/tests/useIntl.test.tsx`. It must cover, at minimum:

1. `useIntl()` outside a provider throws
   `'useIntl must be used within a TinyIntlContext.Provider'`.
2. `t('inbox')` returns the translated string for the mounted locale.
3. After `await intl.change('de-DE')`, a component using `useIntl()` **re-renders
   with the German string** (this is the subscription path,
   `packages/react/src/useIntl.tsx:26-31`).
4. `n(1000)` and `dt('2021-01-01', { dateStyle: 'full' })` return locale-correct
   output.

Build the `intl` instance with `createTinyIntl` from `@tiny-intl/core` and an
inline `loadDict`, exactly as `packages/core/tests/index.test.ts:8-42` does —
copy that fixture dictionary rather than inventing a new one, so all three
packages' tests share vocabulary. Wrap components in
`<TinyIntlContext.Provider value={intl}>`.

Locale change happens outside React, so wrap it:
`await act(async () => { await intl.change('de-DE'); });`

**Verify**: `npm run test --workspace @tiny-intl/react -- --run` → all tests pass,
0 failures.

### Step 3: Repeat Step 2 for `@tiny-intl/preact`

Same structure. `packages/preact/src/useIntl.tsx` is a byte-for-byte copy of the
React one except it imports from `'preact/compat'` — so the tests are the same
tests with a different testing library.

```bash
npm install -D --workspace @tiny-intl/preact \
  vitest@^0.34.6 @vitest/coverage-v8@^0.34.6 jsdom@^22 \
  @testing-library/preact@^3
```

`@preact/preset-vite` is already in the package's devDependencies and already in
`packages/preact/vite.config.ts` `plugins`, so JSX transformation is handled. Add
the same `test: { environment: 'jsdom' }` block and switch the `defineConfig`
import to `'vitest/config'`.

**Verify**: `npm run test --workspace @tiny-intl/preact -- --run` → all pass.

### Step 4: Wire up root-level scripts

In root `package.json`, add a `test` script and a lintable `lint:all`, leaving
the existing `lint` entry untouched (it is invoked by `.lintstagedrc`, which
appends filenames to it — adding a target there would break that):

```json
  "scripts": {
    "lint": "eslint --config ./.eslintrc.cjs --ignore-path ./.eslintignore --cache",
    "lint:all": "npm run lint -- .",
    "test": "lerna run test -- --run",
    "coverage": "lerna run coverage",
    "release": "lerna publish --no-private",
    "git-hooks:commit-msg": "commitlint --edit",
    "git-hooks:pre-commit": "lint-staged",
    "preversion": "lerna run coverage && lerna run build",
    "prepare": "husky install"
  },
```

Run `npm run lint:all`. If it reports errors **in the test files you just
wrote**, fix the test files. If it reports errors in pre-existing `src/` files,
do NOT fix them — record them in your report and move on (`src/` is out of
scope). If a lint rule is fundamentally incompatible with test files (e.g.
`import/no-extraneous-dependencies` firing on devDependency imports), add a
narrowly-scoped override to `.eslintrc.cjs` for `packages/*/tests/**` only, in
the same style as the existing `'**/*.config.*'` override at the bottom of that
file.

**Verify**: `npm test` → core, react and preact each run their suites, exit 0.
`npm run lint:all` → exit 0, or exits non-zero **only** on pre-existing `src/`
findings which you have listed in your report.

### Step 5: Replace the CI workflow

Rewrite `.github/workflows/unit-tests.yml` entirely:

```yaml
name: CI

on:
  push:
    branches: ['*']
  pull_request:
    branches: ['*']

jobs:
  test:
    name: Lint & test (node ${{ matrix.node-version }})
    runs-on: ubuntu-latest

    strategy:
      fail-fast: false
      matrix:
        node-version: [20, 22, 24]

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - name: Install
        run: npm ci

      - name: Lint
        run: npm run lint:all

      - name: Test
        run: npm test
```

Rationale for each change, so you can defend it in review: `setup-node@v4` and
`checkout@v4` run on a supported action runtime (v2 does not); `setup-node`'s
built-in `cache: 'npm'` replaces the hand-rolled `actions/cache` step, which was
both redundant and ordered before the Node install it depended on; `npm ci` is
the correct command when `package-lock.json` is committed; Node 16, 18 and 21 are
all past end-of-life and are dropped.

**Verify**: `npx --yes yaml-lint .github/workflows/unit-tests.yml` → valid, or if
that tool is unavailable, `node -e "require('fs').readFileSync('.github/workflows/unit-tests.yml','utf8')"`
plus a careful re-read. If `act` or a push to a branch is available, confirm the
workflow goes green.

## Test plan

New files (all modelled structurally on `packages/core/tests/index.test.ts` —
`tests/` directory, `describe('@tiny-intl/<pkg>')`, per-test `{ expect }`
fixture, shared fixture dictionary):

| File | Cases |
|---|---|
| `packages/react/tests/useIntl.test.tsx` | throws outside provider; `t` returns translation; re-renders on `intl.change`; `n` and `dt` format per locale |
| `packages/react/tests/Translate.test.tsx` | `<Translate name="inbox" />`; `count={2}` renders the plural form; `number={1000}` renders `1,000`; `date=` renders a formatted date; function-as-children receives the value |
| `packages/preact/tests/useIntl.test.tsx` | same as react |
| `packages/preact/tests/Translate.test.tsx` | same as react |

Do **not** add `count={0}` or `number={0}` cases here. Those are the regression
tests for plan 003 and belong in that plan, so that plan 003 has a test that goes
red-then-green.

Verification: `npm test` → all suites pass; 4 new test files exist.

## Done criteria

ALL must hold:

- [ ] `npm ci` exits 0
- [ ] `npm test` exits 0 and runs suites for core, react and preact
- [ ] `npm run lint:all` exits 0, or fails only on pre-existing `src/` findings listed in the report
- [ ] `ls packages/react/tests packages/preact/tests` — each contains at least 2 test files
- [ ] `git diff --name-only 794eb48..HEAD -- 'packages/*/src'` returns **no output** (no source file was modified)
- [ ] `git status --porcelain packages/solid-js` returns no output (that package was not touched)
- [ ] `.github/workflows/unit-tests.yml` contains `actions/setup-node@v4` and `npm ci`, and contains no occurrence of `@v2`
- [ ] The report records the Step 1 baseline results for all four commands
- [ ] `plans/README.md` status row for 001 updated

## STOP conditions

Stop and report back (do not improvise) if:

- Installing the testing libraries produces peer-dependency errors that only
  resolve by upgrading vitest or vite to a new major — that is explicitly out of
  scope. Report the conflict.
- You find yourself needing to edit a file under `packages/react/src/` or
  `packages/preact/src/` to make a test pass. That is the signal that you have
  crossed into plan 003.
- `npm test` (via `lerna run test`) fails because `packages/solid-js` still
  exists and has no `test` script. `lerna run` skips packages without the script,
  so this should not happen — if it does, report rather than adding a script
  there.
- A test you write to document *current* behaviour fails in a way that looks like
  a real bug in react or preact that is not the `count={0}` / `number={0}` issue
  plan 003 covers. Record the finding; do not fix it.

## Maintenance notes

- **Not covered by this plan, deliberately**: CI does not run `lerna run build`,
  so a broken adapter build still won't be caught. Nothing blocks adding it —
  all three builds are green as of 2026-08-12 — it was simply left out to keep
  this plan's diff small. Worth adding as a follow-up, ideally together with a
  check that fails on `TS2742` (see plan 006: those diagnostics currently pass
  CI silently while dropping a declaration file from the published package).
- Also worth adding to CI once plan 005 lands: `npx publint` on each package, so
  a broken `exports` map cannot ship again.
- The `preversion` script (`lerna run coverage && lerna run build`) will now do
  more work, because two more packages gained a `coverage` script. That is
  intended.
- Reviewers should check that no test asserts against built output (`lib/`) —
  every import must come from `../src` or from the `@tiny-intl/core` workspace
  package, matching the core suite.
- If a fourth adapter is ever added (Vue, Svelte), the react harness in Step 2 is
  the template to copy — it is the simplest of the two.
