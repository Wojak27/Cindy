const path = require('path');

module.exports = {
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    target: 'electron-main',
    entry: './src/main/main.ts',
    output: {
        path: path.join(__dirname, '../dist/main'),
        filename: 'main.js',
    },
    // Enable source maps for debugging
    devtool: process.env.NODE_ENV === 'production' ? false : 'inline-source-map',
    resolve: {
        extensions: ['.ts', '.js'],
        alias: {
            '@main': path.resolve(__dirname, '../src/main'),
            '@renderer': path.resolve(__dirname, '../src/renderer'),
            '@shared': path.resolve(__dirname, '../src/shared'),
        }
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: {
                    loader: 'ts-loader',
                    options: {
                        transpileOnly: false,
                        compilerOptions: {
                            sourceMap: true,
                            inlineSourceMap: false,
                            inlineSources: true
                        }
                    }
                },
                exclude: /node_modules/,
            },
        ],
    },
    node: {
        __dirname: false,
        __filename: false,
    },
};