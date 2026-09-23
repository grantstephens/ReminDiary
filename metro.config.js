const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite's web worker statically imports its wasm binary. The web build
// never actually runs that code path (openStore.ts picks IndexedDbStore on
// web), but Metro still resolves every static import when bundling, so
// without this the web bundle fails to build at all.
config.resolver.assetExts.push('wasm');

module.exports = config;
