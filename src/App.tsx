import {
  NavigationContainer,
  createNavigationContainerRef,
  type Theme as NavigationTheme,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { JournalProvider, useJournal } from './JournalContext';
import type { UnsavedGuard } from './JournalContext';
import type { Store } from './domain/store';
import { openStore } from './storage/openStore';
import { MemoriesScreen } from './screens/Memories';
import { SettingsScreen } from './screens/Settings';
import { WriteScreen } from './screens/Write';
import { ThemeProvider, useTheme } from './ThemeContext';
import type { Theme } from './theme';

/** navigationTheme adapts our tokens to react-navigation's own Theme shape. */
function navigationTheme(theme: Theme): NavigationTheme {
  return {
    dark: theme.dark,
    colors: {
      primary: theme.accent,
      background: theme.background,
      card: theme.surface,
      text: theme.text,
      border: theme.border,
      notification: theme.accent,
    },
    fonts: {
      regular: { fontFamily: 'System', fontWeight: '400' },
      medium: { fontFamily: 'System', fontWeight: '500' },
      bold: { fontFamily: 'System', fontWeight: '700' },
      heavy: { fontFamily: 'System', fontWeight: '900' },
    },
  };
}

export type TabName = 'Write' | 'Memories' | 'Settings';

const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<TabName, keyof typeof Ionicons.glyphMap> = {
  Write: 'create-outline',
  Memories: 'book-outline',
  Settings: 'settings-outline',
};

/**
 * Screens render with headerShown: false, so nothing else pads the status bar
 * / camera-cutout area away from a screen's own content.
 */
function withTopInset<P extends object>(Screen: React.ComponentType<P>) {
  return function ScreenWithTopInset(props: P) {
    const { theme } = useTheme();
    return (
      <SafeAreaView
        edges={['top']}
        style={[styles.safeArea, { backgroundColor: theme.background }]}
      >
        <Screen {...props} />
      </SafeAreaView>
    );
  };
}

/**
 * A ref rather than useNavigation, because the provider that carries onSaved is
 * rendered above the navigator and so has no navigation object to read.
 */
const navigationRef = createNavigationContainerRef<Record<TabName, undefined>>();

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}

/**
 * Split from App so it can call useTheme() - the provider it needs has to be
 * an ancestor, not itself.
 */
function AppInner() {
  const { theme } = useTheme();
  const [store, setStore] = useState<Store | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    openStore().then(
      (opened) => {
        if (cancelled) {
          // .catch, not void: void discards the value, not the rejection, and
          // an unhandled rejection here would be a crash on a fast unmount.
          opened.close().catch(() => {});
          return;
        }
        setStore(opened);
      },
      (err: unknown) => {
        if (!cancelled) setFailure(err as Error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Injected once so it is a stable reference; tests replace the whole
  // provider rather than this function.
  const now = useMemo(() => () => new Date(), []);

  const statusBarStyle = theme.dark ? 'light' : 'dark';

  if (failure !== null) {
    return (
      <>
        <StatusBar style={statusBarStyle} />
        <ErrorScreen error={failure} theme={theme} />
      </>
    );
  }
  if (store === null) {
    return (
      <>
        <StatusBar style={statusBarStyle} />
        <View style={[styles.centre, { backgroundColor: theme.background }]}>
          <ActivityIndicator color={theme.accent} />
        </View>
      </>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={statusBarStyle} />
      <JournalProvider store={store} now={now} onSaved={revealMemories} onOpenWrite={openWrite}>
        <NavigationContainer ref={navigationRef} theme={navigationTheme(theme)}>
          <Tabs />
        </NavigationContainer>
      </JournalProvider>
    </SafeAreaProvider>
  );
}

/**
 * revealMemories is the soft gate: writing today pays out immediately by
 * showing what you wrote on this day in previous years.
 */
function revealMemories() {
  if (navigationRef.isReady()) navigationRef.navigate('Memories');
}

/**
 * openWrite is the reverse trip: Memories tapping an entry switches back to
 * Write, which separately picks up the requested date from JournalContext's
 * openDate.
 */
function openWrite() {
  if (navigationRef.isReady()) navigationRef.navigate('Write');
}

/** The subset of a navigation object handleTabPress needs. */
interface TabNavigation {
  isFocused(): boolean;
  navigate(name: string): void;
}

/**
 * handleTabPress decides whether a tab press may proceed.
 *
 * Exported and given an explicit signature purely so it can be tested: inline
 * inside screenListeners it is unreachable without mounting a whole navigator,
 * and it is the trickiest logic in this file - it could be inverted or dead
 * and the shell's smoke tests would not notice.
 */
export function handleTabPress(
  guard: React.MutableRefObject<UnsavedGuard | null>,
  e: { preventDefault: () => void },
  navigation: TabNavigation,
  routeName: string,
): void {
  const check = guard.current;
  // Nothing unsaved, or the user pressed the tab they are already on.
  if (check === null || navigation.isFocused()) return;
  e.preventDefault();
  void check().then((mayLeave) => {
    if (mayLeave) {
      // Deliberately does NOT clear guard.current. The guard reflects "Write
      // is holding unsaved edits", which navigating away does not change -
      // Write's own effect disarms it when the editor stops being dirty.
      // Clearing it here made the prompt one-shot: after a single confirmed
      // discard every later tab press navigated away in silence.
      navigation.navigate(routeName);
    }
  });
}

/**
 * Tabs is separate from App so it can call useJournal — the guard ref it needs
 * lives in the provider App renders.
 */
function Tabs() {
  const { guard } = useJournal();
  return (
    <Tab.Navigator
      // Bottom placement keeps the tabs thumb-reachable on a phone, and
      // unobtrusive in a browser.
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={TAB_ICONS[route.name as TabName]} color={color} size={size} />
        ),
        // Otherwise the keyboard just sits on top of the tab bar rather than
        // the bar making room for it.
        tabBarHideOnKeyboard: true,
      })}
      screenListeners={({ navigation, route }) => ({
        tabPress: (e: { preventDefault: () => void }) => {
          handleTabPress(guard, e, navigation, route.name);
        },
      })}
    >
      <Tab.Screen
        name="Write"
        component={withTopInset(WriteScreen)}
        options={{ tabBarButtonTestID: 'tab-Write' }}
      />
      <Tab.Screen
        name="Memories"
        component={withTopInset(MemoriesScreen)}
        options={{ tabBarButtonTestID: 'tab-Memories' }}
      />
      <Tab.Screen
        name="Settings"
        component={withTopInset(SettingsScreen)}
        options={{ tabBarButtonTestID: 'tab-Settings' }}
      />
    </Tab.Navigator>
  );
}

function ErrorScreen({ error, theme }: { error: Error; theme: Theme }) {
  return (
    <View style={[styles.centre, { backgroundColor: theme.background }]}>
      <Text style={[styles.errorTitle, { color: theme.text }]}>
        Could not open your journal
      </Text>
      <Text style={[styles.errorBody, { color: theme.text }]}>{error.message}</Text>
      <Text style={[styles.errorBody, { color: theme.textMuted }]}>
        Your entries are still on this device. Restarting the app is usually enough.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  errorBody: { textAlign: 'center', marginBottom: 8 },
});
