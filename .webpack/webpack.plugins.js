const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');
const path = require('path');

// Polyfill banner that gets injected at the top of every bundle
const polyfillBanner = `
// Promise.withResolvers polyfill - injected by webpack
if (typeof Promise.withResolvers === 'undefined') {
  Promise.withResolvers = function() {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
  console.log('[Webpack Banner] Promise.withResolvers polyfilled');
}
`;

module.exports = [
  new webpack.BannerPlugin({
    banner: polyfillBanner,
    raw: true,
    entryOnly: false, // Apply to all chunks, not just entry
  }),
  new HtmlWebpackPlugin({
    template: './src/renderer/index.html',
  }),
  new CopyWebpackPlugin({
    patterns: [
      {
        from: path.resolve(__dirname, '../node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
        to: 'workers/pdf.worker.min.mjs',
      },
    ],
  }),
  // Add HMR plugin for development
  process.env.NODE_ENV === 'development' && new webpack.HotModuleReplacementPlugin(),
].filter(Boolean);