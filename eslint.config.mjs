import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals'
import tseslint from 'typescript-eslint';

export default defineConfig([
  ...nextVitals,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        projectService: true,
      },
    },
  },
  {
    settings: {
      react: { version: "19" } // Avoids auto-detection crash
    },
    rules: {
      'import/no-dynamic-require': 'warn',
      'import/no-unused-modules': 'warn',
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          args: "all",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true
        }
      ],
      "@typescript-eslint/no-confusing-void-expression": [
        "error",
        {
          ignoreArrowShorthand: true
        }
      ],
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: {
            attributes: false
          }
        }
      ]
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    "**/*.js", "**/*.cjs", "**/*.mjs",
    '*.config.ts'
  ]),
]);
