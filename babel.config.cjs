module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'babel-plugin-transform-inline-environment-variables',
      {
        include: [
          'SUPABASE_URL',
          'SUPABASE_ANON_KEY',
          'SUPABASE_REDIRECT_URI',
          'SUPABASE_WEB_REDIRECT_URI',
          'POSTGRES_URL',
          'POSTGRES_DEFAULT_USER_ID',
          'EXPO_PUBLIC_POSTGRES_URL',
          'REACT_APP_POSTGRES_URL',
          'NEXT_PUBLIC_POSTGRES_URL',
          'FIREBASE_API_KEY',
          'FIREBASE_AUTH_DOMAIN',
          'FIREBASE_PROJECT_ID',
          'FIREBASE_STORAGE_BUCKET',
          'FIREBASE_MESSAGING_SENDER_ID',
          'FIREBASE_APP_ID',
          'FIREBASE_MEASUREMENT_ID',
          'EXPO_PUBLIC_GCLOUD_TTS_KEY',
          'EXPO_PUBLIC_GCLOUD_TTS_SA',
          'GCLOUD_TTS_KEY',
          'GCLOUD_TTS_SA',
          'REACT_APP_GCLOUD_TTS_KEY',
          'REACT_APP_GCLOUD_TTS_SA',
        ],
      },
    ],
    [
      'module-resolver',
      {
        root: ['./src'],
        extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
        alias: {
          '@': './src',
        },
      },
    ],
    ...(process.env.NODE_ENV === 'production'
      ? [['transform-remove-console', { exclude: ['error'] }]]
      : []),
    'react-native-reanimated/plugin', // Must be last
  ],
};
