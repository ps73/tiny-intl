# Plan 003: Fix `<Translate>` — `count={0}` and `number={0}` render the wrong thing (or nothing) in the react and preact adapters

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 794eb48..HEAD -- packages/react/src/Translate.tsx packages/preact/src/Translate.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW — the branch conditions change, so every `<Translate>` prop
  combination needs a test, but the typecheck baseline is verified green and the
  change is three guards.
- **Depends on**: `plans/001-adapter-test-and-ci-baseline.md`
- **Category**: bug
- **Planned at**: commit `794eb48`, 2026-08-12

## Why this matters

The `<Translate>` component dispatches on which prop was passed, using
truthiness checks: `if (count)`, `if (date && ...)`, `if (number)`. Zero is
falsy, so the two most common zero-valued cases fall through to the wrong
branch:

- `<Translate name="document" count={0} />` skips the plural branch and lands on
  `if (name)`, calling `t('document')`. Core's `t` falls back to the `.one` key
  (`packages/core/src/createTinyIntl.ts:116`), so the user sees the **singular**
  form — "Document" — where their dictionary explicitly defines a `zero` entry
  saying "Documents". Empty-state counts are exactly where correct plural
  handling matters most, and this is a library whose headline feature is native
  `Intl.PluralRules` support.
- `<Translate number={0} />` matches no branch at all and returns `null`. The
  component **renders nothing** for the number zero. Any "0 items", "€0.00" or
  "0%" in a consuming app silently disappears.
- `<Translate date={0} />` (Unix epoch) has the same shape of problem, though
  it is a far rarer input.

Both published adapters carry the identical bug — `Translate.tsx` is byte-identical
between react and preact below the import block.

### A note on `packages/solid-js`

The Solid adapter had the same bug. It is not fixed here: that package is being
deleted by `plans/002-remove-solid-js-support.md`. This plan covers **react and
preact only** and never touches `packages/solid-js`, whether or not 002 has run
yet — there is no ordering constraint between the two plans. If plan 002 is
later rejected, this plan must be re-scoped to include the Solid copy (which
needs the same three condition changes, expressed as `props.count` /
`props.number` / `props.date` inside its `createMemo`).

## Current state

### Files and their roles

- `packages/react/src/Translate.tsx` — React adapter; bug at lines 66 and 78.
- `packages/preact/src/Translate.tsx` — byte-identical to the React file below
  the imports; same lines.

### Excerpt — `packages/react/src/Translate.tsx:53-101` (the bug, and its surroundings)

```tsx
export function Translate(props: TranslateProps) {
  const intl = useContext(TinyIntlContext);

  if (!intl) {
    throw new Error('useIntl must be used within a TinyIntlContext.Provider');
  }

  const { subscribe, t, tc, dt, n, rt } = intl;
  const { name, count, date, number, options, children, relative } = props; // eslint-disable-line no-shadow

  const [changed, setChanged] = useState(0);

  const translateFn = useCallback(() => {
    if (count) {                              // <-- BUG: 0 is falsy
      return tc(name, count, options);
    }

    if (date && !relative) {                  // <-- BUG: epoch 0 is falsy
      return dt(date, options);
    }

    if (date && relative) {
      return rt(date, options);
    }

    if (number) {                             // <-- BUG: 0 is falsy
      return n(number, options);
    }

    if (name) {
      return t(name, options);
    }

    return null;
  }, [changed, count, date, name, number, options]);
```

`packages/preact/src/Translate.tsx:53-101` is the same code with
`from 'preact/compat'` on line 4.

### Excerpt — `packages/react/src/Translate.tsx:8-51` (the props union — read this before Step 2)

```tsx
export type TranslateProps = {
  children?: (value: string | null) => React.ReactNode;
} & (
  | {
      // Case: string translation
      name: string;
      count?: number;
      date?: undefined;
      number?: undefined;
      options?: TinyIntlTranslateTemplate;
      relative?: undefined;
      unit?: undefined;
    }
  | {
      // Case: dateFormat
      name?: undefined;
      count?: undefined;
      data?: undefined;
      date?: Date | string | number;
      number?: undefined;
      options?: Intl.DateTimeFormatOptions;
      relative?: undefined;
    }
  | {
      // Case: relativeTimeFormat
      name?: undefined;
      count?: undefined;
      data?: undefined;
      date?: Date | string | number;
      number?: undefined;
      options?: Intl.RelativeTimeFormatOptions;
      relative?: true;
    }
  | {
      // Case: numberFormat
      name?: undefined;
      count?: undefined;
      data?: undefined;
      date?: undefined;
      number?: number;
      options?: Intl.NumberFormatOptions;
      relative?: undefined;
    }
);
```

**TypeScript narrows this union correctly today — verified, 2026-08-12.** An
earlier draft of this plan claimed `tc(name, count, options)` was a latent
`TS2345` error. That was wrong, and it was measured: `npx tsc --noEmit` exits
**0** in both `packages/react` and `packages/preact` (with `src/Translate.tsx`
confirmed present in the compilation via `--listFiles`).

The reason matters for Step 2. Each union member gives `count`, `date` and
`number` a *unit* type — `count?: number` in the first member and
`count?: undefined` in the other three — which is exactly the shape TypeScript's
control-flow analysis for destructured discriminated unions (TS 4.6+) can
discriminate on. So inside `if (count) { … }`, narrowing `count` to a truthy
`number` eliminates the three members where it is `undefined`, which in turn
narrows `name` to `string` and `options` to `TinyIntlTranslateTemplate | undefined`.
The call typechecks.

**Consequence for the fix**: replacing `if (count)` with
`typeof count === 'number'` should narrow *just as well* — it also excludes the
`undefined` members. So the casts an earlier draft prescribed are most likely
unnecessary, and adding them would weaken type safety for no reason. Step 2
therefore tells you to write the fix **without** casts and let the compiler
decide.

Note the typo carried through three of the four union members in both packages:
`data?: undefined` where `date?: undefined` was clearly meant. Fixing that would
change which prop combinations typecheck for consumers — **out of scope here**,
recorded in `plans/README.md` as a deferred finding.

### Conventions

- Prettier: `singleQuote: true`, `printWidth: 100`, `trailingComma: "all"`;
  2-space indent.
- React/Preact files are linted with `@gridventures/eslint-config-react` +
  `/hooks` (see the `overrides` block in `.eslintrc.cjs`).
- The existing `/* eslint-disable react-hooks/exhaustive-deps */` at the top of
  both files stays — do not remove it.

## Commands you will need

> Read from `package.json` during planning; `node_modules` was not installed at
> planning time, so these were not executed.

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm install` | exit 0 |
| Typecheck + build (per package) | `npm run build --workspace @tiny-intl/react` | exit 0 |
| Tests (per package) | `npm run test --workspace @tiny-intl/react -- --run` | all pass |
| Full suite | `npm test` | all pass |
| Lint | `npm run lint:all` | exit 0 |

## Scope

**In scope** (the only files you should modify):

- `packages/react/src/Translate.tsx`
- `packages/preact/src/Translate.tsx`
- `packages/react/tests/Translate.test.tsx`
- `packages/preact/tests/Translate.test.tsx`
- `plans/README.md` — status row only

**Out of scope** (do NOT touch, even though they look related):

- **`packages/solid-js/**`** — being deleted by plan 002. If the directory still
  exists when you run, leave it alone.
- **The `TranslateProps` union itself.** Do not add a discriminant, do not fix
  the `data?: undefined` typo, do not split it into separate components. Any of
  those changes what compiles for existing consumers — a breaking change that
  needs its own release decision. This plan changes runtime behaviour only, plus
  the minimum type assertions needed to keep `tsc` quiet.
- `packages/*/src/useIntl.tsx` — the react/preact ones have a separate deferred
  finding (stale `useCallback` identity).
- `packages/core/**` — core's `t()` fallback to `.one` is intended behaviour for
  a missing key.
- The falsy-`options` question. `options={0}` is not representable in the type;
  ignore it.

## Git workflow

- Branch: `advisor/003-fix-translate-falsy-props`
- Conventional commits, enforced by commitlint, with scopes limited to
  `core`, `react`, `preact` (and `solid-js` until plan 002 removes it). One
  commit per package reads well here:
  `fix(react): render Translate correctly for zero count and number`, then
  `fix(preact): ...`. Prior art in `git log`:
  `fix(core): return fallback if navigator is undefined`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Reproduce the bug, and confirm the typecheck baseline is green

```bash
npm install
npm run build --workspace @tiny-intl/react
cd packages/react && npx tsc --noEmit; echo "tsc exit=$?"; cd ../..
```

**Expected**: build exits 0 and `tsc exit=0`. This was verified on 2026-08-12 —
there is **no** pre-existing type error in `Translate.tsx`. If you see type
errors here, STOP: the repo has drifted and the analysis in "Current state" no
longer holds.

(Capture `tsc`'s exit code without a pipe — `npx tsc --noEmit | head` reports
`head`'s status, not the compiler's.)

Then add failing tests **before** touching the source. In
`packages/react/tests/Translate.test.tsx` (created by plan 001), add:

```tsx
it('renders the zero plural form for count={0}', async ({ expect }) => {
  // de-DE dictionary defines document.zero = 'Dokumente', document.one = 'Dokument'
  // expected: 'Dokumente'
});

it('renders a formatted zero for number={0}', async ({ expect }) => {
  // expected: '0', not '' and not null
});
```

**Verify**: `npm run test --workspace @tiny-intl/react -- --run` → these two
tests **fail**, and the failure messages show `'Dokument'` (singular) and an
empty render respectively. If they pass, STOP — the bug does not reproduce and
this plan's premise is wrong.

### Step 2: Fix `packages/react/src/Translate.tsx`

Replace the body of `translateFn` (lines 65-87) with explicit presence checks.
**Write it exactly as below — with no type assertions.** See "Current state":
TypeScript discriminates this union on the unit types of `count`/`date`/`number`,
and `typeof` guards preserve that narrowing.

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

Three things changed and each is load-bearing:

1. `if (count)` → `typeof count === 'number'`, so `0` takes the plural branch.
2. `if (number)` → `typeof number === 'number'`, so `0` is formatted.
3. `date &&` → `date !== undefined`, so the epoch `0` formats as a date.

Plus `relative` is added to the `useCallback` dependency array, where it was
missing. Everything else — including the final `if (name)` — is unchanged.

**If and only if `tsc` then reports an error**, add the narrowest fix that
silences it, in this order of preference: (a) an extra `typeof` guard that helps
the compiler discriminate, e.g. `typeof count === 'number' && typeof name === 'string'`;
(b) failing that, an `as` assertion on the specific argument that errors, with a
comment naming the TS error code. Do **not** pre-emptively add assertions.
**Report every assertion you had to add, with the exact compiler error that
forced it** — that outcome contradicts the verified baseline and your reviewer
needs to know.

`TinyIntlTranslateTemplate` is already imported at the top of the file
(line 2) — no new import is needed unless you add an assertion that uses it.

**Verify**:

```bash
npm run build --workspace @tiny-intl/react
cd packages/react && npx tsc --noEmit; echo "tsc exit=$?"; cd ../..
npm run test --workspace @tiny-intl/react -- --run
```
→ build exits 0, `tsc exit=0`, and the two tests from Step 1 now pass.

### Step 3: Apply the identical fix to `packages/preact/src/Translate.tsx`

The Preact file is character-identical to the React one from line 8 onward.
Apply exactly the same replacement, then confirm the two files have not drifted
apart in any way other than their imports:

```bash
diff <(tail -n +8 packages/react/src/Translate.tsx) <(tail -n +8 packages/preact/src/Translate.tsx)
```
→ no output (both files are identical after their import blocks).

Add the same two tests to `packages/preact/tests/Translate.test.tsx`.

**Verify**: `npm run build --workspace @tiny-intl/preact` exits 0;
`npm run test --workspace @tiny-intl/preact -- --run` → all pass.

### Step 4: Prove no truthiness checks on numeric props remain

```bash
grep -rn "if (count)\|if (number)\|date &&" packages/react/src/Translate.tsx packages/preact/src/Translate.tsx
```
→ no output.

```bash
npm test
npm run lint:all
```

**Verify**: full suite passes; lint exits 0.

## Test plan

Add to each of `packages/react/tests/Translate.test.tsx` and
`packages/preact/tests/Translate.test.tsx` — modelled structurally on
`packages/core/tests/index.test.ts` (per-test `{ expect }` fixture, shared
fixture dictionary, `describe` named after the package):

| Case | Props | Expected |
|---|---|---|
| zero plural (regression) | `name="document" count={0}`, locale de-DE | `Dokumente` (the `zero` entry), **not** `Dokument` |
| one plural | `name="document" count={1}`, de-DE | `Dokument` |
| many plural | `name="document" count={5}`, de-DE | `Dokumente` |
| zero number (regression) | `number={0}`, en-US | `0` — non-empty render |
| non-zero number | `number={1000}`, en-US | `1,000` |
| epoch date (regression) | `date={0}` | a formatted date string, non-empty |
| plain name | `name="inbox"`, de-DE | `Posteingang` |
| template params | `name="hello" options={{ name: 'John' }}` | `Hello, John!` |
| function children | `name="inbox"` with `children={(v) => ...}` | the callback receives the translated value |
| no matching prop | `{}` (cast as needed) | renders nothing |

The first, fourth and sixth rows are the regression tests for this plan — they
must be observed failing in Step 1 before the fix.

Verification: `npm test` → all pass, with ≥ 3 new tests per adapter package.

## Done criteria

ALL must hold:

- [ ] `grep -rn "if (count)\|if (number)" packages/react/src/Translate.tsx packages/preact/src/Translate.tsx` → no output
- [ ] `grep -rn "date &&" packages/react/src/Translate.tsx packages/preact/src/Translate.tsx` → no output
- [ ] `npm run build --workspace @tiny-intl/react` exits 0
- [ ] `npm run build --workspace @tiny-intl/preact` exits 0
- [ ] `npm test` exits 0; each adapter has a passing `count={0}` and `number={0}` test
- [ ] `npm run lint:all` exits 0
- [ ] `diff <(tail -n +8 packages/react/src/Translate.tsx) <(tail -n +8 packages/preact/src/Translate.tsx)` → no output
- [ ] `git status --porcelain packages/solid-js` returns no output (that package was not touched)
- [ ] `git status --porcelain` lists only files from the In-scope list
- [ ] `plans/README.md` status row for 003 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The Step 1 regression tests **pass** before the fix — the bug does not
  reproduce as described and the diagnosis is wrong.
- `packages/react/src/Translate.tsx:66` does not read `if (count) {` — the code
  has drifted since this plan was written.
- **`tsc --noEmit` reports errors in `Translate.tsx` in Step 1, before you have
  changed anything.** The verified baseline is clean; errors there mean the repo
  drifted and this plan's type analysis is stale.
- Making `tsc` pass after Step 2 requires changing `TranslateProps` itself, or
  more than one `as` assertion per file. Report what you found; changing the
  exported prop types is a breaking change and needs a human decision.
- Fixing the epoch-date case (`date !== undefined`) breaks an existing test —
  it may reveal that some consumer path relies on `date={null}` or
  `date={''}` falling through. Report before adapting.

## Maintenance notes

- **An explicit discriminant would still be an improvement.** TypeScript
  narrows the current union only because every member happens to give
  `count`/`date`/`number` a unit type; that is a property the union could lose
  accidentally in any future edit, silently taking type safety with it. An
  explicit `kind` prop, or splitting `<Translate>` into `<T>`, `<TDate>`,
  `<TNumber>`, would make the discrimination intentional and let TypeScript
  reject invalid prop *combinations* at the call site (which it does not do
  today). Breaking API change — next major.
- **Deferred, recorded in `plans/README.md`**: the `data?: undefined` typo in
  three of the four union members (both packages) — clearly meant to be `date`,
  and fixing it changes which prop combinations typecheck.
- `Translate.tsx` is duplicated between react and preact, byte-identical below
  the imports (it used to be triplicated; plan 002 removes the third copy).
  Every future change to one must be mirrored; the `diff` check in Step 3's
  verification is worth promoting to a CI guard if this pattern persists.
- **What a reviewer should scrutinise**: that the branch *order* is unchanged
  (count → date → relative date → number → name), since it defines precedence
  when a consumer passes prop combinations the types don't forbid.
