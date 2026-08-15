# Plan 014: Match branch names containing a slash in CI, and publish the canonical repository URL

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed as in scope. If any STOP condition occurs, stop and
> report — do not improvise.
>
> **Drift check (run first)**:
> `git diff --stat 6a44efb..HEAD -- .github packages`

## Status

- **Priority**: P2 — metadata and CI-trigger cleanup, no runtime effect
- **Effort**: S
- **Risk**: LOW — four string changes; no source, no tests, no packaging shape
- **Depends on**: plans 001–013 (merged into `main` at `6a44efb`)
- **Category**: dx / docs
- **Planned at**: commit `6a44efb`, 2026-08-15

## Why this matters

Both findings come from review of PR #7 and both are verified.

### 1. CI never runs on push to any branch with a slash in its name

`.github/workflows/unit-tests.yml`:

```yaml
on:
  push:
    branches: ['*']
  pull_request:
    branches: ['*']
```

In GitHub's branch-filter glob syntax, `*` **does not match the `/` separator**;
`**` does. So `release/v2.0.0`, `feat/thing`, `fix/bug` — every conventionally
named branch — is excluded from the `push` trigger.

Confirmed against the actual run history for this branch:

```
runs by event: {"pull_request": 3}
```

Three runs, all from `pull_request`, **zero from `push`**. CI has only ever run
on this branch because a PR happens to be open. Push a slash-named branch with
no PR and nothing runs at all.

The `pull_request` filter has the same flaw, but it matters less: that filter
tests the *base* branch (`main`, no slash), not the head.

### 2. All three packages publish a stale repository URL

```
packages/core/package.json:    "url": "https://github.com/gridventures/tiny-intl",
packages/react/package.json:   "url": "https://github.com/gridventures/tiny-intl",
packages/preact/package.json:  "url": "https://github.com/gridventures/tiny-intl",
```

The canonical repository is `ps73/tiny-intl` — it is the git remote, and the
authenticated `gh` account. The old URL currently redirects, so this is stale
metadata rather than a dead link, but it is the "Repository" link on all three
npm package pages.

`publint` separately suggests this field should be a full git URL. Since the
line is being edited anyway, fix both at once and clear the suggestion.

## Current state

- `.github/workflows/unit-tests.yml` lines 3-7 — quoted above.
- The three `repository.url` values — quoted above. Each sits in a `repository`
  block that also carries `"type": "git"` and a `"directory"` field; leave those
  alone.

### Conventions

- Prettier: 2-space indent in JSON; keep existing key order.
- Commitlint scopes: `core`, `react`, `preact` — or no scope. Use no scope for
  the workflow change (`ci: …`).

## Scope

**In scope**:

- `.github/workflows/unit-tests.yml` — the two `branches` filters only
- `packages/core/package.json`, `packages/react/package.json`,
  `packages/preact/package.json` — the `repository.url` value only

**Out of scope**:

- The workflow's jobs, steps, matrix or action versions — all correct.
- Any other field in any `package.json`, including `engines` (publint's other
  suggestion) — that is a release decision about which Node versions to declare.
- Package versions, `lerna.json`, source, tests, `scripts/**`.

## Git workflow

- Conventional commits. Suggested: `ci: match branch names containing a slash`
  and `chore: publish the canonical repository URL`.
- Do NOT push or open a PR.

## Steps

### Step 1: Fix the branch filters

In `.github/workflows/unit-tests.yml`, change both filters from `['*']` to
`['**']`:

```yaml
on:
  push:
    branches: ['**']
  pull_request:
    branches: ['**']
```

**Verify**:

```bash
grep -c "branches: \['\*\*'\]" .github/workflows/unit-tests.yml
grep -c "branches: \['\*'\]" .github/workflows/unit-tests.yml
npx --yes yaml-lint .github/workflows/unit-tests.yml
```
→ first grep `2`, second grep `0`, YAML valid.

Then confirm nothing else in the file moved:

```bash
git diff -- .github/workflows/unit-tests.yml
```
→ exactly two changed lines.

### Step 2: Fix the repository URL in all three packages

In each of `packages/core/package.json`, `packages/react/package.json` and
`packages/preact/package.json`, change the `repository.url` value to the full
git URL form for the canonical repo:

```json
    "url": "git+https://github.com/ps73/tiny-intl.git",
```

Leave `"type": "git"` and `"directory"` untouched.

**Verify**:

```bash
grep -c "gridventures" packages/core/package.json packages/react/package.json packages/preact/package.json
grep -h '"url"' packages/*/package.json
node -e "for (const p of ['core','react','preact']) { const r = require('./packages/'+p+'/package.json').repository; if (!r.url.includes('ps73') || !r.directory) throw new Error(p); } console.log('all three canonical, directory preserved')"
```
→ every `grep -c` reports `0`; all three URLs read
`git+https://github.com/ps73/tiny-intl.git`; the node check prints its message.

### Step 3: Confirm the packaging tools are happy

```bash
npm run build
npm run publint; echo "publint=$?"
npm run attw; echo "attw=$?"
```

**Verify**: both exit 0. `publint`'s `repository.url` **suggestion should now be
gone** — it previously said the URL "could be a full git URL". Report whether it
disappeared; the `engines.node` suggestion is expected to remain and is out of
scope.

### Step 4: Full verification

```bash
npm run build
npm run test --workspace @tiny-intl/core -- --run
npm run test --workspace @tiny-intl/react -- --run
npm run test --workspace @tiny-intl/preact -- --run
npm run lint:all
npm run size
git status --porcelain
```

**Verify**: all exit 0; core 32, react 14, preact 14 = **58 tests**; sizes
unchanged at core 1478 / react 548 / preact 735 B (this plan touches no runtime
code, so any movement means something is wrong); `git status` lists only the four
in-scope files.

**Do not use root `npm test` from a worktree** — it is lerna-based and reports
the main checkout's results.

## Test plan

No tests. These are a CI trigger filter and package metadata; neither is
observable from the suite. The evidence is:

- The two greps in Step 1 and the four-file check in Step 2.
- `publint` still exiting 0, with its repository-URL suggestion resolved.
- Bundle sizes unchanged, proving no runtime code moved.

## Done criteria

ALL must hold:

- [ ] `grep -c "branches: \['\*'\]" .github/workflows/unit-tests.yml` → `0`
- [ ] `grep -c "branches: \['\*\*'\]" .github/workflows/unit-tests.yml` → `2`
- [ ] `grep -rc gridventures packages/*/package.json` → `0` for all three
- [ ] All three `repository.url` values are `git+https://github.com/ps73/tiny-intl.git`, with `directory` preserved
- [ ] `npm run publint` exits 0; the repository-URL suggestion is gone
- [ ] `npm run attw` exits 0
- [ ] 58 tests passing; sizes unchanged at 1478 / 548 / 735
- [ ] `git status --porcelain` lists only the four in-scope files

## STOP conditions

Stop and report back (do not improvise) if:

- Bundle sizes change at all — this plan touches no runtime code.
- `publint` or `attw` starts failing.
- Editing `repository.url` requires touching `directory` or any other field.
- You find yourself wanting to add `engines`, change versions, or edit the
  workflow's jobs.

## Maintenance notes

- **Why `**` and not `*`**: GitHub's filter globs treat `/` as a path separator.
  `*` matches within one segment; `**` crosses them. This is the same rule as
  `.gitignore` and most glob implementations, and it is easy to get wrong
  precisely because `*` looks like it should mean "anything".
- The `pull_request` filter matches the **base** branch, so `['*']` was
  functionally fine there today (`main` has no slash). Changing both keeps them
  consistent and survives a future base branch like `release/2.x`.
- **After this merges, pushes to any branch will run CI.** That is the intent,
  but it doubles runs on a branch that also has an open PR. If that becomes
  noisy, the usual fix is to restrict `push` to `main` and let `pull_request`
  cover everything else — a deliberate choice, not the current accident.
