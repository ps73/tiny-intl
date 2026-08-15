# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.0.0](https://github.com/ps73/tiny-intl/compare/v1.2.1...v2.0.0) (2026-08-15)

### Bug Fixes

- **core:** allow mount() to be retried after a failed load ([ec3baf4](https://github.com/ps73/tiny-intl/commit/ec3baf452f060054fe1338d21870c97fc1905345))
- **core:** exclude vite-env.d.ts from the tsup entry glob ([48c2441](https://github.com/ps73/tiny-intl/commit/48c2441994c1d22b541e00926731f99af84589c9))
- **core:** guard change() against lost updates and make mount() re-entrant ([6829df1](https://github.com/ps73/tiny-intl/commit/6829df15a9a2f2386c4e91eb4134ca45ab4695a9))
- **core:** point exports types at the emitted declaration files ([ad1e1ab](https://github.com/ps73/tiny-intl/commit/ad1e1abe6eebd634e0ea8b33c38eb413fab4c293))
- **core:** read Intl formatter caches with the key they are written with ([a0a5747](https://github.com/ps73/tiny-intl/commit/a0a5747c64f241aafbd1cb664fc11fcc7ddf9a82))
- **core:** treat empty strings as present values ([e910640](https://github.com/ps73/tiny-intl/commit/e910640fbfc24d386b46748bc2777609e4e71388))
- **core:** use the zero plural entry when count is 0 ([05ddff1](https://github.com/ps73/tiny-intl/commit/05ddff12f9854bd92bd662fdd6d2b07527870b13))

### BREAKING CHANGES

- `tc(key, 0)` now uses the key's `zero` entry when the dictionary defines one,
  instead of always deferring to the locale's CLDR plural category. Only
  dictionaries that explicitly define a `zero` key are affected.
- `change(locale, staticDict)` now applies `staticDict` when the requested locale
  is already active; it previously returned early and discarded it.
- A superseded `change()` no longer notifies subscribers.
- Empty-string values are treated as present translations: `t()` returns `''` for
  a key defined as `''` rather than the `[key]` marker. Absent keys are unchanged.
