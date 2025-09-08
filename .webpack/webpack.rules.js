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
  // Handle ES modules from node_modules
  {
    test: /\.m?js$/,
    include: /node_modules/,
    type: 'javascript/auto',
    resolve: {
      fullySpecified: false,
    },
  },
  // Handle native node modules
  {
    test: /\.node$/,
    loader: 'node-loader',
  },
  // Handle PDF.js worker files
  {
    test: /pdf\.worker\.(min\.)?js$/,
    type: 'asset/resource',
    generator: {
      filename: 'workers/[name][ext]',
    },
  },
  // Handle image files (for Leaflet and other assets)
  {
    test: /\.(png|jpe?g|gif|svg|ico)$/i,
    type: 'asset/resource',
    generator: {
      filename: 'images/[name][ext]',
    },
  },
];