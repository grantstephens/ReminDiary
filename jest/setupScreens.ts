// react-native-safe-area-context's real SafeAreaProvider waits for a native
// onLayout event to report the device frame before it renders its children.
// Nothing in the RNTL/JSDOM-less test environment ever fires that event, so
// without this, any tree containing SafeAreaProvider renders empty forever
// and every assertion past it times out. The package ships this exact mock
// for that reason: https://github.com/th3rdwave/react-native-safe-area-context
// (see its jest/mock.tsx) — swapping in a provider that supplies a fixed
// frame/insets synchronously via context instead of waiting on layout.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
