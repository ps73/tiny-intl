# Plan 006: `@tiny-intl/preact` ships a type entry point that re-exports a file it never emits

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed as in scope. If any STOP condition occurs, stop and
> report — do not improvise.
>
> **This plan may turn out to be a no-op.** Step 1 decides. Read it first.
>
> **Drift check (run first)**:
> `git diff --stat 794eb48..HEAD -- packages/preact packages/core/package.json`

## Status

- **Priority**: P1 (published, user-facing, silent)
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/005-fix-core-package-exports.md` — see Step 1
- **Category**: bug / packaging
- **Planned at**: commit `794eb48`, observed 2026-08-12 while reviewing plan 002

## Why this matters

`packages/preact/lib/types/index.d.ts` — the file `@tiny-intl/preact` names in
both its `types` field and its `exports` map — contains:

```ts
export * from './Translate';
export * from './useIntl';
```

But `useIntl.d.ts` **is not emitted**. The directory after a clean build holds
only `Translate.d.ts` and `index.d.ts`. So the package's public type entry point
re-exports a module that does not exist in the tarball.

Every TypeScript consumer of `@tiny-intl/preact` is affected: `useIntl` — the
package's primary API — has no type declaration, and depending on the consumer's
`moduleResolution` and `skipLibCheck` settings they get either an implicit
`any`, an unresolved-module error on the re-export, or a broken entry point.
`@tiny-intl/react` emits all three files correctly, so this is preact-only and
easy to miss.

The build does not fail. `vite-plugin-dts` prints six `TS2742` diagnostics,
declines to emit the file, and exits 0. Nothing in CI looks at that output.

### Measured evidence (2026-08-12)

```
$ npm run build --workspace @tiny-intl/preact      # exit 0
src/useIntl.tsx:8:17 - error TS2742: The inferred type of 'useIntl' cannot be
named without a reference to '../../../node_modules/@tiny-intl/core/lib/esm/createTinyIntl'.
This is likely not portable. A type annotation is necessary.
   (×6)

$ ls packages/react/lib/types/     →  Translate.d.ts  index.d.ts  useIntl.d.ts
$ ls packages/preact/lib/types/    →  Translate.d.ts  index.d.ts
```

### Root cause, and why it is probably plan 005's to fix

`packages/react/tsconfig.json` uses `"moduleResolution": "Node"`;
`packages/preact/tsconfig.json` uses `"moduleResolution": "bundler"`. That is the
only material difference between two otherwise byte-identical `useIntl.tsx`
files.

`"Node"` (node10) ignores a package's `exports` map entirely and reads the
top-level `"types": "./lib/esm/index.d.ts"` from `@tiny-intl/core` — which is
correct, so react resolves `TinyIntl` through the package entry and can name it.

`"bundler"` **honours** `exports`. And `@tiny-intl/core`'s exports map declares:

```json
"types": "./lib/esm/types/index.d.ts"
```

That path does not exist — it is exactly the defect plan 005 fixes. With the
declared types path unresolvable, TypeScript falls back to reaching the symbol
through the deep internal path `…/lib/esm/createTinyIntl`, which it cannot write
into a portable `.d.ts` — hence `TS2742`, hence no emit.

**That hypothesis was tested on 2026-08-12 and DISPROVEN.** Plan 005 landed —
core's `exports` map now declares `types` first in every condition, pointing at
files that exist, and `@arethetypeswrong/cli` reports 🟢 for node16-CJS,
node16-ESM and bundler. The preact build was then re-run from scratch:

```
$ npm run build --workspace @tiny-intl/preact     # exit 0
TS2742 count: 6                                   # unchanged
$ ls packages/preact/lib/types/
Translate.d.ts  index.d.ts                        # useIntl.d.ts still missing
$ ls packages/react/lib/types/
Translate.d.ts  index.d.ts  useIntl.d.ts          # react still fine
```

So the broken `exports` map was **not** the cause. Do not spend time re-testing
it — go straight to the fix in Step 2, which addresses `TS2742` directly and
independently of root cause (the diagnostic itself says "A type annotation is
necessary").

Two candidate causes remain, neither yet confirmed, both only worth chasing if
Step 2 fails:

1. **`moduleResolution` split** — preact `"bundler"`, react `"Node"`. Still the
   most plausible: the two files are otherwise byte-identical below their import
   lines. Step 3 covers this as a fallback.
2. **`vite-plugin-dts` version skew** — preact resolves its own `^3.6.4` (3.6.4
   installed) while react uses the hoisted pinned `3.6.0`. Worth testing by
   temporarily aligning them if Steps 2 and 3 both fail.

Why the annotation fix works regardless: `TS2742` fires when TypeScript must
*write down* an inferred type but cannot construct a portable path to the
symbol's declaring module. `useIntl`'s return type is inferred from a spread of
`TinyIntl<string>` plus eight wrapped callbacks. Annotate the return explicitly
with a type that is already imported by name, and there is nothing left to
infer.

## Current state

- `packages/preact/tsconfig.json` — `"moduleResolution": "bundler"`,
  `"target": "ES2020"`, `paths` aliasing `react`/`react-dom` to `preact/compat`.
- `packages/preact/src/useIntl.tsx:8` — `export function useIntl() {` with an
  **inferred** return type. The inferred type spreads `intl`
  (`TinyIntl<string>`, imported as a type on line 2) plus eight locally wrapped
  callbacks.
- `packages/preact/vite.config.ts` — `dts({ outDir: resolve(__dirname, 'lib', 'types'), insertTypesEntry: true })`.
- `packages/react/src/useIntl.tsx` — identical source, different import
  specifier (`'react'` vs `'preact/compat'`), emits fine.

### Conventions

- Prettier: `singleQuote: true`, `printWidth: 100`, `trailingComma: "all"`;
  2-space indent.
- Commit scopes allowed by commitlint: `core`, `react`, `preact`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm install` | exit 0 |
| Build preact | `npm run build --workspace @tiny-intl/preact` | exit 0 |
| Inspect emitted types | `ls packages/preact/lib/types/` | 3 files incl. `useIntl.d.ts` |
| Count TS2742 | `npm run build --workspace @tiny-intl/preact 2>&1 \| grep -c TS2742` | `0` |
| Tests | `npm test` | all pass |
| Lint | `npm run lint:all` | exit 0 |

## Scope

**In scope**:

- `packages/preact/src/useIntl.tsx` — an explicit return type annotation (Step 2)
- `packages/preact/tsconfig.json` — only as the documented fallback in Step 3
- `packages/preact/package.json` + `package-lock.json` — only as the second
  fallback in Step 3b

**Out of scope**:

- `packages/core/**` — the `exports` map is plan 005's; do not edit it here.
- `packages/react/**` — emits correctly; leave it alone.
- Changing what `useIntl` returns at runtime. This is a types-only change; the
  emitted JavaScript must be byte-identical.
- `packages/preact/src/Translate.tsx` and all test files.

## Git workflow

- Conventional commits. Suggested: `fix(preact): emit type declarations for useIntl`.
- Do NOT push or open a PR.

## Steps

### Step 1: Confirm the bug still reproduces on a clean build

Plan 005 must have landed in your branch. Confirm, then reproduce:

```bash
grep -n "lib/esm/types" packages/core/package.json    # expect: no output
rm -rf packages/preact/lib packages/core/lib
npm run build --workspace @tiny-intl/core
npm run build --workspace @tiny-intl/preact 2>&1 | tee /tmp/preact-build.txt
grep -c TS2742 /tmp/preact-build.txt
ls packages/preact/lib/types/
```

If the first grep still finds `lib/esm/types`, plan 005 has NOT landed —
**STOP and report**.

**Expected** (measured 2026-08-12): `TS2742` count `6`, and
`packages/preact/lib/types/` contains only `Translate.d.ts` and `index.d.ts`.
Record both. This is the "before" evidence.

If instead the count is 0 and `useIntl.d.ts` is present, the bug has been fixed
by something else since — **STOP and report**; do not make changes the repo no
longer needs.

**Verify**: you have the `TS2742` count and the directory listing recorded.

### Step 2: Annotate `useIntl`'s return type explicitly

`TS2742` means TypeScript cannot *write down* the inferred type without
referencing a module it has no portable path to. The direct fix is to stop
relying on inference: declare the return type using only types that are already
imported by name.

In `packages/preact/src/useIntl.tsx`, add an exported interface describing the
return value and annotate the function with it. The shape must match what the
function actually returns today — spread of `TinyIntl<string>`, with `t`, `tc`,
`n`, `d`, `dt`, `rt`, `sort`, `collator`, `list` and `change` overridden. Derive
it from the already-imported `TinyIntl` type rather than restating each
signature, e.g.:

```tsx
export type UseIntlResult = TinyIntl<string>;

export function useIntl(): UseIntlResult {
```

Then check that against reality: the function returns `{ ...intl, t, tc, n,
d: dt, dt, rt, sort, collator, list, change: intl.change }`. If every one of
those wrapped values has the same type as the corresponding member of
`TinyIntl<string>` (they are `useCallback` wrappers around exactly those
members, so they should), `TinyIntl<string>` is the honest annotation and no
new interface is needed.

**If the annotation does not typecheck** — i.e. the returned object is not
assignable to `TinyIntl<string>` — do not force it with a cast. That would mean
the wrappers genuinely change the type, which is information your reviewer
needs. STOP and report the compiler error.

**Verify**:

```bash
cd packages/preact && npx tsc --noEmit; echo "tsc exit=$?"; cd ../..
npm run build --workspace @tiny-intl/preact 2>&1 | grep -c TS2742    # expect 0
ls packages/preact/lib/types/                                         # expect 3 files
```

### Step 3: Fallback only — align `moduleResolution` with react

**Only if Step 2 fails to eliminate `TS2742`.** Change
`packages/preact/tsconfig.json`'s `"moduleResolution": "bundler"` to `"Node"`,
matching `packages/react/tsconfig.json`, and remove
`"allowImportingTsExtensions": true` if TypeScript then rejects it (that option
requires `bundler`/`node16`+ resolution and `noEmit`).

This is a fallback, not the preferred fix: `bundler` is the more modern and more
correct setting, and moving away from it trades a newer resolution mode for a
declaration file. Take it only if Step 2 has failed, revert it if it does not
help, and say so prominently in your report either way.

**Verify**: same three commands as Step 2.

### Step 3b: Second fallback — test the plugin version skew

**Only if Steps 2 and 3 both fail.** `packages/preact` resolves its own
`vite-plugin-dts@3.6.4`; `packages/react` uses the hoisted pinned `3.6.0`.
Temporarily align preact to `3.6.0`:

```bash
npm install -D --workspace @tiny-intl/preact vite-plugin-dts@3.6.0
npm run build --workspace @tiny-intl/preact 2>&1 | grep -c TS2742
ls packages/preact/lib/types/
```

If that emits `useIntl.d.ts`, the plugin version was the cause — keep the change
(pinning both adapters to the same version is desirable anyway, see Maintenance
notes) and revert whatever Step 3 changed. If it does not help, revert this too
and **STOP**: three hypotheses exhausted means the diagnosis needs a human.

**Verify**: report which of Steps 2 / 3 / 3b actually fixed it, and confirm you
reverted the ones that did not.

### Step 4: Confirm the runtime output did not change

This is a types-only plan. Prove the emitted JavaScript is unaffected:

```bash
git diff --stat -- packages/preact/src/useIntl.tsx
npm test
npm run lint:all
```

**Verify**: the source diff touches only type annotations (no change to any
expression or statement); all tests pass; lint exits 0.

## Test plan

The regression guard here is a build artifact, not a unit test — the failure
mode is "a file is missing from the package", which no runtime test can see.

- **Primary check**: `ls packages/preact/lib/types/` contains `useIntl.d.ts`.
- **Primary check**: the preact build emits zero `TS2742` diagnostics.
- **Consumer-level check** (do this if plan 005's tooling is available):
  `npx --yes @arethetypeswrong/cli --pack packages/preact` — it resolves the
  packed tarball the way a consumer would and will flag an unresolvable
  re-export.
- The existing preact test suite (added by plan 001) must still pass unchanged;
  it proves the runtime behaviour is untouched.

Do not add a unit test for this. If you want a lasting guard, the right one is a
CI assertion that the build emits no `TS2742` — noted as a follow-up in plan 001.

## Done criteria

ALL must hold (or Step 1 concluded no-op, in which case only the first two):

- [ ] `ls packages/preact/lib/types/` lists `useIntl.d.ts`, `Translate.d.ts`, `index.d.ts`
- [ ] `npm run build --workspace @tiny-intl/preact 2>&1 | grep -c TS2742` → `0`
- [ ] `cd packages/preact && npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run lint:all` exits 0
- [ ] `git status --porcelain` lists only in-scope files
- [ ] The report states which Step 1 outcome occurred

## STOP conditions

Stop and report back (do not improvise) if:

- `grep -n "lib/esm/types" packages/core/package.json` still matches — plan 005
  has not landed and this plan's Step 1 cannot run.
- The returned object is not assignable to `TinyIntl<string>` (Step 2). Report
  the compiler error; do not cast around it.
- Eliminating `TS2742` appears to require editing `packages/core/**`. That is
  plan 005's territory — report what you found.
- The preact build starts *failing* (non-zero exit) at any point. It exits 0
  today; a regression to failure is worse than the bug.

## Maintenance notes

- **How this stayed hidden**: `vite-plugin-dts` prints `TS2742` as an "error"
  but does not fail the build, and CI never built the adapters at all. The
  durable fix is a CI step that fails on `TS2742` — cheap, and it would have
  caught this the day it appeared.
- **Version skew worth resolving separately**: `packages/react` pins
  `vite-plugin-dts` to `3.6.0` while `packages/preact` floats on `^3.6.4`, so
  the two adapters generate declarations with different plugin versions. Whether
  or not that contributed here, having two adapters on two versions of the same
  build plugin is a latent source of exactly this kind of asymmetry. Align them.
- **What a reviewer should scrutinise**: that the diff is annotations only — the
  compiled JS must be identical — and that `UseIntlResult` (if introduced) is
  actually exported, or consumers hit `TS4023` on the re-export instead.
- If Step 1 reported no-op, keep this plan file: it documents why the preact
  declaration output is worth watching, and the CI guard in the first bullet is
  still worth adding.
