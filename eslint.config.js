const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const boundaries = require('./eslint/boundaries');

module.exports = tseslint.config(
  { ignores: ['node_modules/**', 'ios/**', 'android/**', '.expo/**', '.bundle-check/**', 'coverage/**', 'firmware/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { require: 'readonly', module: 'writable', __dirname: 'readonly', process: 'readonly', console: 'readonly', Buffer: 'readonly', URL: 'readonly' } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { hm: { rules: { boundaries } } },
    rules: {
      'hm/boundaries': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Test doubles live only under __tests__, never in src.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['**/__tests__/**'], message: 'src must not import test code.' }] }],
    },
  },
);
