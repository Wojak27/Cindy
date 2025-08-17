module.exports = {
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: './src/main/main.ts',
  // Put your normal webpack config below here
  module: {
    rules: require('./webpack.rules'),
  },
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.json'],
    alias: {
      '@main': require('path').resolve(__dirname, '..', 'src', 'main'),
      '@renderer': require('path').resolve(__dirname, '..', 'src', 'renderer'),
      '@shared': require('path').resolve(__dirname, '..', 'src', 'shared'),
    },
  },
};