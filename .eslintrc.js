module.exports = {
  env: {
    node: true,
    es2021: true,
  },
  extends: ['standard'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'import'],
  rules: {
    'import/extensions': ['error', 'never', {json: 'always'}],
    'import/prefer-default-export': 'off',
    'no-underscore-dangle': ['error', {allowAfterThis: true}],
    'no-restricted-syntax': 'off',
    'no-console': ['error', {allow: ['log', 'error']}],
    'comma-dangle': ['error', 'always-multiline'],
    semi: ['error', 'always'],
  },
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.ts', '.json'],
      },
    },
  },
  overrides: [
    {
      files: ['**/*.spec.ts'],
      env: {mocha: true},
      plugins: ['mocha'],
    },
  ],
};
