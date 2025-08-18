const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const path = require('path');

module.exports = [
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
];