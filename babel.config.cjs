module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    ['@babel/plugin-transform-class-properties', { loose: true }],
    ['@babel/plugin-transform-private-methods', { loose: true }],
    ['@babel/plugin-transform-private-property-in-object', { loose: true }],
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
    'react-native-reanimated/plugin', // Must be last
  ],
};
