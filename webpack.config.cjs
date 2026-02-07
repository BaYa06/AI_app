const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');
const dotenv = require('dotenv');

// Загружаем переменные окружения из .env.local и .env
const envLocalResult = dotenv.config({ path: '.env.local' });
const envResult = dotenv.config({ path: '.env' });
const envVars = { ...envResult.parsed, ...envLocalResult.parsed };

// Debug: проверяем загрузку TTS переменных
console.log('[webpack] GCLOUD TTS Key loaded:', !!envVars.EXPO_PUBLIC_GCLOUD_TTS_KEY);
console.log('[webpack] GCLOUD TTS SA loaded:', !!envVars.EXPO_PUBLIC_GCLOUD_TTS_SA);

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
          exclude: /node_modules\/(?!(@react-native|react-native-svg|lucide-react-native|@react-navigation|react-native-vector-icons)\/).*/,
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
          // Явно обрабатываем react-native-vector-icons (JSX внутри node_modules)
          test: /node_modules\/react-native-vector-icons\/.*\.(js|jsx)$/,
          use: {
            loader: 'babel-loader',
            options: {
              cacheDirectory: true,
              presets: [
                ['@babel/preset-env', { modules: false }],
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
        {
          test: /\.(ttf|otf|eot|woff2?)$/i,
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
          { from: 'public/manifest.webmanifest', to: 'manifest.webmanifest' },
          // Дублируем манифест как manifest.json для совместимости с клиентами, ожидающими json-расширение
          { from: 'public/manifest.webmanifest', to: 'manifest.json' },
          { from: 'public/sw.js', to: 'sw.js' },
          { from: 'public/icons', to: 'icons' },
          // Шрифты для react-native-vector-icons
          { from: 'node_modules/react-native-vector-icons/Fonts/Ionicons.ttf', to: 'fonts/Ionicons.ttf' },
        ],
      }),
      new webpack.DefinePlugin({
        __DEV__: JSON.stringify(isDev),
        'process.env': JSON.stringify({
          NODE_ENV: argv.mode || 'production',
          JEST_WORKER_ID: null,
          POSTGRES_URL: envVars.POSTGRES_URL || process.env.POSTGRES_URL || '',
          SUPABASE_URL: envVars.SUPABASE_URL || process.env.SUPABASE_URL || '',
          SUPABASE_ANON_KEY: envVars.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
          SUPABASE_REDIRECT_URI: envVars.SUPABASE_REDIRECT_URI || process.env.SUPABASE_REDIRECT_URI || '',
          SUPABASE_WEB_REDIRECT_URI: envVars.SUPABASE_WEB_REDIRECT_URI || process.env.SUPABASE_WEB_REDIRECT_URI || '',
          EXPO_PUBLIC_GCLOUD_TTS_KEY: envVars.EXPO_PUBLIC_GCLOUD_TTS_KEY || process.env.EXPO_PUBLIC_GCLOUD_TTS_KEY || '',
          EXPO_PUBLIC_GCLOUD_TTS_SA: envVars.EXPO_PUBLIC_GCLOUD_TTS_SA || process.env.EXPO_PUBLIC_GCLOUD_TTS_SA || '',
          GCLOUD_TTS_KEY: envVars.GCLOUD_TTS_KEY || process.env.GCLOUD_TTS_KEY || '',
          GCLOUD_TTS_SA: envVars.GCLOUD_TTS_SA || process.env.GCLOUD_TTS_SA || '',
          REACT_APP_GCLOUD_TTS_KEY: envVars.REACT_APP_GCLOUD_TTS_KEY || process.env.REACT_APP_GCLOUD_TTS_KEY || '',
          REACT_APP_GCLOUD_TTS_SA: envVars.REACT_APP_GCLOUD_TTS_SA || process.env.REACT_APP_GCLOUD_TTS_SA || '',
          // Firebase config for web build
          FIREBASE_API_KEY: envVars.FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || '',
          FIREBASE_AUTH_DOMAIN: envVars.FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || '',
          FIREBASE_PROJECT_ID: envVars.FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '',
          FIREBASE_STORAGE_BUCKET: envVars.FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || '',
          FIREBASE_MESSAGING_SENDER_ID: envVars.FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID || '',
          FIREBASE_APP_ID: envVars.FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || '',
          FIREBASE_MEASUREMENT_ID: envVars.FIREBASE_MEASUREMENT_ID || process.env.FIREBASE_MEASUREMENT_ID || '',
        }),
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
