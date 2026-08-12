# Plan 007: Recover the adapter bundle-size regression, and stop shipping two dead bundles

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed as in scope. If any STOP condition occurs, stop and
> report — do not improvise.
>
> **Drift check (run first)**:
> `git diff --stat 49bd556..HEAD -- packages/react packages/preact`

## Status

- **Priority**: P1 (this project's entire value proposition is size)
- **Effort**: S
- **Risk**: LOW-MED — Step 2 changes runtime guards that a regression test suite
  already pins; Step 3 changes what the `require` entry resolves to.
- **Depends on**: plans 001–006 (all merged into `main` at `49bd556`)
- **Category**: perf / packaging
- **Planned at**: commit `49bd556`, 2026-08-12

## Why this matters

`tiny-intl` is sold on bundle size — every README leads with a bundlejs badge.
Plan 003 fixed a real bug (`<Translate count={0}>` rendered the singular,
`number={0}` rendered nothing) but paid for it in bytes, because
`typeof count === 'number'` is far longer than `count`.

Measured with esbuild (`bundle: true, minify: true, format: 'esm'`, framework
externalised) then gzip level 9 — a methodology that **reproduces the published
badge numbers exactly** for both adapters:

| package | before (`794eb48`) | after (`49bd556`) | delta |
|---|---|---|---|
| `@tiny-intl/core` | 1418 B | 1422 B | +4 B |
| `@tiny-intl/react` | **541 B** | 558 B | **+17 B** |
| `@tiny-intl/preact` | **727 B** | 741 B | **+14 B** |

Core's +4 B is gzip noise (its minified size actually *fell*, 3116 → 3102 B).
The adapter regressions are real and are the target here.

There is also dead weight in the published tarballs. Both adapters build
`formats: ['es', 'cjs', 'umd']`, but `package.json` references only
`./lib/index.js` (import) and `./lib/index.umd.cjs` (require). So:

- `lib/index.cjs` — **3039 B in react, 1571 B in preact — is referenced by
  nothing** and ships in every install.
- The `require` entry points at the **larger** of the two CommonJS-capable
  files (react: UMD 3588 B vs CJS 3039 B).
- Pointing `require` at a UMD bundle is also why
  `attw --pack packages/preact` reports 👺 "Masquerading as ESM" on the node16
  rows — a known outstanding defect. **Fixing the size issue fixes that too.**

## Current state

### The guards to shrink — `packages/react/src/Translate.tsx:65-87`

```tsx
  const translateFn = useCallback(() => {
    if (typeof count === 'number') {
      return tc(name, count, options);
    }

    if (date !== undefined && !relative) {
      return dt(date, options);
    }

    if (date !== undefined && relative) {
      return rt(date, options);
    }

    if (typeof number === 'number') {
      return n(number, options);
    }

    if (name) {
      return t(name, options);
    }

    return null;
  }, [changed, count, date, name, number, options, relative]);
```

`packages/preact/src/Translate.tsx` is byte-identical below line 8.

The prop types (`TranslateProps`, same file) declare `count?: number`,
`number?: number`, `date?: Date | string | number` — and, in the union members
where each is absent, the unit type `undefined`. So the only non-value these can
hold is `undefined`, which is what makes the shorter form below equivalent.

### The build config — `packages/react/vite.config.ts` / `packages/preact/vite.config.ts`

```ts
  build: {
    outDir: resolve(__dirname, 'lib'),
    lib: {
      entry: resolve(__dirname, 'src', 'index.ts'),
      name: 'tinyIntl',
      fileName: 'index',
      formats: ['es', 'cjs', 'umd'],
    },
```

Both files also carry a vitest `test` block added by plan 001 — **leave it
alone**.

### The manifests — `packages/react/package.json` / `packages/preact/package.json`

```json
  "main": "./lib/index.umd.cjs",
  "module": "./lib/index.js",
  "types": "./lib/types/index.d.ts",
  "sideEffects": false,
  "exports": {
    ".": {
      "types": "./lib/types/index.d.ts",
      "import": "./lib/index.js",
      "require": "./lib/index.umd.cjs"
    },
    "./package.json": "./package.json"
  },
```

### Conventions

- Prettier: `singleQuote: true`, `printWidth: 100`, `trailingComma: "all"`.
- Commit scopes allowed by commitlint: `core`, `react`, `preact`.
- The suite is 52 tests (core 24, react 14, preact 14). `npm test` must stay green.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm ci` | exit 0 |
| Build one package | `npm run build --workspace @tiny-intl/react` | exit 0 |
| Typecheck | `cd packages/react && npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | 52 pass |
| Lint | `npm run lint:all` | exit 0 |
| Measure | `node measure.mjs` (Step 1) | prints 3 rows |

## Scope

**In scope**:

- `packages/react/src/Translate.tsx`, `packages/preact/src/Translate.tsx`
- `packages/react/vite.config.ts`, `packages/preact/vite.config.ts` — the
  `formats` array only
- `packages/react/package.json`, `packages/preact/package.json` — `main` and the
  `require` condition only

**Out of scope**:

- `packages/core/**` — its +4 B is gzip noise, not a regression worth chasing.
- The `test` blocks in the adapter `vite.config.ts` files.
- Any test file. The existing regression tests are the safety net; **do not edit
  them to accommodate a change.**
- `TranslateProps` itself.
- Core's `files: ["lib", "src"]` and its sourcemaps. That is a separate,
  larger tarball-size decision the maintainer has not yet made.
- Publishing, versions, `lerna.json`.

## Git workflow

- Conventional commits. Suggested: `perf(react): shrink Translate guards`,
  `perf(preact): shrink Translate guards`, `fix(react): point require at the CJS build`.
- Do NOT push or open a PR.

## Steps

### Step 1: Set up the measurement harness and record the baseline

Create `measure.mjs` in the repo root (delete it before you commit — it must not
end up in the diff):

```js
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const targets = [
  { name: '@tiny-intl/core',   entry: 'packages/core/lib/esm/index.js', external: [] },
  { name: '@tiny-intl/react',  entry: 'packages/react/lib/index.js',    external: ['react','react-dom','react/jsx-runtime'] },
  { name: '@tiny-intl/preact', entry: 'packages/preact/lib/index.js',   external: ['preact','preact/compat','preact/jsx-runtime'] },
];
for (const t of targets) {
  const r = await build({ entryPoints: [t.entry], bundle: true, minify: true, format: 'esm',
    treeShaking: true, external: t.external, write: false, legalComments: 'none' });
  const out = r.outputFiles[0].contents;
  console.log(t.name.padEnd(20) + ' min=' + String(out.length).padStart(5) +
    'B  min+gzip=' + String(gzipSync(out, { level: 9 }).length).padStart(4) + 'B');
}
```

```bash
npm ci
for p in core react preact; do npm run build --workspace @tiny-intl/$p; done
node measure.mjs
```

**Expected baseline** (measured 2026-08-12 at `49bd556`): core `1422B`,
react `558B`, preact `741B`. Record what you actually get.

If your numbers differ by more than ~5 B from those, **STOP and report** — your
esbuild version differs and the before/after comparison below will not be
meaningful.

### Step 2: Shrink the guards

In **both** `packages/react/src/Translate.tsx` and
`packages/preact/src/Translate.tsx`, replace the four guards:

| from | to |
|---|---|
| `typeof count === 'number'` | `count != null` |
| `date !== undefined && !relative` | `date != null && !relative` |
| `date !== undefined && relative` | `date != null && relative` |
| `typeof number === 'number'` | `number != null` |

Why this is equivalent and not a regression of plan 003's fix: each of these
props is typed as `T | undefined`, so `!= null` excludes exactly the same values
`typeof`/`!== undefined` did — while still being **true for `0`**, which is the
entire point of plan 003. It is also marginally more robust: a plain-JS consumer
passing `null` now falls through instead of being formatted as a number.

`!= null` (rather than `!== undefined`) is deliberate — it is the shortest form
that survives minification, and it is why this recovers bytes.

**If ESLint's `eqeqeq` rule rejects `!= null`**, do not add a disable comment.
Fall back to `!== undefined` for all four (still shorter than `typeof`), record
that you did, and continue.

Change nothing else — not the branch order, not the `if (name)` guard, not the
dependency array.

**Verify**:

```bash
cd packages/react && npx tsc --noEmit; echo "react tsc=$?"; cd ../..
cd packages/preact && npx tsc --noEmit; echo "preact tsc=$?"; cd ../..
diff <(tail -n +8 packages/react/src/Translate.tsx) <(tail -n +8 packages/preact/src/Translate.tsx)
npm test
```

→ both `tsc=0`; the `diff` produces no output (adapters stay identical);
**52 tests pass**. The `count={0}` / `number={0}` / `date={0}` regression tests
from plan 003 passing is the proof this did not undo that fix.

If `tsc` now errors, `!= null` failed to narrow the props union — **STOP and
report the exact error**; do not paper over it with an assertion.

### Step 3: Stop building and shipping the UMD bundle

In both `packages/react/vite.config.ts` and `packages/preact/vite.config.ts`,
change the formats array:

```ts
      formats: ['es', 'cjs'],
```

Then in both `package.json` files, point the CommonJS entry at the real CJS
build instead of the UMD one:

```json
  "main": "./lib/index.cjs",
```

```json
      "require": "./lib/index.cjs"
```

Leave `module`, `types`, `sideEffects`, `files` and the `./package.json` export
untouched.

Rationale to defend in review: `index.cjs` was already being built and shipped
while nothing referenced it; `index.umd.cjs` was the larger file *and* the cause
of `attw`'s "Masquerading as ESM" finding. A UMD build exists to be loaded from a
`<script>` tag, which is not a plausible delivery mode for a React or Preact
hook adapter.

**Verify**:

```bash
rm -rf packages/react/lib packages/preact/lib
npm run build --workspace @tiny-intl/react
npm run build --workspace @tiny-intl/preact
ls packages/react/lib/ packages/preact/lib/
```
→ each `lib/` contains `index.js`, `index.cjs` and `types/` — and **no
`index.umd.cjs`**.

```bash
npx --yes publint packages/react
npx --yes publint packages/preact
npx --yes @arethetypeswrong/cli --pack packages/preact
```
→ publint reports no errors for either. Record the `attw` table and compare it
with the "Masquerading as ESM" baseline; report whether that finding is gone.

```bash
node -e "require('./packages/react/lib/index.cjs'); console.log('cjs entry loads')"
```
→ prints the message (proves the new `require` target is actually loadable).

### Step 4: Re-measure and prove the win

```bash
for p in core react preact; do npm run build --workspace @tiny-intl/$p; done
node measure.mjs
```

Report the before/after table against Step 1's baseline **and** against the
pre-regression targets: react **541 B**, preact **727 B**.

Then compare the published-tarball footprint:

```bash
(cd packages/react && npm pack --dry-run 2>&1 | grep -E "unpacked size|total files")
(cd packages/preact && npm pack --dry-run 2>&1 | grep -E "unpacked size|total files")
```
(Baseline at `49bd556`: react 19.0 kB / 8 files, preact 13.5 kB / 7 files.)

Finally, remove the harness and confirm a clean diff:

```bash
rm measure.mjs
npm run lint:all
git status --porcelain
```

**Verify**: lint exits 0; `git status` shows only the six in-scope files;
`measure.mjs` is gone.

## Test plan

No new tests. The safety net already exists and must not be touched:

- The plan-003 regression tests (`count={0}` → plural form, `number={0}` → `0`,
  `date={0}` → a formatted date) prove Step 2 preserved the bug fix. If any of
  them fails, `!= null` was the wrong substitution.
- The full 52-test suite proves nothing else moved.
- `node -e "require('./packages/react/lib/index.cjs')"` proves Step 3's new
  `require` target loads — the one thing no unit test covers.

## Done criteria

ALL must hold:

- [ ] `npm test` exits 0 with **52 tests passing**
- [ ] `cd packages/react && npx tsc --noEmit` exits 0; same for preact
- [ ] `npm run lint:all` exits 0
- [ ] `ls packages/react/lib packages/preact/lib` → no `index.umd.cjs`
- [ ] `grep -c "umd" packages/react/vite.config.ts packages/preact/vite.config.ts` → 0 each
- [ ] `grep -c "index.umd.cjs" packages/react/package.json packages/preact/package.json` → 0 each
- [ ] `node -e "require('./packages/react/lib/index.cjs')"` exits 0
- [ ] `npx publint packages/react` and `packages/preact` → no errors
- [ ] `node measure.mjs` shows react and preact **at or below** their Step 1
      baselines (558 B / 741 B), with the delta reported
- [ ] `measure.mjs` deleted; `git status --porcelain` lists only in-scope files
- [ ] `diff <(tail -n +8 .../react/src/Translate.tsx) <(tail -n +8 .../preact/src/Translate.tsx)` → empty

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1's baseline differs from core 1422 / react 558 / preact 741 by more
  than ~5 B.
- `tsc` fails after Step 2 — `!= null` did not narrow the union.
- Any plan-003 regression test fails. **Do not edit the test.** That means the
  substitution changed behaviour for `0`, which is the exact bug plan 003 fixed.
- `require('./packages/react/lib/index.cjs')` throws — the CJS build is not a
  usable entry and dropping UMD would break CommonJS consumers.
- Bundle size gets *larger* after Step 2.
- You find yourself wanting to edit `packages/core/**` or any test file.

## Maintenance notes

- **Expected outcome**: react and preact back at or near 541 B / 727 B, with
  ~3 kB and ~1.6 kB respectively removed from the install footprint, and the
  `attw` "Masquerading as ESM" finding resolved as a side effect.
- **Dropping UMD is technically breaking** for anyone loading the adapters via a
  `<script>` tag from a CDN. That is implausible for a hook-based adapter and
  there is no evidence of such use, but it belongs in the next release notes.
- **Still open, needs a maintainer decision**: `@tiny-intl/core` ships 16
  sourcemaps (35 kB) plus `src/` (40 kB) out of an 82 kB tarball. Dropping both
  takes it to roughly 8 kB at the cost of consumer source-level debugging. This
  affects install size only — **not** bundle size — which is why it is out of
  scope here.
- **Guard against future regressions**: the `measure.mjs` harness could become a
  CI step that fails when a package exceeds a committed byte budget. That would
  have caught plan 003's +17 B automatically. Worth doing given how central size
  is to this project's positioning.
