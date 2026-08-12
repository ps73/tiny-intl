# Plan 005: Fix `@tiny-intl/core`'s `exports` map — the declared `types` path does not exist — and delete the dead vite build

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 794eb48..HEAD -- packages/core/package.json packages/core/vite.config.ts packages/core/tsup.config.ts packages/react/package.json packages/preact/package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED — this changes how the published packages resolve for *every*
  consumer. It cannot be verified by the unit tests; it needs the packaging
  checks in Step 2. Get those green before merging.
- **Depends on**: none
- **Category**: tech-debt / dx
- **Planned at**: commit `794eb48`, 2026-08-12

## Why this matters

`@tiny-intl/core` declares a `types` entry in its `exports` map that points at a
file that has never existed:

```json
"types": "./lib/esm/types/index.d.ts"
```

The build (tsup) emits declarations to `lib/esm/index.d.ts` — there is no
`lib/esm/types/` directory at all. The `types` condition is also listed **last**
in the condition object, where the Node/TypeScript resolution algorithm — which
picks the first matching condition — will have already matched `import` or
`require` before reaching it. And the `require` branch points at
`./lib/cjs/index.js`, whose declaration file is `index.d.cts`, which is not the
name TypeScript looks for next to a `.js` file.

For a TypeScript library, type resolution *is* the product. Consumers on
`moduleResolution: "node16" | "nodenext" | "bundler"` — the default for anything
modern — are relying on a fallback path rather than the declared one, and CJS
consumers are the most likely to get "Could not find a declaration file for
module '@tiny-intl/core'". The exact symptom varies by resolver and TypeScript
version, which is precisely why Step 2 measures it with a tool instead of
guessing.

The same file also carries a dead build: `npm run build` runs `vite build`
(emitting to `dist/`) and then tsup (emitting to `lib/`), but `files` only ships
`lib` and `src`. Everything vite produces is thrown away on every build, along
with two devDependencies that exist solely to feed it. And tsup's
`entry: ['src']` glob sweeps in `src/vite-env.d.ts`, publishing junk
`lib/esm/vite-env.d.js` and `lib/cjs/vite-env.d.d.cts` files to npm.

## Current state

### Files and their roles

- `packages/core/package.json` — the broken `exports` map; the `build` script
  that runs the dead vite step.
- `packages/core/vite.config.ts` — a library build config emitting to `dist/`,
  **and** the vitest `test: {}` config. The test config must survive; the build
  config should not.
- `packages/core/tsup.config.ts` — the build that actually produces what ships.
- `packages/react/package.json`, `packages/preact/package.json` — same
  `types`-last condition ordering; their paths do at least exist.

### Excerpt — `packages/core/package.json:8-30`

```json
  "type": "module",
  "files": [
    "lib",
    "src"
  ],
  "main": "./lib/cjs/index.js",
  "module": "./lib/esm/index.js",
  "types": "./lib/esm/index.d.ts",
  "exports": {
    ".": {
      "import": "./lib/esm/index.js",
      "require": "./lib/cjs/index.js",
      "types": "./lib/esm/types/index.d.ts"
    },
    "./utils": {
      "import": "./lib/esm/utils/index.js",
      "require": "./lib/cjs/utils/index.js",
      "types": "./lib/esm/utils/index.d.ts"
    }
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build && npm run build2",
    "build2": "FORMAT=esm tsup && FORMAT=cjs tsup",
```

Note the top-level `"types": "./lib/esm/index.d.ts"` is **correct** — it is only
the one inside `exports` that points at the non-existent
`lib/esm/types/index.d.ts`.

### What the build actually emits

`packages/core/lib/esm/` contains:

```
createTinyIntl.d.ts   createTinyIntl.js   createTinyIntl.js.map
detectBrowserLocale.d.ts  detectBrowserLocale.js  detectBrowserLocale.js.map
detectLocale.d.ts     detectLocale.js     detectLocale.js.map
index.d.ts            index.js            index.js.map
package.json          utils/
vite-env.d.d.ts       vite-env.d.js       vite-env.d.js.map
```

`packages/core/lib/cjs/` is the same with `.d.cts` in place of `.d.ts`
(`index.d.cts`, `createTinyIntl.d.cts`, …) and a `package.json` containing
`{"type":"commonjs"}`.

There is **no `lib/esm/types/` directory**. The three `vite-env.d.*` files are
the junk from the entry glob.

### Excerpt — `packages/core/tsup.config.ts` (what really builds the package)

```ts
const baseOutDir = 'lib';
const format: Format = (process.env.FORMAT as 'cjs' | 'esm') || 'cjs';

const addPackageJson = () => {
  const dir = path.resolve(baseOutDir);
  writeFileSync(
    path.resolve(dir, format, 'package.json'),
    JSON.stringify({ type: format === 'cjs' ? 'commonjs' : 'module' }),
  );
};

export default defineConfig({
  entry: ['src'],
  target: 'es2022',
  format,
  bundle: false,
  sourcemap: true,
  clean: true,
  dts: true,
  outDir: format === 'cjs' ? `${baseOutDir}/cjs` : `${baseOutDir}/esm`,
  config: format === 'cjs' ? 'tsconfig.cjs.json' : 'tsconfig.json',
  onSuccess: () => { addPackageJson(); /* ... */ },
  outExtension: () => ({ js: '.js' }),
});
```

`entry: ['src']` is the glob that pulls in `src/vite-env.d.ts`.

### Excerpt — `packages/core/vite.config.ts` (the dead build, plus the live test config)

```ts
import { defineConfig } from 'vitest/config'; // eslint-disable-line import/no-unresolved

export default defineConfig({
  plugins: [
    dts({ outDir: resolve(__dirname, 'dist', 'types'), insertTypesEntry: true }),
    visualizer({ filename: 'dist/stats.html', gzipSize: true, brotliSize: true }),
  ],
  build: {
    outDir: resolve(__dirname, 'dist'),
    minify: false,
    lib: { entry: resolve(__dirname, 'src', 'index.ts'), name: 'tinyIntl', fileName: 'index',
           formats: ['es', 'cjs', 'umd'] },
    rollupOptions: { external: [], output: { globals: {} } },
  },
  test: {},
});
```

Everything above `test: {}` produces `dist/`, which `files: ["lib", "src"]` does
not publish. `test: {}` is what vitest reads and **must survive**.

### One thing that looks wrong but is not

`files` includes `"src"`. That is **deliberate and must stay**: tsup runs with
`sourcemap: true`, and the emitted `.js.map` files reference `../../src/*.ts`.
Shipping `src` is what makes those source maps resolve for consumers. Do not
"optimise" it away.

### Conventions

- Prettier: `singleQuote: true`, `printWidth: 100`, `trailingComma: "all"`.
- `package.json` files in this repo are 2-space indented with keys in the order
  shown above; preserve that ordering rather than reformatting.

## Commands you will need

> Read from `package.json` during planning; `node_modules` was not installed at
> planning time, so none of these were executed — including the packaging
> checks in Step 2, which need network access to fetch the tools via `npx`.

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm install` | exit 0 |
| Build core | `npm run build --workspace @tiny-intl/core` | exit 0 |
| Publint | `npx --yes publint packages/core` | no errors |
| Types check | `npx --yes @arethetypeswrong/cli --pack packages/core` | no ✗ rows |
| Core tests | `npm run test --workspace @tiny-intl/core -- --run` | all pass |
| Lint | `npm run lint:all` | exit 0 |

## Scope

**In scope** (the only files you should modify):

- `packages/core/package.json`
- `packages/core/vite.config.ts`
- `packages/core/tsup.config.ts`
- `packages/react/package.json`, `packages/preact/package.json` — condition
  ordering + `sideEffects` only
- `package-lock.json` — changes when devDependencies are removed
- `plans/README.md` — status row only

**Out of scope** (do NOT touch, even though they look related):

- **The adapter packages' `vite.config.ts` files.** Their vite build is the
  *real* build for those packages (`build: "tsc && vite build"` → `lib/`),
  unlike core's. Only core's vite build is dead.
- `files: ["lib", "src"]` in core — `src` is required for source maps, see above.
- Package versions and anything under `lerna.json`. Releasing is a separate,
  human-gated action (`npm run release` → `lerna publish`).
- Publishing. This plan changes packaging metadata; it does not publish.
- **`packages/solid-js/**` and the root `README.md`** — both are owned by
  `plans/002-remove-solid-js-support.md`, which deletes that package and its
  README entry. Do not add `sideEffects` or fix `exports` there; if the
  directory still exists when you run, leave it alone.
- Adding `exports` subpaths that do not exist today.

## Git workflow

- Branch: `advisor/005-fix-core-package-exports`
- Conventional commits (commitlint enforced). Prior art in `git log`:
  `feat: better esm exports`, `fix: built config`.
  Suggested: `fix(core): point exports types at the emitted declaration files`
  and `chore(core): drop the unused vite library build`.
- Do NOT push, publish, or open a PR unless the operator instructed it.

## Steps

### Step 1: Build, and confirm the declared types path really is missing

```bash
npm install
npm run build --workspace @tiny-intl/core
ls packages/core/lib/esm/
ls packages/core/lib/cjs/
ls packages/core/lib/esm/types 2>&1
```

**Verify**: `lib/esm/index.d.ts` and `lib/cjs/index.d.cts` exist;
`ls packages/core/lib/esm/types` reports "No such file or directory". If a
`types/` directory *does* exist, STOP — the build differs from what this plan
assumes.

### Step 2: Measure the current packaging state with real tools

```bash
npx --yes publint packages/core
npx --yes @arethetypeswrong/cli --pack packages/core
```

Record the full output of both. `@arethetypeswrong/cli` reports per-resolution
verdicts (node10, node16-cjs, node16-esm, bundler); expect failures on at least
the CJS rows. This output is your before/after evidence — you will re-run both
at the end.

If both tools report a clean bill of health, STOP and report: the resolution
problem may be masked by fallbacks in a way this plan mis-diagnoses, and the
`exports` fix should then be judged on correctness-of-metadata alone rather than
on a user-visible failure.

**Verify**: both commands ran and their output is recorded. (If `npx` cannot
reach the network, note that and continue — the `exports` map is still
demonstrably wrong per Step 1 — but say clearly in your report that the
packaging verification could not be performed.)

### Step 3: Fix core's `exports` map

Replace the `exports` block in `packages/core/package.json` with nested
conditions, `types` first in each:

```json
  "main": "./lib/cjs/index.js",
  "module": "./lib/esm/index.js",
  "types": "./lib/esm/index.d.ts",
  "sideEffects": false,
  "exports": {
    ".": {
      "import": {
        "types": "./lib/esm/index.d.ts",
        "default": "./lib/esm/index.js"
      },
      "require": {
        "types": "./lib/cjs/index.d.cts",
        "default": "./lib/cjs/index.js"
      }
    },
    "./utils": {
      "import": {
        "types": "./lib/esm/utils/index.d.ts",
        "default": "./lib/esm/utils/index.js"
      },
      "require": {
        "types": "./lib/cjs/utils/index.d.cts",
        "default": "./lib/cjs/utils/index.js"
      }
    },
    "./package.json": "./package.json"
  },
```

Why each part:

- `types` must be the **first** key inside each condition object — resolvers take
  the first match, so a `types` entry listed after `import`/`require` is
  unreachable.
- The ESM branch gets `.d.ts`, the CJS branch gets `.d.cts`, matching what tsup
  actually emits (confirmed in Step 1).
- `"./package.json"` is exported because tooling routinely reads it, and an
  `exports` map without it blocks that.
- `sideEffects: false` tells bundlers every module is safe to drop when unused.
  This package is pure functions; the claim is true. It is what makes the bundle
  size badge in the README honest for partial imports.

Confirm each of the six declared paths exists:

```bash
for f in lib/esm/index.d.ts lib/esm/index.js lib/cjs/index.d.cts lib/cjs/index.js \
         lib/esm/utils/index.d.ts lib/esm/utils/index.js \
         lib/cjs/utils/index.d.cts lib/cjs/utils/index.js; do
  test -f "packages/core/$f" && echo "OK  $f" || echo "MISSING  $f"
done
```

**Verify**: every line prints `OK`. Any `MISSING` line is a STOP condition — the
map must describe files that exist.

### Step 4: Stop emitting `vite-env.d.*` into the published package

In `packages/core/tsup.config.ts`, narrow the entry glob so declaration files
are not treated as entry points:

```ts
  entry: ['src/**/*.ts', '!src/**/*.d.ts'],
```

Rebuild and confirm the junk is gone:

```bash
npm run build --workspace @tiny-intl/core
ls packages/core/lib/esm/ packages/core/lib/cjs/ | grep vite-env
```

**Verify**: the `grep` produces no output, and `lib/esm/index.js`,
`lib/esm/utils/index.js` and their `.d.ts` counterparts all still exist (re-run
the Step 3 file-existence loop).

If the negation glob is not supported by the installed tsup version, fall back
to listing entries explicitly:
`entry: ['src/index.ts', 'src/createTinyIntl.ts', 'src/detectLocale.ts', 'src/detectBrowserLocale.ts', 'src/utils/index.ts', 'src/utils/flattie.ts', 'src/utils/relativeTimeFormat.ts']`
— and say in your report which form you used.

### Step 5: Delete the dead vite build from core

5a. In `packages/core/package.json`, collapse the two build scripts:

```json
    "build": "npm run build:esm && npm run build:cjs",
    "build:esm": "FORMAT=esm tsup",
    "build:cjs": "FORMAT=cjs tsup",
```

(removing `"build2"` and the leading `vite build`). Leave `dev`, `preview`,
`test` and `coverage` alone.

5b. In `packages/core/vite.config.ts`, remove the `plugins` and `build` keys and
their now-unused imports, keeping **only** the vitest configuration:

```ts
import { defineConfig } from 'vitest/config'; // eslint-disable-line import/no-unresolved

export default defineConfig({
  test: {},
});
```

5c. Remove the two devDependencies that existed only for that build:

```bash
npm uninstall --workspace @tiny-intl/core rollup-plugin-visualizer vite-plugin-dts
```

Keep `vite` itself — vitest 0.34 depends on it and `dev`/`preview` still use it.

5d. Delete the stale output directory (it is git-ignored, so this only affects
your working tree): `rm -rf packages/core/dist`.

**Verify**:

```bash
npm run build --workspace @tiny-intl/core
test -d packages/core/dist && echo "dist recreated — unexpected" || echo "no dist — correct"
npm run test --workspace @tiny-intl/core -- --run
```
→ build exits 0, `no dist — correct`, all core tests pass (this proves the
trimmed `vite.config.ts` still configures vitest).

### Step 6: Fix the condition ordering in the adapter packages

Both `packages/react/package.json` and `packages/preact/package.json` have the
same `types`-last problem. Their paths do exist
(`./lib/types/index.d.ts` is produced by `vite-plugin-dts`), so this is metadata
correctness rather than a live breakage. For each, replace the `exports` block
and add `sideEffects`:

```json
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

Leave `main`, `module`, `types`, `files` and everything else untouched. These
packages emit a single `.d.ts` set for both formats, so the flat form with
`types` first is correct and no nesting is needed.

**Verify**: for each adapter,

```bash
npm run build --workspace @tiny-intl/react
npx --yes publint packages/react
```
→ build exits 0; publint reports no errors. Repeat for preact.
(If an adapter build fails inside `Translate.tsx`, that is the pre-existing
failure owned by plan 003 — note it and move on; it is not caused by this plan.)

Do **not** apply this to `packages/solid-js` even if the directory is still
present — plan 002 deletes it.

### Step 7: Re-run the packaging checks

```bash
npm run build --workspace @tiny-intl/core
npx --yes publint packages/core
npx --yes @arethetypeswrong/cli --pack packages/core
npm test
npm run lint:all
```

**Verify**: both packaging tools report strictly better results than the Step 2
baseline — specifically, no error about a missing or unresolvable types entry.
All tests pass. Lint exits 0. Include the before/after tool output in your
report.

(If `npm test` fails inside a react or preact `Translate` test, check whether
plan 003 has landed — that is its territory, not this plan's.)

## Test plan

This plan is not covered by unit tests — it changes packaging metadata, which
the vitest suite (importing from `../src`) cannot observe. Verification is
therefore tool-based, and that is the point of Steps 2 and 8:

- `publint` — validates `exports`, `main`, `module`, `types`, file existence and
  format/extension agreement.
- `@arethetypeswrong/cli --pack` — resolves the packed tarball as node10,
  node16-cjs, node16-esm and bundler consumers would, and reports which
  resolutions find types.
- The existing core suite must still pass, which proves the trimmed
  `vite.config.ts` still supplies vitest's configuration (Step 5).
- The per-path `test -f` loop in Step 3 is the machine-checkable guard that the
  `exports` map only names files the build actually produces.

Do not add unit tests for this plan. If you want a lasting guard, the right one
is adding `npx publint` to the CI workflow — note that as a follow-up rather
than doing it here (CI is plan 001's file).

## Done criteria

ALL must hold:

- [ ] `grep -n "lib/esm/types" packages/core/package.json` → no output
- [ ] `node -e "const e=require('./packages/core/package.json').exports; for (const k of ['.','./utils']) for (const c of ['import','require']) { const p=e[k][c].types; require('fs').accessSync('packages/core/'+p); } console.log('all exports types paths exist')"` → prints the message, exits 0
- [ ] `npm run build --workspace @tiny-intl/core` exits 0
- [ ] `ls packages/core/lib/esm packages/core/lib/cjs | grep vite-env` → no output
- [ ] `test -d packages/core/dist` → false after a build
- [ ] `grep -n "vite build" packages/core/package.json` → no output
- [ ] `grep -l '"sideEffects": false' packages/core/package.json packages/react/package.json packages/preact/package.json` → three files
- [ ] `npx --yes publint packages/core` → no errors
- [ ] `npx --yes @arethetypeswrong/cli --pack packages/core` → strictly better than the Step 2 baseline, with no missing-types errors
- [ ] `npm test` exits 0
- [ ] `npm run lint:all` exits 0
- [ ] `git status --porcelain packages/solid-js README.md` returns no output (both are plan 002's)
- [ ] `git status --porcelain` lists only files from the In-scope list
- [ ] `plans/README.md` status row for 005 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `packages/core/lib/esm/types/` **does** exist after a clean build — the build
  differs from what this plan measured, and the `exports` map may be correct.
- Any path in the new `exports` map does not exist after a build (the Step 3
  file-existence loop prints `MISSING`).
- `npm uninstall` of `vite-plugin-dts` or `rollup-plugin-visualizer` breaks a
  build in *any* package — the adapters use both, and if the monorepo relied on
  hoisting from core's devDependencies, they must be added to the adapters'
  own devDependencies instead. Report before doing that.
- Trimming `packages/core/vite.config.ts` stops vitest from running. Restore the
  file and report; the fix is to move the config to `vitest.config.ts` instead,
  which is a different change than this plan describes.
- You conclude the fix requires changing package `version` fields, or running
  `npm publish` / `lerna publish`. It does not — publishing is a separate,
  human-gated action.
- `@arethetypeswrong/cli` reports *worse* results after the change than before.

## Maintenance notes

- **Follow-up worth doing**: add `npx publint` (and optionally
  `attw --pack`) as a CI step so a future edit to `exports` cannot silently
  point at a non-existent file again. That belongs in
  `.github/workflows/unit-tests.yml`, which plan 001 rewrites — sequence this
  after 001.
- **This change ships on the next release, not immediately.** `exports` changes
  affect consumers only once published. Whoever runs `npm run release` should
  treat this as a patch that fixes type resolution and mention it in the
  release notes.
- **`files: ["lib", "src"]` must keep `src`** — source maps reference it. If
  someone later removes `sourcemap: true` from `tsup.config.ts`, `src` can go
  too, and the npm tarball roughly halves.
- **What a reviewer should scrutinise**: that `types` is the first key in every
  condition object; that the CJS branch points at `.d.cts` and the ESM branch at
  `.d.ts`; and that `sideEffects: false` is actually true for these packages
  (it is — every module is pure function/type declarations, with no top-level
  side effects).
- The adapter packages still build with vite and emit a `dist/stats.html` from
  `rollup-plugin-visualizer` into a directory that is not published. That is
  harmless there (unlike core, whose *entire* vite output was dead) and is left
  alone deliberately.
- If plan 002 is rejected and `packages/solid-js` survives, it needs the same
  Step 6 treatment (`types` first, `sideEffects: false`) — it has the identical
  `exports` shape as the other two adapters.
