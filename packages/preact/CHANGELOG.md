# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.0.0](https://github.com/ps73/tiny-intl/compare/v1.2.1...v2.0.0) (2026-08-15)

### Bug Fixes

- **preact:** emit type declarations for useIntl ([49bd556](https://github.com/ps73/tiny-intl/commit/49bd556424e2b21ec2a75099a6906275e541d23a))
- **preact:** order exports conditions with types first ([3a26fc1](https://github.com/ps73/tiny-intl/commit/3a26fc1b3b8a559d9d9be7fc232526aa4565faca))
- **preact:** point require at the CJS build ([98ffdf0](https://github.com/ps73/tiny-intl/commit/98ffdf0e36a2c509c842cafd13d8044227e5ba4f))
- **preact:** render Translate correctly for zero count and number ([0f2a901](https://github.com/ps73/tiny-intl/commit/0f2a90168d36682bed47bde25368307008cbc406))
- **preact:** split types conditions for import and require ([375d2ac](https://github.com/ps73/tiny-intl/commit/375d2ac812259528a822af7d2415dd491fefa5e1))
- **preact:** use explicit extensions in the entry re-exports ([0fd03c6](https://github.com/ps73/tiny-intl/commit/0fd03c6c465215d4da136c8c28a318f3ba234c9d))

### Performance Improvements

- **preact:** shrink Translate guards ([308c270](https://github.com/ps73/tiny-intl/commit/308c2702ec0844ff7ce0e04d35239fe4c9a14177))

### BREAKING CHANGES

- The UMD build is no longer produced or published. `main` and the `require`
  condition now point at `./lib/index.cjs`. Loading this package from a CDN via a
  `<script>` tag is no longer supported; `import` and `require` are unaffected.
- The `exports` map was restructured into nested `import`/`require` conditions
  with a separate `types` entry per condition, so TypeScript consumers resolve
  the declarations intended for their module system.
