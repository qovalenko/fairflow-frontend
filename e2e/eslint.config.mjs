import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
    { ignores: ['node_modules', 'test-results', 'playwright-report'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        rules: {
            '@typescript-eslint/no-empty-object-type': 'off',
            // Playwright fixtures destructure `{}` when they need no upstream fixtures.
            'no-empty-pattern': 'off',
        },
    },
    {
        // support/dns-shim.cjs is loaded by `node --require` before any ESM exists,
        // so it has to be CommonJS running in a plain Node scope.
        files: ['**/*.cjs'],
        languageOptions: {
            globals: { require: 'readonly', process: 'readonly', module: 'writable' },
        },
        rules: { '@typescript-eslint/no-require-imports': 'off' },
    },
)
