const rules = require('./webpack.rules');
const plugins = require('./webpack.plugins');

rules.push({
  test: /\.css$/,
  use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
});

module.exports = {
  entry: ['./src/renderer/polyfills.ts', './src/renderer/index.tsx'],
  mode: 'development',
  target: 'electron-renderer',
  module: {
    rules,
  },
  plugins: plugins,
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.mjs'],
    alias: {
      '@main': require('path').resolve(__dirname, '..', 'src', 'main'),
      '@renderer': require('path').resolve(__dirname, '..', 'src', 'renderer'),
      '@shared': require('path').resolve(__dirname, '..', 'src', 'shared'),
    },
    // Resolve ES modules properly
    extensionAlias: {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs']
    },
    // Tell webpack how to handle ES modules vs CommonJS
    fullySpecified: false
  },
  // Allow ES module imports to be treated as CommonJS when needed
  experiments: {
    topLevelAwait: true,
  },
  output: {
    path: require('path').resolve(__dirname, '..', 'dist', 'renderer'),
    filename: '[name].js',
    publicPath: './',
  },
  devServer: {
    port: 3004,
    hot: true,
    historyApiFallback: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
};