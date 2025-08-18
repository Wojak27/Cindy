module.exports = [
  {
    test: /\.tsx?$/,
    exclude: /(node_modules|\.webpack)/,
    use: {
      loader: 'ts-loader',
      options: {
        transpileOnly: true,
      },
    },
  },
  // Handle PDF.js worker files
  {
    test: /pdf\.worker\.(min\.)?js$/,
    type: 'asset/resource',
    generator: {
      filename: 'workers/[name][ext]',
    },
  },
];