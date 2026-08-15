# Plan 012: CI's `test` job must build before it tests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed as in scope. If any STOP condition occurs, stop and
> report — do not improvise.
>
> **Drift check (run first)**:
> `git diff --stat 2cc4f9d..HEAD -- .github`

## Status

- **Priority**: P0 — CI is red on an open PR
- **Effort**: S (a four-line YAML addition)
- **Risk**: LOW — CI configuration only; no source, no tests, no packaging
- **Depends on**: plans 001–011 (merged into `main` at `2cc4f9d`)
- **Category**: dx / bug
- **Planned at**: commit `2cc4f9d`, 2026-08-15

## Why this matters

CI is failing on all three Node versions of the `Lint & test` job, on
[PR #7](https://github.com/ps73/tiny-intl/pull/7):

```
FAIL tests/useIntl.test.tsx [ tests/useIntl.test.tsx ]
Error: Failed to resolve entry for package "@tiny-intl/core".
The package may have incorrect main/module/exports specified in its package.json.

Failed tasks:
  - @tiny-intl/react:test
  - @tiny-intl/preact:test
```

**The error message is misleading — core's `package.json` is fine.** The
adapters' tests import `@tiny-intl/core`, which npm workspaces resolves to
`packages/core`, whose `main`, `module` and `exports` all point into `lib/`.
That directory is **build output**. The `test` job never builds it, so there is
nothing to resolve.

The `Package & size checks` job — added by plan 009 — passes on the same commit,
because it runs `npm run build` before its checks.

This was hidden throughout development: every local checkout and every executor
worktree had a warm `packages/core/lib` from earlier work, so the adapter tests
always found it. A clean CI runner is the first environment that ever ran them
without it.

Reproduced locally, on `main` at `2cc4f9d`:

```
$ rm -rf packages/core/lib
$ npm run test --workspace @tiny-intl/react -- --run
Error: Failed to resolve entry for package "@tiny-intl/core"...
 Test Files  2 failed (2)
      Tests  no tests

$ npm run build && npm run test --workspace @tiny-intl/react -- --run
 Test Files  2 passed (2)
      Tests  14 passed (14)
```

## Current state — `.github/workflows/unit-tests.yml`

The `test` job's steps, in order:

```yaml
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

There is no build. The `package` job further down the same file already does it
correctly:

```yaml
      - name: Install
        run: npm ci

      - name: Build
        run: npm run build
```

A root `build` script already exists and is an npm-workspaces chain in
dependency order (core first), so it is safe in any checkout:

```json
"build": "npm run build --workspace @tiny-intl/core && npm run build --workspace @tiny-intl/react && npm run build --workspace @tiny-intl/preact"
```

Building takes about five seconds.

## Scope

**In scope**:

- `.github/workflows/unit-tests.yml` — add one step to the `test` job

**Out of scope**:

- The `package` job — already correct, do not touch it.
- Any `package.json`, any source file, any test file, `scripts/**`.
- Changing the matrix, the action versions, or the `lint`/`test` commands.
- Making the adapters' vitest alias `@tiny-intl/core` to source instead of the
  built package. That would also make CI pass, but it would stop the adapter
  tests from exercising the real resolution path — which is exactly the class of
  defect plans 005, 006 and 008 fixed. Building is the faithful fix.

## Git workflow

- Conventional commit, no scope. Suggested: `ci: build before running tests`.
- Do NOT push or open a PR — the reviewer handles that.

## Steps

### Step 1: Reproduce the failure

```bash
npm ci
rm -rf packages/core/lib packages/react/lib packages/preact/lib
npm run test --workspace @tiny-intl/react -- --run; echo "exit=$?"
```

**Expected**: fails with `Failed to resolve entry for package "@tiny-intl/core"`
and a non-zero exit. Record it.

If it **passes**, STOP and report — the diagnosis is wrong and the real cause is
something else.

### Step 2: Add the build step

In `.github/workflows/unit-tests.yml`, in the **`test` job only**, insert a
Build step between `Install` and `Lint`:

```yaml
      - name: Install
        run: npm ci

      - name: Build
        run: npm run build

      - name: Lint
        run: npm run lint:all

      - name: Test
        run: npm test
```

Placing it before `Lint` rather than between `Lint` and `Test` is deliberate:
the type-aware ESLint rules resolve `@tiny-intl/core` too, and today they only
survive because a stale `lib/` happens to exist. Building first makes both steps
robust.

Leave the `package` job completely untouched.

### Step 3: Verify by simulating the job from a clean state

```bash
rm -rf packages/core/lib packages/react/lib packages/preact/lib
npm ci
npm run build; echo "build=$?"
npm run lint:all; echo "lint=$?"
npm test; echo "test=$?"
```

**Expected**: all three exit 0, and `npm test` reports 30 / 14 / 14 = **58
tests** across the three packages.

Note this is the one place where root `npm test` is the right command — you are
deliberately reproducing what CI runs, and you are at the repo root, not in a
worktree. (Elsewhere in this repo, prefer
`npm run test --workspace <pkg> -- --run`; lerna resolves the workspace root to
the main checkout, which gives wrong results from a git worktree.)

Then confirm the YAML is still valid and the other job is intact:

```bash
npx --yes yaml-lint .github/workflows/unit-tests.yml
grep -c "runs-on" .github/workflows/unit-tests.yml
grep -c "name: Build" .github/workflows/unit-tests.yml
```
→ valid YAML; `runs-on` appears **2** times (both jobs still present);
`name: Build` appears **2** times (one per job).

Finally, confirm the `package` job did not change:

```bash
git diff -- .github/workflows/unit-tests.yml
```
→ the diff must be a **pure addition of four lines** inside the `test` job.

## Test plan

No unit tests — this is CI configuration. The evidence is:

- Step 1: the failure reproduces locally when `lib/` is absent.
- Step 3: the exact CI sequence, run from a clean state, now succeeds.
- The `git diff` is four added lines and nothing else.

## Done criteria

ALL must hold:

- [ ] Step 1 reproduced the resolve failure (output in the report)
- [ ] `.github/workflows/unit-tests.yml` `test` job has a `Build` step between `Install` and `Lint`
- [ ] `grep -c "name: Build"` → `2`; `grep -c "runs-on"` → `2`
- [ ] From a clean `lib/`: `npm ci`, `npm run build`, `npm run lint:all`, `npm test` all exit 0
- [ ] `npm test` reports 58 tests total
- [ ] `git diff` on the workflow is a pure four-line addition inside the `test` job
- [ ] `git status --porcelain` lists only `.github/workflows/unit-tests.yml`

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1 does **not** reproduce the failure.
- Adding the build step does not make the clean-state sequence pass.
- You find yourself wanting to edit a `package.json`, a vitest config, a test, or
  the `package` job.
- `npm run build` fails from a clean state for any reason.

## Maintenance notes

- **Why this was missed**: plan 001 wrote this job, and its own maintenance note
  observed that CI never builds — but framed it as "a broken adapter build won't
  be caught", not as "the tests cannot run without it". The dependency was
  invisible locally because `lib/` is git-ignored but persistent.
- **Bonus effect**: the `test` job now also fails on a broken build, which was
  the follow-up plan 001 deferred. Deferred finding 12 (CI not failing on
  `TS2742`) narrows further as a result.
- **What a reviewer should scrutinise**: that the `package` job is byte-for-byte
  unchanged, and that Build precedes Lint rather than sitting between Lint and
  Test.
