module.exports = {
  root: true,

  env: {
    browser: true,
    es6: true,
    node: true,
  },

  parser: '@typescript-eslint/parser',

  parserOptions: {
    project: 'tsconfig.eslint.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
    ecmaVersion: 2022,
    ecmaFeatures: {
      jsx: true,
    },
  },

  extends: [
    '@gridventures/eslint-config-base',
    '@gridventures/eslint-config-typescript',
    '@gridventures/eslint-config-base/prettier',
  ],

  rules: {
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/unbound-method': 'off',
    'import/extensions': [
      'error',
      {
        js: 'never',
        jsx: 'never',
        mjs: 'never',
        ts: 'never',
        tsx: 'never',
        json: 'always',
      },
    ],
    'no-console': ['error', { allow: ['warn', 'error'] }],
    'import/no-unresolved': 'off',
  },

  overrides: [
    {
      files: [
        'packages/react/**/*.ts',
        'packages/react/**/*.tsx',
        'packages/preact/**/*.ts',
        'packages/preact/**/*.tsx',
      ],

      extends: [
        '@gridventures/eslint-config-react',
        '@gridventures/eslint-config-react/typescript',
        '@gridventures/eslint-config-react/hooks',
        '@gridventures/eslint-config-react/a11y',
        '@gridventures/eslint-config-base/prettier',
      ],

      rules: {
        'react/prop-types': 'off',
      },
    },

    {
      files: ['**/*.config.*'],

      rules: {
        'import/no-extraneous-dependencies': 'off',
      },
    },

    {
      // Standalone build/check scripts: they print their results (that's
      // the point), their tooling deps are correctly devDependencies, and
      // sequential awaits in a loop are intentional (measuring bundles one
      // at a time keeps esbuild's output from interleaving).
      files: ['scripts/**/*.mjs'],

      rules: {
        'no-console': 'off',
        'import/no-extraneous-dependencies': 'off',
        'no-await-in-loop': 'off',
      },
    },

    {
      // Testing Library's `screen` export shadows the browser global of the
      // same name; test files legitimately import it, so relax the rule
      // only here rather than for the whole codebase.
      files: ['packages/*/tests/**'],

      rules: {
        'no-shadow': 'off',
      },
    },
  ],
};
