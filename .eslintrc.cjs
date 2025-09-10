// .eslintrc.cjs
module.exports = {
    root: true,
    env: { es2023: true, node: true },
    parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    extends: [
        'standard',                    // StandardJS base (import, n, promise)
        'plugin:@typescript-eslint/recommended'
    ],
    plugins: ['import', '@typescript-eslint'],
    settings: {
        'import/resolver': {
            node: {
                extensions: ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.jsx', '.tsx', '.json']
            },
            // enables TS-aware resolution so the rule applies cleanly to .ts/.tsx
            typescript: { alwaysTryTypes: true }
        }
    },
    rules: {
        // Require explicit extensions on relative imports; ignore packages like 'react'
        'import/extensions': ['error', 'ignorePackages', {
            js: 'always',
            mjs: 'always',
            cjs: 'always',
            jsx: 'always',
            ts: 'always',
            tsx: 'always',
            mts: 'always',
            cts: 'always',
            json: 'always'
        }]
    },
    overrides: [
        {
            files: ['*.ts', '*.tsx', '*.mts', '*.cts'],
            parser: '@typescript-eslint/parser'
        }
    ]
}
