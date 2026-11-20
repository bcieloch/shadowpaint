import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist', 'dev-dist', 'coverage', 'playwright-report', 'test-results', '.memory', 'skills']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strict,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['src/ui/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['src/core/**/*.{ts,tsx}', 'src/imaging/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react-dom',
                'three',
                'three/*',
                'zustand',
                'zustand/*',
                'dexie',
                '@/ui/*',
                '@/state/*',
                '@/engine3d/*',
                '@/editor2d/*',
                '@/persistence/*',
              ],
              message: 'core/ and imaging/ must remain pure and framework-agnostic.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/engine3d/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', '@/ui/*'],
              message: 'engine3d/ must not import React or UI modules.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/editor2d/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'three', 'three/*', '@/ui/*', '@/engine3d/*'],
              message: 'editor2d/ must not import React, Three.js, or UI modules.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/i18n/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'three', 'three/*', '@/ui/*', '@/engine3d/*', '@/editor2d/*'],
              message: 'i18n/ must remain decoupled from UI and rendering layers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/workers/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.worker,
      },
    },
  },
  {
    files: ['tests/**/*.ts', 'playwright.config.ts', 'vite.config.ts', 'vitest.config.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
]);
