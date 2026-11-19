import globals from 'globals';
import parser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['**/*.d.ts'],
    files: ['src/**/*.{mjs,ts}', 'scripts/*.mjs'],
    languageOptions: {
      parser,
      globals: { ...globals.browser, ...globals.node },
    },
    rules: { 'no-unused-vars': 'error', 'no-unreachable': 'error' },
  },
];
