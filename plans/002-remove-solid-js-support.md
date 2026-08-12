# Plan 002: Remove `@tiny-intl/solid-js` from the monorepo and deprecate it on npm

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 794eb48..HEAD -- packages/solid-js .eslintrc.cjs package.json commitlint.config.js README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **This plan deletes a published package.** Step 7 is human-gated and must NOT
> be executed by an agent.

## Why this matters

The maintainer has decided to drop Solid support in the next release. This plan
carries that decision out.

The decision is well-supported by what the audit found. `@tiny-intl/solid-js` is
the only adapter whose primary API does not work at all: `memoizeCallback` at
`packages/solid-js/src/useIntl.tsx:22` calls `fn.call(args)`, which passes the
argument *array* as the `this` value and forwards **no arguments**, so every
primitive returned by `useIntl()` — `t`, `tc`, `n`, `dt`, `rt`, `sort`,
`collator`, `list` — returns `'[undefined]'` or its numeric equivalent rather
than a translation. That has been the published behaviour since the adapter
shipped, which is also a strong signal about how many users it has.

Removing it deletes a third copy of the triplicated `Translate.tsx`, drops two
lint dependencies plus the whole Solid toolchain from the dev install, and
removes the single hardest piece of work from plan 001 (Solid + vitest 0.34
configuration). Plans 001 and 003 have already been scoped to exclude
`packages/solid-js` on the assumption this plan lands.

What removal does **not** do: it does not un-publish anything. `@tiny-intl/solid-js`
versions up to `1.2.0` stay installable from npm forever. Step 7 covers the
deprecation notice that tells existing installers what happened — that is the
part that actually reaches users, and it needs a human with publish rights.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW-MED — the code deletion is mechanical and fully verifiable; the
  risk lives in Step 7 (npm deprecation), which is human-gated and reversible.
- **Depends on**: none. Can run first, or in parallel with 001, 004 and 005.
- **Category**: tech-debt
- **Planned at**: commit `794eb48`, 2026-08-12

## Current state

Every reference to Solid in the repository, found with
`grep -rni solid . --exclude-dir={node_modules,.git,lib,dist,coverage,plans}`.
This list is exhaustive as of `794eb48` — if you find a reference not on it,
that is drift and a STOP condition.

### 1. The package itself — `packages/solid-js/` (13 tracked files)

```
packages/solid-js/.gitignore
packages/solid-js/README.md
packages/solid-js/package.json
packages/solid-js/src/Translate.tsx
packages/solid-js/src/index.ts
packages/solid-js/src/useIntl.tsx
packages/solid-js/src/vite-env.d.ts
packages/solid-js/tsconfig.json
packages/solid-js/tsconfig.node.json
packages/solid-js/vite.config.ts
```

(plus git-ignored `lib/` and `dist/` build output in the working tree)

`packages/solid-js/package.json` declares `"name": "@tiny-intl/solid-js"`,
`"version": "1.2.0"`, a `solid-js: >=1.5.0` peer dependency and a
`@tiny-intl/core: ^1.2.0` dependency. **No other package in this repo depends on
it** — `packages/react/package.json` and `packages/preact/package.json` depend
only on `@tiny-intl/core`, and nothing imports from `@tiny-intl/solid-js`.

### 2. `.eslintrc.cjs:72-79` — the Solid lint override

```js
    {
      files: ['packages/solid-js/**/*.ts', 'packages/solid-js/**/*.tsx'],

      extends: [
        '@gridventures/eslint-config-solid-js/typescript',
        '@gridventures/eslint-config-base/prettier',
      ],
    },
```

This is the third entry in the `overrides` array, between the React/Preact
override (ends line 70) and the `'**/*.config.*'` override (starts line 81).

### 3. `package.json:22,26` — two Solid-only devDependencies

```json
    "@gridventures/eslint-config-base": "^1.3.3",
    "@gridventures/eslint-config-react": "^1.4.0",
    "@gridventures/eslint-config-solid-js": "^1.4.1",
    "@gridventures/eslint-config-typescript": "^1.3.3",
    "@types/node": "^20.10.3",
    "eslint": "^8.35.0",
    "eslint-plugin-solid": "^0.13.0",
    "husky": "^8.0.3",
```

Both exist only to lint `packages/solid-js`. Note that `eslint-plugin-solid` is
declared at the root but never referenced by name in `.eslintrc.cjs` — it is
pulled in transitively by `@gridventures/eslint-config-solid-js`.

### 4. `commitlint.config.js:8` — the commit-scope allow-list

```js
    'scope-enum': async () => {
      return [2, 'always', ['core', 'react', 'solid-js', 'preact']];
    },
```

This is enforced on every commit via `.husky/commit-msg`. Leaving `'solid-js'`
in place after the package is gone means the tooling still advertises a scope
that has no code behind it.

### 5. `README.md:10` — the package list entry

```markdown
- [@tiny-intl/solid](./packages/solid) ![Solid Adater Size](https://deno.bundlejs.com/badge?q=@tiny-intl/solid-js&treeshake=%5B*%5D&config=%7B%22esbuild%22:%7B%22external%22:%5B%22solid-js%22%5D%7D%7D)
```

(The link target `./packages/solid` was already wrong — the directory is
`packages/solid-js`. The whole line goes away here, which resolves that.)

### 6. `package-lock.json` — 13 Solid-related entries

`node_modules/@gridventures/eslint-config-solid-js`,
`node_modules/@tiny-intl/solid-js`, `node_modules/babel-preset-solid`,
`node_modules/eslint-plugin-solid` (+ 5 nested `@typescript-eslint/*` entries),
`node_modules/solid-js`, `node_modules/solid-refresh`,
`node_modules/vite-plugin-solid`, and the `packages/solid-js` workspace entry.
These are regenerated, not hand-edited (Step 5).

### Not a reference, but nearby

`.vscode.tmpl/settings.json` sets `eslint.workingDirectories` to
`packages/store`, `packages/persist`, `packages/feathers` — none of which exist
in this repo. That file is stale boilerplate from another project. **Out of
scope**; recorded in `plans/README.md` as a deferred finding.

### Conventions

- Prettier: `singleQuote: true`, `printWidth: 100`, `trailingComma: "all"`;
  2-space indent (`.editorconfig`).
- `workspaces: ["packages/*"]` in the root `package.json` is a glob — removing
  the directory is sufficient, no manifest edit is needed there.
- lerna runs in fixed mode (`lerna.json` has a single `version: "1.2.1"`) and
  publishes with `--no-private`. A package that no longer exists is simply never
  published again; no lerna configuration change is required.

## Commands you will need

> Read from `package.json` during planning; `node_modules` was not installed at
> planning time, so none of these were executed.

| Purpose | Command | Expected on success |
|---|---|---|
| Install / regenerate lock | `npm install` | exit 0 |
| Core tests | `npm run test --workspace @tiny-intl/core -- --run` | all pass |
| Build an adapter | `npm run build --workspace @tiny-intl/react` | exit 0 |
| Lint | `npm run lint -- packages` (or `npm run lint:all` once plan 001 has landed) | exit 0 |
| List workspaces | `npm query ".workspace"` | three packages, no solid-js |

## Scope

**In scope** (the only files you should modify or delete):

- `packages/solid-js/**` — delete the entire directory
- `.eslintrc.cjs` — remove the Solid override block
- `package.json` (root) — remove two devDependencies
- `commitlint.config.js` — remove the `solid-js` scope
- `README.md` (root) — remove the package-list line
- `package-lock.json` — regenerated by `npm install`
- `plans/README.md` — status row only

**Out of scope** (do NOT touch, even though they look related):

- **`packages/react/**` and `packages/preact/**`.** They share no code with the
  Solid adapter — `Translate.tsx` is copy-pasted, not imported. Nothing about
  removing Solid requires touching them.
- **`packages/core/**`.** Core has no knowledge of any adapter.
- `lerna.json`, package `version` fields, and anything about the release
  process. Cutting the release is a human action (Step 7).
- `.vscode.tmpl/settings.json` — stale, but unrelated (see above).
- **Do not run `npm deprecate`, `npm unpublish`, `npm publish`, or
  `lerna publish`.** Step 7 is documentation for a human.
- Do not add a replacement, a shim, or a migration guide for Solid users beyond
  the deprecation message text in Step 7. If a migration path is wanted, that is
  a separate decision.

## Git workflow

- Branch: `advisor/002-remove-solid-js-support`
- Conventional commits, enforced by commitlint via `.husky/commit-msg`.
  **Sequencing matters here**: commit the `commitlint.config.js` change
  (Step 4) *last*, or use a non-`solid-js` scope throughout — once `'solid-js'`
  is removed from the `scope-enum`, a commit message scoped `solid-js` will be
  rejected by the hook.
  Suggested messages, all using allowed scopes:
  - `feat: remove solid-js adapter package` (no scope — allowed)
  - `chore: drop solid-js lint dependencies`
  - `docs: remove solid-js from the package list`

  Prior art in `git log`: `feat: removed defaultProps for compatibility reasons`,
  `chore: updated outdated dev dependencies`.
- This is a **breaking change for consumers of `@tiny-intl/solid-js`**. Say so in
  the commit body so whoever cuts the release picks the right version bump.
- Do NOT push, publish, or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm nothing depends on the package

Before deleting anything, prove the removal is safe:

```bash
grep -rn "@tiny-intl/solid-js" --exclude-dir=node_modules --exclude-dir=.git \
  --exclude-dir=lib --exclude-dir=dist --exclude-dir=plans \
  --include=package.json --include=*.ts --include=*.tsx .
```

**Verify**: the only matches are inside `packages/solid-js/` itself and in
`package-lock.json`. If any file under `packages/core`, `packages/react` or
`packages/preact` references `@tiny-intl/solid-js`, STOP and report — the
dependency graph is not what this plan assumes.

Also record the current published state for the Step 7 handoff:

```bash
npm view @tiny-intl/solid-js versions --json
npm view @tiny-intl/solid-js dist-tags --json
```

(If the registry is unreachable, note it and continue — this is information for
the human doing Step 7, not a gate.)

### Step 2: Delete the package directory

```bash
git rm -r packages/solid-js
rm -rf packages/solid-js
```

(The second command clears the git-ignored `lib/`, `dist/` and `node_modules`
that `git rm` leaves behind.)

**Verify**:

```bash
test -d packages/solid-js && echo "STILL PRESENT" || echo "removed"
```
→ `removed`.

### Step 3: Remove the ESLint override

In `.eslintrc.cjs`, delete the entire override object at lines 72-79 — the one
whose `files` array is `['packages/solid-js/**/*.ts', 'packages/solid-js/**/*.tsx']`.
Leave the React/Preact override above it and the `'**/*.config.*'` override
below it exactly as they are, and make sure the surrounding array commas stay
valid.

Then remove the two Solid-only devDependencies from the root `package.json`:

```bash
npm uninstall @gridventures/eslint-config-solid-js eslint-plugin-solid
```

**Verify**:

```bash
grep -n "solid" .eslintrc.cjs package.json
```
→ no output.

```bash
node -e "require('./.eslintrc.cjs'); console.log('eslintrc parses')"
```
→ prints `eslintrc parses`.

### Step 4: Remove the `solid-js` commit scope

In `commitlint.config.js`, change line 8 from:

```js
      return [2, 'always', ['core', 'react', 'solid-js', 'preact']];
```

to:

```js
      return [2, 'always', ['core', 'react', 'preact']];
```

**Verify**:

```bash
echo "fix(solid-js): should be rejected" | npx commitlint
```
→ exits **non-zero** with a `scope must be one of [core, react, preact]` error.

```bash
echo "fix(react): should be accepted" | npx commitlint
```
→ exits 0.

Remember the Git-workflow note: from this point on, no commit message may use
the `solid-js` scope.

### Step 5: Update the README and regenerate the lockfile

Delete line 10 of the root `README.md` — the whole
`- [@tiny-intl/solid](./packages/solid) ...` bullet. The list should end with
the preact entry.

Then add a short note below the list so anyone landing on the repo (or arriving
from the npm page) understands what happened:

```markdown
> [!NOTE]
> `@tiny-intl/solid-js` was removed in the next release. Published versions up
> to 1.2.0 remain installable from npm but are no longer maintained.
```

Regenerate the lockfile:

```bash
npm install
```

**Verify**:

```bash
grep -c "solid" package-lock.json
```
→ `0`.

```bash
npm query ".workspace" | grep -c '"name"'
```
→ `3`. (If `npm query` is unavailable on the installed npm version, use
`ls packages/` → `core preact react`.)

### Step 6: Full verification

```bash
npm run lint -- packages
npm run test --workspace @tiny-intl/core -- --run
npm run build --workspace @tiny-intl/core
npm run build --workspace @tiny-intl/react
npm run build --workspace @tiny-intl/preact
```

**Verify**: lint exits 0; core's 18 tests pass; all three builds exit 0.

If a react or preact build fails inside `Translate.tsx` with a `TS2345`
union-destructuring error, that is the **pre-existing** failure owned by plan
003 — confirm the error text matches what plan 003 describes, note it, and
continue. It is not caused by this plan. Any *other* failure is a STOP
condition.

Also confirm you have not touched anything you shouldn't have:

```bash
git status --porcelain
```
→ lists only the files in the In-scope list (plus deletions under
`packages/solid-js/`).

### Step 7: Hand off the npm deprecation — DO NOT RUN THIS

**This step is for a human with npm publish rights. An executor agent must not
perform it.** Deleting the directory stops future publishes; it does nothing to
the versions already on the registry. Anyone running
`npm install @tiny-intl/solid-js` today still gets `1.2.0` and no indication it
is dead.

Include the following in your final report, verbatim, as the handoff:

> **Manual follow-up required before/with the next release.**
>
> Mark the published package deprecated so existing and new installers are
> warned:
>
> ```
> npm deprecate @tiny-intl/solid-js "No longer maintained. Solid support was removed from tiny-intl; use @tiny-intl/core directly."
> ```
>
> Notes for whoever runs it:
> - `npm deprecate` is **reversible** — passing an empty string as the message
>   clears the notice.
> - It does **not** unpublish. Existing installs keep working; new installs print
>   the warning. Do not use `npm unpublish` — it breaks anyone pinned to that
>   version.
> - Requires publish rights on the `@tiny-intl` scope.
> - The next release is a **breaking change** for Solid consumers even though
>   the remaining packages are unaffected; pick the version bump accordingly and
>   mention the removal in the release notes.
> - Published versions at time of removal: (paste the `npm view` output from
>   Step 1 here).

**Verify**: the handoff text above appears in your report. Do not run any npm
publish or deprecate command.

## Test plan

There are no new tests. This plan deletes code; the verification is that
everything else still builds, lints and passes:

- `npm run test --workspace @tiny-intl/core -- --run` → the existing 18 core
  tests pass unchanged. Core is untouched, so any failure means something went
  wrong outside the intended scope.
- `npm run build` for core, react and preact → all exit 0, proving no build
  depended on the Solid package or its toolchain.
- `npm run lint -- packages` → exits 0, proving the ESLint config is still valid
  after the override block was removed.
- `npx commitlint` on a `solid-js`-scoped message → rejected (Step 4).
- Every `grep` in the Done criteria returning empty is the machine-checkable
  proof that no reference survived.

Do **not** add tests, and do not port any of the Solid package's would-be tests
elsewhere.

## Done criteria

ALL must hold:

- [ ] `test -d packages/solid-js` → false
- [ ] `grep -rni solid . --exclude-dir={node_modules,.git,lib,dist,coverage,plans} --exclude=package-lock.json`
      → **exactly one line**: the `@tiny-intl/solid-js` mention inside the
      README removal note that Step 5 adds. No code, config or dependency
      reference may remain.
      *(Corrected 2026-08-12: this criterion originally said "no output", which
      contradicted Step 5's own instruction to add that note. The executor
      caught the contradiction and followed Step 5 — the right call.)*
- [ ] `grep -c solid package-lock.json` → `0`
- [ ] `ls packages/` → exactly `core`, `preact`, `react`
- [ ] `node -e "require('./.eslintrc.cjs')"` exits 0
- [ ] `echo "fix(solid-js): x" | npx commitlint` exits non-zero
- [ ] `npm run lint -- packages` exits 0
- [ ] `npm run test --workspace @tiny-intl/core -- --run` exits 0 (18 tests)
- [ ] `npm run build` exits 0 for core, react and preact
- [ ] `README.md` contains no `packages/solid` link and does contain the removal note
- [ ] `git status --porcelain` lists only in-scope paths
- [ ] The Step 7 npm-deprecation handoff text is in the final report, and no
      npm publish/deprecate command was executed
- [ ] `plans/README.md` status row for 002 updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1 finds any file under `packages/core`, `packages/react` or
  `packages/preact` importing from or depending on `@tiny-intl/solid-js`.
- `grep -rni solid` turns up a reference not listed in "Current state" — the
  repo has drifted since this plan was written, and the removal may be
  incomplete.
- Removing `@gridventures/eslint-config-solid-js` or `eslint-plugin-solid`
  breaks linting of the react, preact or core packages. That would mean another
  config depends on them transitively; report before re-adding anything.
- A react or preact build fails with an error **other than** the pre-existing
  `TS2345` in `Translate.tsx` described in plan 003.
- You find yourself needing to edit `packages/react`, `packages/preact` or
  `packages/core` to make anything pass.
- Anyone or anything suggests running `npm unpublish`. Do not.

## Maintenance notes

- **The finding this supersedes**: the `fn.call(args)` bug at
  `packages/solid-js/src/useIntl.tsx:22` is now closed by deletion rather than
  by a fix. It is recorded with its evidence in `plans/README.md` under
  "Findings closed by plan 002" in case the decision is ever revisited — the
  fix was a one-line change to `fn(...args)` plus tests.
- **Plans 001 and 003 assume this lands.** Both have been scoped to react and
  preact only. If this plan is rejected or reverted, `packages/solid-js` will be
  left with no test coverage and two unfixed bugs (the `useIntl` breakage above,
  and the falsy `count`/`number` props in its `Translate.tsx`), and those two
  plans need re-scoping to cover it again.
- **`Translate.tsx` is still duplicated** between react and preact — byte-identical
  below the imports. Removing the third copy reduces the drift surface but does
  not eliminate it; plan 003 keeps a `diff` check between the two.
- **What a reviewer should scrutinise**: that the diff contains no changes under
  `packages/core`, `packages/react` or `packages/preact`; that the `overrides`
  array in `.eslintrc.cjs` is still valid JavaScript with correct commas; and
  that the commitlint scope change was committed with an allowed scope.
- If Solid support is ever reinstated, note that the hardest part was never the
  adapter code — it was getting `vite-plugin-solid` to cooperate with vitest
  0.34 in a test environment. Budget for that before budgeting for the adapter.
