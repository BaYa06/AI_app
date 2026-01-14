const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');
const dotenv = require('dotenv');

// Загружаем переменные окружения из .env.local
const envConfig = dotenv.config({ path: '.env.local' });

module.exports = (env, argv) => {
  const isDev = argv.mode === 'development';
  
  return {
    mode: argv.mode || 'production',
    target: 'web',
    entry: './index.web.jsx',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: isDev ? 'bundle.js' : 'bundle.[contenthash].js',
      publicPath: '/',
      clean: true,
      globalObject: 'self',
    },
    resolve: {
      alias: {
        'react-native$': 'react-native-web',
        'react-native-gesture-handler': path.resolve(__dirname, 'src/polyfills/gesture-handler.web.ts'),
        'react-native-mmkv': path.resolve(__dirname, 'src/polyfills/mmkv.web.ts'),
        '@': path.resolve(__dirname, 'src'),
      },
      extensions: ['.web.js', '.web.ts', '.web.tsx', '.js', '.jsx', '.ts', '.tsx', '.json'],
    },
    module: {
      rules: [
        {
          test: /\.(js|jsx|ts|tsx)$/,
          exclude: /node_modules\/(?!(@react-native|react-native-svg|lucide-react-native|@react-navigation)\/).*/,
          use: {
            loader: 'babel-loader',
            options: {
              cacheDirectory: true,
              sourceType: 'unambiguous',
              presets: [
                ['@babel/preset-env', {
                  modules: false,
                  targets: {
                    browsers: ['last 2 versions', 'not dead']
                  }
                }],
                ['@babel/preset-react', { runtime: 'automatic' }],
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
      new CopyWebpackPlugin({
        patterns: [
          { from: 'public/manifest.json', to: 'manifest.json' },
          { from: 'public/sw.js', to: 'sw.js' },
          { from: 'public/icons', to: 'icons' },
        ],
      }),
      new webpack.DefinePlugin({
        __DEV__: JSON.stringify(isDev),
        'process.env.NODE_ENV': JSON.stringify(argv.mode || 'production'),
        'process.env.JEST_WORKER_ID': JSON.stringify(null),
        'process.env.POSTGRES_URL': JSON.stringify(process.env.POSTGRES_URL || ''),
      }),
      new webpack.ProvidePlugin({
        process: 'process/browser',
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
