const rules = require('./webpack.rules');
const plugins = require('./webpack.plugins');

rules.push({
  test: /\.css$/,
  use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
});

module.exports = {
  entry: ['./src/renderer/index.tsx'],
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
    publicPath: process.env.NODE_ENV === 'production' ? './' : '/',
  },
  devServer: {
    port: 3004,
    host: 'localhost',
    hot: true,
    liveReload: true,
    historyApiFallback: {
      index: '/index.html'
    },
    allowedHosts: 'all',
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': '*',
      'Access-Control-Allow-Headers': '*',
    },
    client: {
      webSocketURL: 'ws://localhost:3004/ws',
      overlay: {
        errors: true,
        warnings: false,
      },
    },
    webSocketServer: 'ws',
    compress: true,
    static: {
      directory: require('path').join(__dirname, '..', 'src', 'renderer'),
      publicPath: '/',
    },
    // Add proper MIME type for ES modules
    setupMiddlewares: (middlewares, devServer) => {
      devServer.app.get('/workers/*.mjs', (req, res, next) => {
        res.set('Content-Type', 'application/javascript');
        next();
      });
      return middlewares;
    },
  },
};