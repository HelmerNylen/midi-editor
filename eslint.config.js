import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import css from '@eslint/css';
import {defineConfig} from 'eslint/config';
import eslintPluginPrettier from 'eslint-plugin-prettier';

export default defineConfig([
  {
    files: ['js/**/*.{js,mjs,cjs,ts,mts,cts}'],
    plugins: {js, eslintPluginPrettier}, 
    extends: ['js/recommended'],
    languageOptions: {globals: globals.browser},
    rules: {
      semi: ['warn', 'always'],
      'max-len': [
        'warn',
        {
          code: 80,
          tabWidth: 2,
          comments: 80,
          ignoreUrls: true,
          ignoreRegExpLiterals: true,
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          // Tillåt _ som namn på oanvända variabler.
          argsIgnorePattern: '^_$',
          varsIgnorePattern: '^_$',
        },
      ],
    },
  },
  tseslint.configs.recommended,
  {
    files: ['**/*.css'],
    plugins: {css},
    language: 'css/css',
    extends: ['css/recommended'],
  },
]);
