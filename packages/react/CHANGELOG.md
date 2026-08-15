# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.0.0](https://github.com/ps73/tiny-intl/compare/v1.2.1...v2.0.0) (2026-08-15)

### Bug Fixes

- **react:** annotate useIntl return type ([365bbbb](https://github.com/ps73/tiny-intl/commit/365bbbb673843bdbca12639ea4e60044de985b0f))
- **react:** order exports conditions with types first ([5deaf59](https://github.com/ps73/tiny-intl/commit/5deaf5958b5d200d34f9206f6ca063c3ad5227fa))
- **react:** point require at the CJS build ([a616fb5](https://github.com/ps73/tiny-intl/commit/a616fb5497570174e8b4bb56b8915a7bdcf64f25))
- **react:** render Translate correctly for zero count and number ([970254c](https://github.com/ps73/tiny-intl/commit/970254c2d6c10e56ccc09d14e805ad71e4077cc1))
- **react:** split types conditions for import and require ([04343df](https://github.com/ps73/tiny-intl/commit/04343dffcf3358223da4f80a52d736e337e92ceb))
- **react:** use explicit extensions in the entry re-exports ([f7628ff](https://github.com/ps73/tiny-intl/commit/f7628ffbe633a877de5fb052c523cfa953a4f5cd))

### Performance Improvements

- **react:** shrink Translate guards ([c03760d](https://github.com/ps73/tiny-intl/commit/c03760dcf0d46df2cb13f4a8bfd2b41bc4da1106))

### BREAKING CHANGES

- The UMD build is no longer produced or published. `main` and the `require`
  condition now point at `./lib/index.cjs`. Loading this package from a CDN via a
  `<script>` tag is no longer supported; `import` and `require` are unaffected.
- The `exports` map was restructured into nested `import`/`require` conditions
  with a separate `types` entry per condition, so TypeScript consumers resolve
  the declarations intended for their module system.
