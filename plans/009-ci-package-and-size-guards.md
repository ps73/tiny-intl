# Plan 009: Make CI enforce what the test suite cannot — `publint`, `attw`, and a per-package bundle-size budget

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed as in scope. If any STOP condition occurs, stop and
> report — do not improvise.
>
> **Drift check (run first)**:
> `git diff --stat f37d4c7..HEAD -- .github package.json packages`

## Status

- **Priority**: P1 — every defect these catch has already shipped once
- **Effort**: M
- **Risk**: LOW — adds CI checks and one script; no runtime source changes
- **Depends on**: plans 001–008 (merged into `main` at `f37d4c7`)
- **Category**: dx / tests
- **Planned at**: commit `f37d4c7`, 2026-08-12

## Why this matters

Three classes of defect reached npm in this repo, and **none of them is
observable from the test suite**. All three were found by hand, and nothing
currently stops them recurring:

1. **Broken package metadata.** `@tiny-intl/core` shipped an `exports.types`
   path pointing at a directory that never existed. `publint` reports it in one
   command; CI never ran it.
2. **Type declarations that do not resolve.** Both adapters failed `attw` on
   both node16 rows — one of them because a declaration file re-exported a
   module that was never emitted, which the build reported as a non-fatal
   diagnostic and then exited 0. CI never built the adapters at all.
3. **Silent bundle growth.** A correctness fix added +17 B to react and +14 B to
   preact. Nobody noticed until the maintainer compared the README badges by eye.
   For a project whose entire positioning is size, that is the regression that
   matters most.

After this plan, all three fail the build. The size budget in particular turns an
invisible drift into a visible, reviewable diff: growing a package requires
editing a committed number.

## Current state

### `.github/workflows/unit-tests.yml` (entire file)

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

It lints and tests. It never **builds**, so nothing downstream of the build is
checked.

### Root `package.json` scripts

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

There is **no root `build` script**.

### ⚠ Do not use `lerna run build` — measured 2026-08-12

The obvious root script would be `"build": "lerna run build"`. **It is wrong
here**, and it fails in a way that is silent and destructive when run from a git
worktree — which is how these plans are executed.

lerna 7 delegates to nx, and nx's workspace-root detection walks up from `cwd`
looking for a real `.git` **directory**. A git worktree's `.git` is a gitlink
**file**, so nx walks straight past the worktree root and lands on the main
checkout:

```
$ node -e "console.log(require('nx/src/utils/workspace-root').workspaceRoot)"
/Users/.../tiny-intl          # <-- the MAIN checkout, run from inside a worktree
```

Consequences, both verified:

- `npm run build` (via lerna) from a worktree **exits 0 while writing its output
  into the main checkout**. The worktree's own `packages/*/lib` stays empty, so
  every later step that reads build output fails or measures the wrong tree.
- The existing root `"test": "lerna run test -- --run"` has the same defect. With
  a deliberately failing test added to a worktree, root `npm test` reported
  **52 passing** — it was running the main checkout's tests. The same tests run
  as `npm run test --workspace @tiny-intl/core -- --run` correctly reported
  `1 failed | 24 passed`.

**npm's own workspace mechanism is unaffected** — `npm run build --workspace
@tiny-intl/core` resolves from the local `package.json` and writes into the
worktree correctly. That is why plans 001–008 all built and tested fine: they
used the per-package form throughout.

So the root `build` script must be an explicit, ordered npm-workspaces chain
(Step 1), and **anyone verifying inside a worktree must use
`npm run test --workspace <pkg> -- --run`, never root `npm test`.**

Changing the existing `test`/`coverage`/`preversion` scripts off lerna is **out
of scope** — they run at the repo root in CI, where lerna behaves correctly.
Recorded as a deferred finding instead.

### ⚠ `attw` on `@tiny-intl/core` exits 1 today — measured 2026-08-12

`npx attw --pack packages/core` **exits 1**. Its node16 and bundler rows are all
🟢, but the node10 row for the `./utils` subpath is 💀 "Resolution failed":
node10 predates `exports`, so it cannot resolve a subpath that exists only in
the `exports` map. This is **pre-existing and was already 💀 before any of this
work** — plan 005 explicitly recorded it as out of scope.

A naive `attw --pack packages/core` in CI would therefore fail the build on day
one. Step 4 waives exactly that one rule for core only:

```
attw --pack packages/core --ignore-rules no-resolution   # exit 0, verified
```

The adapters get **no** waiver — they are genuinely clean and must stay that way.

### Tool availability

- `esbuild@0.18.20` resolves at the root **transitively** (via vite). The size
  script imports it directly, so it must be declared explicitly rather than
  relied on by accident.
- `publint` and `@arethetypeswrong/cli` are **not installed**. Pin them as
  devDependencies rather than using `npx --yes`, so CI is reproducible and
  offline-friendly.

### The measured baseline this plan encodes

Minified + gzipped, esbuild `bundle+minify+esm+treeshake` with the framework
externalised, gzip level 9. **This recipe reproduces the published bundlejs
badge numbers exactly** — it was validated against the pre-audit source, where
it returned 541 B and 727 B, matching the badges to the byte.

| package | current | budget to set | headroom |
|---|---|---|---|
| `@tiny-intl/core` | 1422 B | **1430 B** | 8 B |
| `@tiny-intl/react` | 548 B | **550 B** | 2 B |
| `@tiny-intl/preact` | 735 B | **740 B** | 5 B |

Budgets are deliberately tight — current size rounded up to the next 10 bytes.
The point is that *any* real growth trips the check and has to be acknowledged
by editing the budget file in the same commit.

Calibration check: the +17 B react regression would have taken it to 565 B,
well past a 550 B budget. Caught.

**The measurement is stable across esbuild versions — verified 2026-08-12.** A
first attempt at this plan installed `esbuild@0.28.2` at the root (npm installs
latest), a ten-minor jump from the `0.18.20` that vite pulls in transitively.
Measured with **both** versions, the numbers are byte-identical:

| package | esbuild 0.18.20 | esbuild 0.28.2 |
|---|---|---|
| core | 1422 B | 1422 B |
| react | 548 B | 548 B |
| preact | 735 B | 735 B |

So tight budgets are not brittle to an esbuild upgrade, and the exact version
installed for the size script does not matter.

**Declaring `esbuild` at the root does not break the vite 4 build** — also
verified. vite 4.5.2 requires `esbuild@^0.18.10`; with `esbuild@0.28.2` hoisted
to the root, npm nests the correct copy at
`node_modules/vite/node_modules/esbuild` (confirmed 0.18.20), and
`npm run build` succeeds for all three packages.

### Conventions

- Prettier: `singleQuote: true`, `printWidth: 100`, `trailingComma: "all"`;
  2-space indent.
- Commitlint scopes: `core`, `react`, `preact` — or no scope. `ci:` and `chore:`
  with no scope are both fine.
- `.eslintrc.cjs` uses `parserOptions.project: 'tsconfig.eslint.json'`, whose
  `include` currently lists `packages`, `.eslintrc.cjs`, `commitlint.config.js`
  and `config/**/*.config.js` — **not** a `scripts/` directory. A new file there
  will fail linting until that include is extended. See Step 2.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm ci` | exit 0 |
| Build all | `npm run build` (after Step 1) | exit 0 |
| Tests | `npm run test --workspace <pkg> -- --run` | 24 / 14 / 14 |
| Lint | `npm run lint:all` | exit 0 |
| Size check | `npm run size` (after Step 2) | exit 0, table printed |
| Publint | `npm run publint` (after Step 3) | exit 0 |
| Attw | `npm run attw` (after Step 3) | exit 0 |

## Scope

**In scope**:

- `package.json` (root) — new devDependencies and scripts
- `package-lock.json` — consequence of the above
- `scripts/bundle-size.mjs` (create)
- `scripts/size-budget.json` (create)
- `tsconfig.eslint.json` — add `scripts` to `include`
- `.eslintrc.cjs` — only if `scripts/**` needs a narrow override (Step 2)
- `.github/workflows/unit-tests.yml` — add a job

**Out of scope**:

- **Anything under `packages/*/src`, `packages/*/tests`, or any
  `packages/*/package.json`.** This plan adds guards; it does not change what is
  guarded. If a guard fails, that is a finding to report, not a thing to fix
  here.
- Changing the existing `test` job's matrix or steps.
- Upgrading vite, vitest, eslint, lerna or typescript.
- Publishing, versions, `lerna.json`.

## Git workflow

- Conventional commits, no scope needed for root-level changes. Suggested:
  `chore: add publint and attw as devDependencies`,
  `chore: add a bundle-size budget check`,
  `ci: enforce package metadata and bundle size`.
- Do NOT push or open a PR.

## Steps

### Step 1: Add a root `build` script and the three tools

In root `package.json`, add to `scripts` (keep the existing entries as they are).
**Explicit npm-workspaces chain, in dependency order — not `lerna run build`**,
for the reasons in "Current state":

```json
    "build": "npm run build --workspace @tiny-intl/core && npm run build --workspace @tiny-intl/react && npm run build --workspace @tiny-intl/preact",
```

Core must come first: the adapters resolve `@tiny-intl/core` from its build
output.

Then install the tooling as root devDependencies:

```bash
npm install -D publint @arethetypeswrong/cli esbuild
```

`esbuild` is already present transitively; declaring it makes the size script's
import legitimate rather than accidental.

**Verify**:

```bash
npm run build
ls packages/core/lib/esm/index.js packages/react/lib/index.js packages/preact/lib/index.js
```
→ build exits 0 and all three entry files exist **inside your worktree**. If the
`ls` fails while the build reported success, you have hit the lerna/nx escape
described in "Current state" — STOP and report, do not work around it.

### Step 2: Add the bundle-size budget check

2a. Create `scripts/size-budget.json` — the committed budget, in bytes,
min+gzip:

```json
{
  "@tiny-intl/core": 1430,
  "@tiny-intl/react": 550,
  "@tiny-intl/preact": 740
}
```

2b. Create `scripts/bundle-size.mjs`:

```js
/**
 * Measures each package's published ESM entry the way bundlejs does —
 * esbuild bundle + minify + treeshake with the framework externalised, then
 * gzip -9 — and fails if any package exceeds its committed budget.
 *
 * Budgets live in scripts/size-budget.json. Growing a package is allowed, but
 * it has to be a deliberate, reviewable edit to that file.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const budgets = JSON.parse(readFileSync(new URL('./size-budget.json', import.meta.url), 'utf8'));

const TARGETS = [
  { name: '@tiny-intl/core', entry: 'packages/core/lib/esm/index.js', external: [] },
  {
    name: '@tiny-intl/react',
    entry: 'packages/react/lib/index.js',
    external: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  {
    name: '@tiny-intl/preact',
    entry: 'packages/preact/lib/index.js',
    external: ['preact', 'preact/compat', 'preact/jsx-runtime'],
  },
];

let failed = false;

for (const target of TARGETS) {
  const result = await build({
    entryPoints: [target.entry],
    bundle: true,
    minify: true,
    format: 'esm',
    treeShaking: true,
    external: target.external,
    write: false,
    legalComments: 'none',
  });
  const size = gzipSync(result.outputFiles[0].contents, { level: 9 }).length;
  const budget = budgets[target.name];

  if (budget === undefined) {
    console.error(`✗ ${target.name}: no budget in scripts/size-budget.json`);
    failed = true;
    continue;
  }

  const delta = budget - size;
  const status = size > budget ? '✗' : '✓';
  console.log(
    `${status} ${target.name.padEnd(20)} ${String(size).padStart(5)} B ` +
      `(budget ${budget} B, ${delta >= 0 ? `${delta} B headroom` : `${-delta} B OVER`})`,
  );
  if (size > budget) failed = true;
}

if (failed) {
  console.error(
    '\nBundle size budget exceeded. Either shrink the change, or raise the ' +
      'budget in scripts/size-budget.json in this same commit and say why.',
  );
  process.exit(1);
}
```

Note it uses a top-level `await`, which requires the `.mjs` extension — keep it.

2c. Add the script to root `package.json`:

```json
    "size": "node ./scripts/bundle-size.mjs",
```

2d. Add `scripts` to the `include` array in `tsconfig.eslint.json`, so ESLint's
type-aware rules can resolve the new file:

```json
  "include": [
    "packages",
    "scripts",
    ".eslintrc.cjs",
    "commitlint.config.js",
    "config/**/*.config.js"
  ]
```

**Verify**:

```bash
npm run build
npm run size
npm run lint:all
```
→ `npm run size` prints three `✓` rows and exits 0; lint exits 0.

If ESLint rejects the file for importing a devDependency
(`import/no-extraneous-dependencies`), add a narrow override to `.eslintrc.cjs`
for `scripts/**` only — modelled on the existing `'**/*.config.*'` override at
the bottom of that file — rather than disabling the rule globally or adding an
inline disable comment.

### Step 3: Prove the size guard actually guards

A check that never fails is worse than no check, because it manufactures
confidence. Verify it fires:

```bash
# temporarily bloat the react bundle well past its budget
cat >> packages/react/src/index.ts <<'EOF'
export const __SIZE_GUARD_PROBE__ =
  'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' +
  'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy' +
  'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';
EOF
npm run build --workspace @tiny-intl/react
npm run size; echo "exit=$?"
```
→ **must print `✗` for `@tiny-intl/react` and exit non-zero.**

Then restore and confirm it goes green again:

```bash
git checkout -- packages/react/src/index.ts
npm run build --workspace @tiny-intl/react
npm run size; echo "exit=$?"
git status --porcelain
```
→ exits 0, all `✓`, and `git status` shows no change to
`packages/react/src/index.ts`.

**Record both outputs in your report.** If the bloated build does **not** fail
the check, STOP — the guard is not wired up correctly and the rest of this plan
is pointless.

### Step 4: Add the `publint` and `attw` scripts

In root `package.json`:

```json
    "publint": "publint packages/core && publint packages/react && publint packages/preact",
    "attw": "attw --pack packages/core --ignore-rules no-resolution && attw --pack packages/react && attw --pack packages/preact",
```

**Verify**:

```bash
npm run build
npm run publint; echo "publint exit=$?"
npm run attw; echo "attw exit=$?"
```
→ both exit 0. `attw` should print "No problems found" for all three packages;
`publint` reports no errors (two pre-existing *suggestions* about
`engines.node` and `repository.url` are expected and do not fail it).

If either exits non-zero, **STOP and report the output** — that is a real
packaging defect, and this plan's job is to surface it, not to fix it.

### Step 5: Wire the checks into CI

Add a second job to `.github/workflows/unit-tests.yml`, leaving the existing
`test` job exactly as it is. These checks are Node-version-independent, so they
run once rather than across the matrix:

```yaml
  package:
    name: Package & size checks
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: 'npm'

      - name: Install
        run: npm ci

      - name: Build
        run: npm run build

      - name: Lint package manifests
        run: npm run publint

      - name: Check type resolution
        run: npm run attw

      - name: Check bundle size budget
        run: npm run size
```

**Verify**:

```bash
npx --yes yaml-lint .github/workflows/unit-tests.yml
grep -c "runs-on" .github/workflows/unit-tests.yml
```
→ YAML is valid; `runs-on` appears **twice** (two jobs). Re-read the file and
confirm the `test` job is byte-for-byte unchanged.

### Step 6: Full verification

```bash
npm ci
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

**Verify**: everything exits 0; the three suites report 24 / 14 / 14 = **52
passing**. Use the per-package form shown — root `npm test` is lerna-based and
reports the *main checkout's* results when run from a worktree.
`git status` lists only in-scope files.

## Test plan

No unit tests — this plan adds CI guards, and a test asserting "CI has a step"
would assert nothing useful.

The meaningful verification is **Step 3**: deliberately bloating a package must
turn the size check red, and reverting must turn it green. That is the only
evidence that the guard works, and it is a required part of the report.

For `publint` and `attw`, the evidence is that they exit 0 today against a tree
already known to be clean (all three packages currently report "No problems
found") — combined with the fact that they exited **non-zero** on this repo
before plans 005 and 008 fixed the underlying defects.

## Done criteria

ALL must hold:

- [ ] `npm run build` exits 0 and produces all three entry files
- [ ] `npm run size` exits 0 and prints three `✓` rows with headroom
- [ ] Bloating a package makes `npm run size` exit **non-zero** (Step 3, both outputs in the report)
- [ ] `npm run publint` exits 0
- [ ] `npm run attw` exits 0 with "No problems found" for all three packages
- [ ] `npm run lint:all` exits 0 — including the new `scripts/bundle-size.mjs`
- [ ] Per-package tests → 24 / 14 / 14 = 52 passing (do **not** use root `npm test` to verify this from a worktree)
- [ ] `.github/workflows/unit-tests.yml` has two jobs; the `test` job is unchanged
- [ ] `scripts/size-budget.json` contains 1430 / 550 / 740
- [ ] `git status --porcelain` lists only in-scope files; no stray probe left in `packages/react/src/index.ts`
- [ ] `git diff --name-only f37d4c7..HEAD -- packages/` returns **no output**

## STOP conditions

Stop and report back (do not improvise) if:

- `npm run build` reports success but the three entry files are missing from
  your worktree (the lerna/nx workspace-root escape). The Step 1 script is
  written to avoid it; if it still happens, report rather than working around it.
- `npm run publint` or `npm run attw` exits non-zero — report the output; that
  is a real defect and fixing it is not in this plan's scope.
- The Step 3 probe does **not** make the size check fail.
- Measured sizes differ from 1422 / 548 / 735 by more than a couple of bytes.
  These numbers have been verified identical under esbuild 0.18.20 and 0.28.2,
  so a difference means something other than the measurement tool has changed —
  report it rather than re-baselining the budgets to hide it.
- Making ESLint accept `scripts/bundle-size.mjs` requires disabling a rule
  repo-wide or adding an inline `eslint-disable` rather than a scoped override.
- You find yourself editing anything under `packages/`.

## Maintenance notes

- **Raising a budget is meant to be visible.** `scripts/size-budget.json` is the
  one place a size increase gets recorded, and it should be edited in the same
  commit as the change that needs it, with the reason in the commit body. If it
  starts getting bumped casually, the guard has stopped working.
- **The budgets are tight on purpose** (2–8 B of headroom). If dependency
  updates start causing spurious failures, re-baseline deliberately rather than
  padding the numbers — the whole value is that drift is loud.
- **`attw` and `publint` only see what `files` publishes**, because both pack the
  package first. That is the right scope: it is exactly what consumers get.
- **Not covered**: the `test` job still does not build, so a build break shows up
  only in the `package` job. That is fine — but if the two jobs ever need to
  diverge in Node version, remember the size numbers are measured on 24.
- Deferred finding 12 ("CI does not fail on `TS2742`") is **partially** closed by
  this plan: a `TS2742` that drops a declaration file now fails `attw` rather
  than the build. Making the build itself fail on dts diagnostics is still open.
