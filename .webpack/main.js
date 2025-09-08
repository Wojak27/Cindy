module.exports = {
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: './src/main/main.ts',
  target: 'electron-main',
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
  externals: {
    // Native node modules
    'electron': 'commonjs electron',
    'electron-store': 'commonjs electron-store',
    '@picovoice/porcupine-node': 'commonjs @picovoice/porcupine-node',
    'duckdb': 'commonjs duckdb',
    'duckdb-async': 'commonjs duckdb-async',
    'faiss-node': 'commonjs faiss-node',
    'sqlite3': 'commonjs sqlite3',
    'keytar': 'commonjs keytar',
    'microsoft-cognitiveservices-speech-sdk': 'commonjs microsoft-cognitiveservices-speech-sdk',
    'whisper-node': 'commonjs whisper-node',
    'bull': 'commonjs bull',
    'node-cron': 'commonjs node-cron',
    'bufferutil': 'commonjs bufferutil',
    'utf-8-validate': 'commonjs utf-8-validate',
    'canvas': 'commonjs canvas',
    'sharp': 'commonjs sharp',
    'onnxruntime-node': 'commonjs onnxruntime-node',
    '@huggingface/transformers': 'commonjs @huggingface/transformers',
    'kokoro-js': 'commonjs kokoro-js',
    // Execa and its dependencies
    'execa': 'commonjs execa',
    'node:child_process': 'commonjs child_process',
    'node:fs': 'commonjs fs',
    'node:path': 'commonjs path',
    'node:os': 'commonjs os',
    'node:crypto': 'commonjs crypto',
    'node:stream': 'commonjs stream',
    'node:util': 'commonjs util',
    'node:events': 'commonjs events',
    'node:buffer': 'commonjs buffer',
    'node:process': 'commonjs process',
    'node:url': 'commonjs url',
    'node:http': 'commonjs http',
    'node:https': 'commonjs https',
    'node:net': 'commonjs net',
    'node:tls': 'commonjs tls',
    'node:dns': 'commonjs dns',
    'node:readline': 'commonjs readline',
    'node:vm': 'commonjs vm',
    'node:zlib': 'commonjs zlib',
    'node:querystring': 'commonjs querystring',
    'node:constants': 'commonjs constants',
    'node:worker_threads': 'commonjs worker_threads',
    'node:cluster': 'commonjs cluster',
    'node:dgram': 'commonjs dgram',
    'node:v8': 'commonjs v8',
    'node:stream/promises': 'commonjs stream/promises',
    'node:stream/web': 'commonjs stream/web',
  },
  node: {
    __dirname: false,
    __filename: false,
  },
  output: {
    filename: 'main.js',
    path: require('path').resolve(__dirname, '..', 'dist'),
  },
};