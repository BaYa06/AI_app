const path = require('path');
const express = require('express');
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
      filename: isDev ? 'bundle.js' : '[name].[contenthash].js',
      chunkFilename: isDev ? '[name].chunk.js' : '[name].[contenthash].chunk.js',
      publicPath: '/',
      clean: true,
      globalObject: 'self',
    },
    optimization: isDev ? undefined : {
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendor',
            chunks: 'all',
            priority: 10,
          },
        },
      },
    },
    resolve: {
      alias: {
        'react-native$': 'react-native-web',
        'react-native-gesture-handler': path.resolve(__dirname, 'src/polyfills/gesture-handler.web.ts'),
        'react-native-mmkv': path.resolve(__dirname, 'src/polyfills/mmkv.web.ts'),
        'react-native-document-picker': path.resolve(__dirname, 'src/polyfills/document-picker.web.ts'),
        'react-native-tts': path.resolve(__dirname, 'src/polyfills/tts.web.ts'),
        'react-native-fs': path.resolve(__dirname, 'src/polyfills/react-native-fs.web.ts'),
        'react-native-sound': path.resolve(__dirname, 'src/polyfills/react-native-sound.web.ts'),
        '@react-native-voice/voice': path.resolve(__dirname, 'src/polyfills/voice.web.ts'),
        '@': path.resolve(__dirname, 'src'),
      },
      extensions: ['.web.js', '.web.ts', '.web.tsx', '.js', '.jsx', '.ts', '.tsx', '.json'],
    },
    module: {
      rules: [
        {
          test: /\.(js|jsx|ts|tsx)$/,
          exclude: /node_modules\/(?!(@react-native|react-native-svg|lucide-react-native|@react-navigation|react-native-vector-icons|react-native-inappbrowser-reborn)\/).*/,
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
          // Аудио-файлы для звуковых эффектов викторин
          { from: 'public/correct.wav', to: 'correct.wav' },
          { from: 'public/correct2.wav', to: 'correct2.wav' },
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
          FIREBASE_VAPID_KEY: envVars.FIREBASE_VAPID_KEY || process.env.FIREBASE_VAPID_KEY || '',
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
      static: {
        directory: path.join(__dirname, 'public'),
        publicPath: '/',
      },
      // Force plain HTTP dev server to avoid certificate prompts in PWA testing
      server: { type: 'http' },
      headers: {
        'Cache-Control': 'no-store',
      },
      setupMiddlewares: (middlewares, devServer) => {
        const app = devServer.app;

        // Override default body parser limit for PDF uploads
        app.use(express.json({ limit: '50mb' }));

        // Custom API middleware (must be added at the BEGINNING)
        const apiMiddleware = express.Router();
        
        apiMiddleware.post('/api/push/subscribe', async (req, res) => {
          console.log('[devServer] POST /api/push/subscribe called');
          console.log('[devServer] Body:', JSON.stringify(req.body));
          try {
            const mod = await import('./api/push/subscribe.js');
            return mod.default(req, res);
          } catch (e) {
            console.error('[devServer] push/subscribe error', e);
            return res.status(500).json({ error: 'dev-server error', message: e.message });
          }
        });

        apiMiddleware.post('/api/push/unsubscribe', async (req, res) => {
          console.log('[devServer] POST /api/push/unsubscribe called');
          console.log('[devServer] Body:', JSON.stringify(req.body));
          try {
            const mod = await import('./api/push/unsubscribe.js');
            return mod.default(req, res);
          } catch (e) {
            console.error('[devServer] push/unsubscribe error', e);
            return res.status(500).json({ error: 'dev-server error', message: e.message });
          }
        });

        apiMiddleware.post('/api/generate-examples', async (req, res) => {
          console.log('[devServer] POST /api/generate-examples called');
          try {
            const mod = await import('./api/generate-examples.js');
            return mod.default(req, res);
          } catch (e) {
            console.error('[devServer] generate-examples error', e);
            return res.status(500).json({ error: 'dev-server error', message: e.message });
          }
        });

        apiMiddleware.post('/api/extract-pdf', async (req, res) => {
          console.log('[devServer] POST /api/extract-pdf called');
          try {
            const mod = await import('./api/extract-pdf.js');
            return mod.default(req, res);
          } catch (e) {
            console.error('[devServer] extract-pdf error', e);
            return res.status(500).json({ error: 'dev-server error', message: e.message });
          }
        });

        // Debug: log all API requests
        apiMiddleware.use('/api', (req, res, next) => {
          console.log('[devServer] API request:', req.method, req.url);
          next();
        });

        // Insert custom API middleware at the BEGINNING of the stack
        middlewares.unshift({
          name: 'api-routes',
          middleware: apiMiddleware,
        });

        return middlewares;
      },
    } : undefined,
  };
};
