const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

module.exports = (env, argv) => {
  const isDev = argv.mode === 'development';
  
  return {
    mode: argv.mode || 'production',
    entry: './index.web.js',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: isDev ? 'bundle.js' : 'bundle.[contenthash].js',
      publicPath: '/',
      clean: true,
    },
    resolve: {
      alias: {
        'react-native$': 'react-native-web',
        'react-native-gesture-handler': 'react-native-gesture-handler/lib/commonjs',
        '@': path.resolve(__dirname, 'src'),
      },
      extensions: ['.web.js', '.web.ts', '.web.tsx', '.js', '.jsx', '.ts', '.tsx', '.json'],
    },
    module: {
      rules: [
        {
          test: /\.(js|jsx|ts|tsx)$/,
          exclude: /node_modules\/(?!(react-native-gesture-handler|@react-navigation|@react-native|react-native-svg|lucide-react-native)\/).*/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                '@babel/preset-env',
                '@babel/preset-react',
                '@babel/preset-typescript',
                ['@babel/preset-flow', { allowDeclareFields: true }],
              ],
              plugins: [
                ['@babel/plugin-transform-class-properties', { loose: true }],
                ['@babel/plugin-transform-private-methods', { loose: true }],
                ['@babel/plugin-transform-private-property-in-object', { loose: true }],
              ],
            },
          },
        },
        {
          test: /\.(png|jpe?g|gif|svg)$/i,
          type: 'asset/resource',
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './public/index.html',
        inject: 'body',
      }),
      new webpack.DefinePlugin({
        __DEV__: JSON.stringify(isDev),
        'process.env.NODE_ENV': JSON.stringify(argv.mode || 'production'),
      }),
    ],
    devServer: isDev ? {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: 'all',
      hot: true,
      open: false,
      historyApiFallback: true,
      headers: {
        'Cache-Control': 'no-store',
      },
    } : undefined,
  };
};
