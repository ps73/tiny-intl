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
  },

  overrides: [
    {
      files: ['packages/react/**/*.ts', 'packages/react/**/*.tsx'],

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
      files: ['packages/solid-js/**/*.ts', 'packages/solid-js/**/*.tsx'],

      extends: [
        '@gridventures/eslint-config-solid-js/typescript',
        '@gridventures/eslint-config-base/prettier',
      ],
    },
  ],
};
