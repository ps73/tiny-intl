# Plan 008: Make `attw` green for both adapters — split the `types` condition and stop emitting unresolvable declaration imports

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed as in scope. If any STOP condition occurs, stop and
> report — do not improvise.
>
> **Drift check (run first)**:
> `git diff --stat f5abd18..HEAD -- packages/react packages/preact`

## Status

- **Priority**: P1 — last known packaging defect; affects every TypeScript consumer
- **Effort**: M
- **Risk**: MED — changes how declarations are generated *and* how they resolve.
  No runtime code changes, so the test suite cannot catch a mistake here; the
  packaging tools are the only gate.
- **Depends on**: plans 001–007 (merged into `main` at `f5abd18`)
- **Category**: bug / packaging
- **Planned at**: commit `f5abd18`, 2026-08-12

## Why this matters

`attw --pack` currently fails on both adapters on both node16 rows:

```
┌───────────────────┬──────────────────────────────┐
│ node10            │ 🟢                           │
│ node16 (from CJS) │ 👺 Masquerading as ESM       │
│                   │ 🥴 Internal resolution error │
│ node16 (from ESM) │ 🥴 Internal resolution error │
│ bundler           │ 🟢                           │
└───────────────────┴──────────────────────────────┘
```

`node16` is the resolution mode any modern TypeScript consumer uses. Today they
get declarations that either misrepresent the module format or contain imports
that do not resolve. `@tiny-intl/core` is already green on all four rows (plan
005); the adapters are the last packaging defect standing.

**Three independent causes**, confirmed from `attw -f json`, not inferred:

### Cause 1 — `types` is a single shared condition (👺 FalseESM, both adapters)

```json
"exports": { ".": {
  "types": "./lib/types/index.d.ts",
  "import": "./lib/index.js",
  "require": "./lib/index.cjs"
} }
```

The package declares `"type": "module"`, so `index.d.ts` is interpreted as
**ESM**. But it is also the declaration served to `require` consumers, whose
implementation is `index.cjs` — **CJS**. attw's raw finding:

```json
{"kind":"FalseESM",
 "typesFileName":".../lib/types/index.d.ts",
 "implementationFileName":".../lib/index.cjs",
 "typesModuleKind":{"detectedReason":"type","reasonFileName":".../package.json"},
 "implementationModuleKind":{"detectedReason":"extension"}}
```

`publint` reports the same thing ("types is interpreted as ESM when resolving
with the require condition").

### Cause 2 — extensionless relative re-exports (🥴, both adapters)

`packages/*/lib/types/index.d.ts` is emitted as:

```ts
export * from './Translate';
export * from './useIntl';
```

Under node16 ESM resolution, relative specifiers in an ESM declaration file
**must carry an explicit extension**. attw's raw finding, once per specifier:

```json
{"kind":"InternalResolutionError","resolutionOption":"node16",
 "fileName":".../lib/types/index.d.ts","moduleSpecifier":"./Translate",
 "resolutionMode":99}
```

This comes straight from the source: `packages/react/src/index.ts` and
`packages/preact/src/index.ts` both read

```ts
export * from './Translate';
export * from './useIntl';
```

**`@tiny-intl/core` does not have this problem** because its own
`packages/core/src/index.ts` already uses explicit extensions:

```ts
export * from './createTinyIntl.js';
export * from './detectBrowserLocale.js';
export * from './detectLocale.js';
```

So the adapters simply diverge from a convention core already follows.

### Cause 3 — a deep import into core's internals (🥴, **react only**)

`packages/react/lib/types/useIntl.d.ts` contains:

```ts
export declare function useIntl(): {
    t: (key: string, templateParams?: import("@tiny-intl/core/lib/esm/createTinyIntl").TinyIntlTranslateTemplate | undefined) => string;
    ...
```

`@tiny-intl/core/lib/esm/createTinyIntl` is **not an exported subpath** — core's
`exports` map declares only `.`, `./utils` and `./package.json`. So that import
cannot resolve for any consumer.

The cause is that react's `useIntl()` has an **inferred** return type, so the
declaration emitter had to name core's internal module to write it down.
**Preact does not have this problem** — plan 006 annotated it
`export function useIntl(): TinyIntl<string>`, and its emitted declaration is
clean:

```ts
import type { TinyIntl } from '@tiny-intl/core';
export declare const TinyIntlContext: import("preact").Context<TinyIntl<string> | undefined>;
export declare function useIntl(): TinyIntl<string>;
```

Applying the same one-line annotation to react fixes cause 3 and closes the
react/preact asymmetry recorded as deferred finding 15.

## Current state

- `packages/react/src/useIntl.tsx:8` — `export function useIntl() {` (inferred).
- `packages/preact/src/useIntl.tsx:8` — `export function useIntl(): TinyIntl<string> {` (already annotated).
- `packages/react/src/index.ts`, `packages/preact/src/index.ts` — two
  extensionless re-export lines each.
- `packages/core/src/index.ts` — the convention to copy (explicit `.js`).
- Both adapters' `vite.config.ts` — `dts({ outDir: resolve(__dirname, 'lib', 'types'), insertTypesEntry: true })`,
  and a vitest `test` block that must be left alone.
- `packages/react/package.json` declares `vite-plugin-dts: "3.6.0"` (pinned);
  `packages/preact/package.json` declares `"^3.6.4"`. **Version skew** —
  deferred finding 13. Align them here, because divergent declaration emitters
  are exactly how the adapters drifted apart in the first place.
- Emitted today: `lib/types/{index,Translate,useIntl}.d.ts` per adapter.

### Conventions

- Prettier: `singleQuote: true`, `printWidth: 100`, `trailingComma: "all"`.
- Commitlint scopes: `core`, `react`, `preact` only.
- Baseline to preserve: `npm test` → **52 passing**; bundle sizes core 1422 B,
  react 548 B, preact 735 B.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm ci` | exit 0 |
| Build | `npm run build --workspace @tiny-intl/react` | exit 0 |
| Typecheck | `cd packages/react && npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | 52 pass |
| Lint | `npm run lint:all` | exit 0 |
| Types check | `npx --yes @arethetypeswrong/cli --pack packages/react` | all 🟢 |
| Publish lint | `npx --yes publint packages/react` | no errors |

## Scope

**In scope**:

- `packages/react/src/useIntl.tsx` — return type annotation only (cause 3)
- `packages/react/src/index.ts`, `packages/preact/src/index.ts` — add `.js`
  extensions (cause 2)
- `packages/react/package.json`, `packages/preact/package.json` — `exports`
  block, the `build` script, and the `vite-plugin-dts` devDependency version
- `package-lock.json` — consequence of the devDependency change

**Out of scope**:

- `packages/core/**` — already green on all four attw rows.
- `packages/*/src/Translate.tsx` — not involved in any of the three causes.
- The `test` blocks in the adapters' `vite.config.ts`.
- Any test file.
- Changing what `useIntl` returns at runtime, or any other runtime behaviour.
  **This plan must not change a single byte of emitted JavaScript.**
- Publishing, versions, `lerna.json`.

## Git workflow

- Conventional commits, scopes `react` / `preact`. Suggested:
  `fix(react): annotate useIntl return type`,
  `fix(react): use explicit extensions in the entry re-exports`,
  `fix(react): split types conditions for import and require`.
- Do NOT push or open a PR.

## Steps

### Step 1: Record the baseline

```bash
npm ci
for p in core react preact; do npm run build --workspace @tiny-intl/$p; done
npx --yes @arethetypeswrong/cli --pack packages/react
npx --yes @arethetypeswrong/cli --pack packages/preact
ls packages/react/lib/types packages/preact/lib/types
grep -o '@tiny-intl/core/[^"'"'"')]*' packages/react/lib/types/*.d.ts packages/preact/lib/types/*.d.ts
```

**Expected**: both adapters show 👺 + 🥴 on node16-from-CJS and 🥴 on
node16-from-ESM; three `.d.ts` files each; the `grep` finds
`@tiny-intl/core/lib/esm/createTinyIntl` in **react only**. Record all of it.

If the baseline is already green, **STOP** — something has changed and this plan
is stale.

### Step 2: Fix cause 3 — annotate react's `useIntl`

In `packages/react/src/useIntl.tsx`, change line 8 to match what preact already
does:

```tsx
export function useIntl(): TinyIntl<string> {
```

`TinyIntl` is already imported as a type on line 2 — no new import needed.

If the returned object is not assignable to `TinyIntl<string>`, **STOP and
report the compiler error**; do not add a cast. (Preact's identical object is
assignable, so this should just work.)

**Verify**:

```bash
cd packages/react && npx tsc --noEmit; echo "tsc=$?"; cd ../..
npm run build --workspace @tiny-intl/react
grep -c '@tiny-intl/core/lib' packages/react/lib/types/*.d.ts
```
→ `tsc=0`; the grep finds **0** deep-path references.

### Step 3: Fix cause 2 — explicit extensions in the entry re-exports

In **both** `packages/react/src/index.ts` and `packages/preact/src/index.ts`:

```ts
export * from './Translate.js';
export * from './useIntl.js';
```

This matches `packages/core/src/index.ts`, which already does exactly this. The
`.js` extension is correct in TypeScript source — the compiler maps it back to
the `.tsx` file — and it is what makes the emitted declaration resolvable under
node16.

**Verify**:

```bash
cd packages/react && npx tsc --noEmit; echo "react tsc=$?"; cd ../..
cd packages/preact && npx tsc --noEmit; echo "preact tsc=$?"; cd ../..
npm run build --workspace @tiny-intl/react
npm run build --workspace @tiny-intl/preact
cat packages/react/lib/types/index.d.ts
npm test
```
→ both `tsc=0`; the emitted `index.d.ts` now reads
`export * from './Translate.js';` / `export * from './useIntl.js';`;
**52 tests still pass**.

If the emitted `index.d.ts` still has extensionless specifiers, the dts plugin
is rewriting them — **STOP and report**; the remaining steps assume this worked.

### Step 4: Align the `vite-plugin-dts` versions

`packages/react` pins `3.6.0`; `packages/preact` floats on `^3.6.4`. Align both
to `^3.6.4` so the two adapters generate declarations with the same emitter:

```bash
npm install -D --workspace @tiny-intl/react vite-plugin-dts@^3.6.4
```

**Verify**: `grep '"vite-plugin-dts"' packages/react/package.json packages/preact/package.json`
→ both `^3.6.4`. Rebuild both; `npm test` still 52.

### Step 5: Fix cause 1 — emit a `.d.cts` and split the `types` condition

The `require` branch needs a declaration file that is *interpreted as CJS*. A
`.d.cts` is CJS regardless of the package's `"type"` field, so a copy of the
ESM entry declaration under that extension is what the `require` condition
should point at.

**This only works because Step 3 made the entry declaration self-consistent** —
its two relative specifiers now carry `.js`, and inside a `.d.cts` TypeScript
maps `./Translate.js` to `./Translate.d.ts`, which exists.

5a. In **both** adapters' `package.json`, extend the `build` script to emit the
copy (using node, not `cp`, so it works on any platform):

```json
    "build": "tsc && vite build && node -e \"const f=require('fs');f.copyFileSync('lib/types/index.d.ts','lib/types/index.d.cts')\"",
```

5b. In **both** adapters' `package.json`, replace the flat `exports` block with
nested conditions, `types` first in each — the same shape `@tiny-intl/core`
already uses:

```json
  "exports": {
    ".": {
      "import": {
        "types": "./lib/types/index.d.ts",
        "default": "./lib/index.js"
      },
      "require": {
        "types": "./lib/types/index.d.cts",
        "default": "./lib/index.cjs"
      }
    },
    "./package.json": "./package.json"
  },
```

Leave `main`, `module`, `types`, `files` and `sideEffects` untouched — the
top-level `types` field is the node10 fallback and is still correct.

**Verify**:

```bash
rm -rf packages/react/lib packages/preact/lib
npm run build --workspace @tiny-intl/react
npm run build --workspace @tiny-intl/preact
ls packages/react/lib/types packages/preact/lib/types
```
→ each contains `index.d.ts`, `index.d.cts`, `Translate.d.ts`, `useIntl.d.ts`.

### Step 6: Prove it

```bash
npx --yes @arethetypeswrong/cli --pack packages/react
npx --yes @arethetypeswrong/cli --pack packages/preact
npx --yes publint packages/react
npx --yes publint packages/preact
```

**Verify**: **all four resolution rows 🟢 for both adapters**; publint reports no
errors.

If any row is still red, report the exact `attw -f json` output for the
remaining problem rather than guessing at another change.

Then confirm nothing else moved:

```bash
npm test
npm run lint:all
cd packages/react && npx tsc --noEmit; echo "react tsc=$?"; cd ../..
cd packages/preact && npx tsc --noEmit; echo "preact tsc=$?"; cd ../..
node -e "require('./packages/react/lib/index.cjs'); console.log('react cjs OK')"
node -e "require('./packages/preact/lib/index.cjs'); console.log('preact cjs OK')"
```

And confirm the **runtime output is byte-identical** — this plan changes only
types and packaging:

```bash
git stash && npm run build --workspace @tiny-intl/react && md5 packages/react/lib/index.js packages/react/lib/index.cjs
git stash pop && npm run build --workspace @tiny-intl/react && md5 packages/react/lib/index.js packages/react/lib/index.cjs
```
→ the four checksums must pair up identically. (Use `md5sum` if `md5` is not
available.) If they differ, Step 2's annotation changed emitted JavaScript,
which it must not — **STOP and report**.

### Step 7: Confirm bundle size did not regress

```bash
cat > measure.mjs <<'EOF'
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const t = [
  ['@tiny-intl/core','packages/core/lib/esm/index.js',[]],
  ['@tiny-intl/react','packages/react/lib/index.js',['react','react-dom','react/jsx-runtime']],
  ['@tiny-intl/preact','packages/preact/lib/index.js',['preact','preact/compat','preact/jsx-runtime']],
];
for (const [n,e,x] of t) {
  const r = await build({entryPoints:[e],bundle:true,minify:true,format:'esm',
    treeShaking:true,external:x,write:false,legalComments:'none'});
  console.log(n.padEnd(20)+' min+gzip='+String(gzipSync(r.outputFiles[0].contents,{level:9}).length).padStart(4)+'B');
}
EOF
node measure.mjs
rm measure.mjs
```

**Verify**: core `1422B`, react `548B`, preact `735B` — **unchanged**. Types
never reach a bundle, so any movement here means something went wrong.

Also report the tarball delta (`npm pack --dry-run` in each adapter): expect
+1 file and a small increase from the added `.d.cts`, against baselines of
react 15.5 kB / 7 files and preact 12.0 kB / 7 files.

## Test plan

No new tests — this plan changes no runtime behaviour, and no unit test can
observe declaration-file resolution. The gates are:

- `attw --pack` on both adapters: all four rows 🟢. **This is the primary
  criterion.**
- `publint` on both: no errors.
- The existing 52 tests still pass — proves nothing runtime moved.
- The md5 comparison in Step 6 — proves the emitted JavaScript is byte-identical.
- `require()` of each adapter's CJS entry still loads.

## Done criteria

ALL must hold:

- [ ] `attw --pack packages/react` → node10, node16-CJS, node16-ESM, bundler all 🟢
- [ ] `attw --pack packages/preact` → all four 🟢
- [ ] `publint packages/react` and `packages/preact` → no errors
- [ ] `grep -c '@tiny-intl/core/lib' packages/react/lib/types/*.d.ts` → 0
- [ ] `cat packages/react/lib/types/index.d.ts` shows `.js` extensions
- [ ] `ls packages/react/lib/types` includes `index.d.cts`; same for preact
- [ ] `npm test` → 52 passing
- [ ] `npm run lint:all` → exit 0
- [ ] `tsc --noEmit` → exit 0 in both adapters
- [ ] Bundle sizes unchanged: core 1422 B, react 548 B, preact 735 B
- [ ] Emitted `lib/index.js` and `lib/index.cjs` byte-identical to before (md5)
- [ ] `git status --porcelain` lists only in-scope files; no `measure.mjs` left

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1's baseline is already green.
- React's returned object is not assignable to `TinyIntl<string>` (Step 2).
- The emitted `index.d.ts` still has extensionless specifiers after Step 3.
- Any attw row is still red after Step 5 — report the `-f json` detail for the
  remaining problem instead of trying another fix.
- The md5 check shows emitted JavaScript changed.
- Bundle size moves at all.
- You find yourself wanting to edit `packages/core/**`, a `Translate.tsx`, a
  test file, or a `vite.config.ts` `test` block.
- Making attw green appears to require `rollupTypes: true` (which would pull in
  `@microsoft/api-extractor`). That is a bigger change than this plan scopes —
  report it as a finding and stop.

## Maintenance notes

- **Why not `rollupTypes: true`?** Bundling declarations into a single
  self-contained file would also solve cause 2, and would ship fewer files. It
  requires `@microsoft/api-extractor` as an extra build dependency, and the
  `.js`-extension fix is smaller, matches what core already does, and keeps the
  declaration files readable. If the adapters ever grow more modules, revisit.
- **The `.d.cts` is a copy, and copies drift.** It is regenerated on every build
  by the `build` script, so it cannot go stale — but if anyone adds a second
  entry point, the copy step needs extending. A comment in `package.json` is not
  possible; this note is the record.
- **What a reviewer should scrutinise**: that no `.tsx`/runtime file changed
  except react's one-line return annotation, and that `attw` is green on all
  four rows for both adapters rather than "better than before".
- **This closes deferred findings 13 (dts version skew), 14 (adapter attw) and
  15 (react/preact `useIntl` type asymmetry).**
- Once green, add `npx publint` and `npx attw --pack` to CI so this cannot
  regress — the whole class of defect is invisible to the test suite.
