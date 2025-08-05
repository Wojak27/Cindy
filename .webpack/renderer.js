const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    target: 'electron-renderer',
    entry: './src/renderer/index.tsx',
    output: {
        path: path.join(__dirname, '../dist/renderer'),
        filename: 'renderer.js',
    },
    externals: {
        keytar: 'commonjs keytar',
        'keytar/build/Release/keytar.node': 'commonjs keytar/build/Release/keytar.node'
    },
    node: {
        __dirname: false,
        __filename: false
    },
    module: {
        rules: [
            {
                test: /\.node$/,
                use: 'node-loader',
            },
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
            {
                test: /\.html$/,
                use: 'html-loader',
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader'],
            }
        ],
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js', '.jsx'],
    },
    devServer: {
        static: {
            directory: path.join(__dirname, '../dist/renderer'),
        },
        host: 'localhost',
        compress: true,
        port: 3004,
        allowedHosts: 'all',
        client: {
            webSocketURL: 'ws://localhost:3004/ws'
        },
        historyApiFallback: true,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
            "Access-Control-Allow-Headers": "X-Requested-With, content-type, Authorization"
        },
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './src/renderer/index.html',
            filename: 'index.html'
        })
    ],
};
