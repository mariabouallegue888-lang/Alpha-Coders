import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '.npm-cache/**', '.local-data/**'] },
  js.configs.recommended,
  { files: ['server/**/*.js', 'server/scripts/**/*.js', 'scripts/**/*.mjs', 'client/test/**/*.mjs', 'eslint.config.js'], languageOptions: { globals: globals.node }, rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
  { files: ['server/scripts/*.cjs'], languageOptions: { globals: { ...globals.node, db: 'readonly', ObjectId: 'readonly', print: 'readonly', quit: 'readonly' } } },
  ...tseslint.configs.recommended.map(config => ({ ...config, files: ['client/**/*.ts', 'client/**/*.tsx'] })),
  { files: ['client/**/*.{ts,tsx}'], languageOptions: { globals: { ...globals.browser, ...globals.node } }, plugins: { 'react-hooks': hooks }, rules: { ...hooks.configs.recommended.rules } },
);
