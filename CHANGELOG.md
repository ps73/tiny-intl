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
- make scripts/bundle-size.mjs actually reachable by lint:all ([763142a](https://github.com/ps73/tiny-intl/commit/763142aeb69288401dbf3aa7e6d50b35a47e1059))
- **preact:** emit type declarations for useIntl ([49bd556](https://github.com/ps73/tiny-intl/commit/49bd556424e2b21ec2a75099a6906275e541d23a))
- **preact:** order exports conditions with types first ([3a26fc1](https://github.com/ps73/tiny-intl/commit/3a26fc1b3b8a559d9d9be7fc232526aa4565faca))
- **preact:** point require at the CJS build ([98ffdf0](https://github.com/ps73/tiny-intl/commit/98ffdf0e36a2c509c842cafd13d8044227e5ba4f))
- **preact:** render Translate correctly for zero count and number ([0f2a901](https://github.com/ps73/tiny-intl/commit/0f2a90168d36682bed47bde25368307008cbc406))
- **preact:** split types conditions for import and require ([375d2ac](https://github.com/ps73/tiny-intl/commit/375d2ac812259528a822af7d2415dd491fefa5e1))
- **preact:** use explicit extensions in the entry re-exports ([0fd03c6](https://github.com/ps73/tiny-intl/commit/0fd03c6c465215d4da136c8c28a318f3ba234c9d))
- **react:** annotate useIntl return type ([365bbbb](https://github.com/ps73/tiny-intl/commit/365bbbb673843bdbca12639ea4e60044de985b0f))
- **react:** order exports conditions with types first ([5deaf59](https://github.com/ps73/tiny-intl/commit/5deaf5958b5d200d34f9206f6ca063c3ad5227fa))
- **react:** point require at the CJS build ([a616fb5](https://github.com/ps73/tiny-intl/commit/a616fb5497570174e8b4bb56b8915a7bdcf64f25))
- **react:** render Translate correctly for zero count and number ([970254c](https://github.com/ps73/tiny-intl/commit/970254c2d6c10e56ccc09d14e805ad71e4077cc1))
- **react:** split types conditions for import and require ([04343df](https://github.com/ps73/tiny-intl/commit/04343dffcf3358223da4f80a52d736e337e92ceb))
- **react:** use explicit extensions in the entry re-exports ([f7628ff](https://github.com/ps73/tiny-intl/commit/f7628ffbe633a877de5fb052c523cfa953a4f5cd))

### Features

- remove solid-js adapter package ([19fca0c](https://github.com/ps73/tiny-intl/commit/19fca0cfd9a78b95bb11c34f5af0d6b81b1ee288))

### Performance Improvements

- **preact:** shrink Translate guards ([308c270](https://github.com/ps73/tiny-intl/commit/308c2702ec0844ff7ce0e04d35239fe4c9a14177))
- **react:** shrink Translate guards ([c03760d](https://github.com/ps73/tiny-intl/commit/c03760dcf0d46df2cb13f4a8bfd2b41bc4da1106))

### BREAKING CHANGES

- @tiny-intl/solid-js is removed from this repository and
  will no longer be published. Consumers of @tiny-intl/solid-js should stop
  depending on it; published versions up to 1.2.0 remain installable from
  npm but are no longer maintained. No other package in this repo depended
  on it.
- Adapters no longer ship a UMD build. `main` and the `require` condition now
  point at `./lib/index.cjs` instead of `./lib/index.umd.cjs`. Loading
  @tiny-intl/react or @tiny-intl/preact from a CDN via a `<script>` tag is no
  longer supported; `import` and `require` are unaffected.
- The `exports` map of every package was restructured into nested
  `import`/`require` conditions with a separate `types` entry per condition.
  TypeScript consumers on `node16`/`nodenext`/`bundler` resolution now get the
  declarations intended for their module system.
- `tc(key, 0)` now uses the key's `zero` entry when the dictionary defines one,
  instead of always deferring to the locale's CLDR plural category. Only
  dictionaries that explicitly define a `zero` key are affected; they previously
  received the `other` string in locales such as English and German.
- `change(locale, staticDict)` now applies `staticDict` when the requested locale
  is already active. It previously returned early and silently discarded it.
- A `change()` call that has been superseded by a later one no longer notifies
  subscribers. Previously every call notified, including ones whose dictionary
  had just lost the race and was discarded.
- Empty-string values are now treated as present translations. `t()` returns `''`
  for a key defined as `''`, and an empty template parameter renders as empty,
  where both previously produced the `[key]` missing-value marker. Genuinely
  absent keys still produce `[key]`.
