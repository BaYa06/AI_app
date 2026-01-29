const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const dotenv = require('dotenv');

// Load local env vars for Metro so babel inline plugin can replace process.env.*
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true, // Performance optimization
      },
    }),
  },
  resolver: {
    sourceExts: ['jsx', 'js', 'ts', 'tsx', 'json'],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
