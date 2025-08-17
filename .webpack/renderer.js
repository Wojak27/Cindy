const rules = require('./webpack.rules');
const plugins = require('./webpack.plugins');

rules.push({
  test: /\.css$/,
  use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
});

module.exports = {
  entry: './src/renderer/index.tsx',
  mode: 'development',
  target: 'electron-renderer',
  module: {
    rules,
  },
  plugins: plugins,
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
    alias: {
      '@main': require('path').resolve(__dirname, '..', 'src', 'main'),
      '@renderer': require('path').resolve(__dirname, '..', 'src', 'renderer'),
      '@shared': require('path').resolve(__dirname, '..', 'src', 'shared'),
    },
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