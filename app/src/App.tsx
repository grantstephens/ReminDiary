import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { JournalProvider, useJournal } from './JournalContext';
import type { Store } from './domain/store';
import { openStore } from './storage/openStore';
import { DataScreen } from './screens/Data';
import { MemoriesScreen } from './screens/Memories';
import { StatsScreen } from './screens/Stats';
import { WriteScreen } from './screens/Write';

export type TabName = 'Write' | 'Memories' | 'Stats' | 'Data';

const Tab = createBottomTabNavigator();

/**
 * A ref rather than useNavigation, because the provider that carries onSaved is
 * rendered above the navigator and so has no navigation object to read.
 */
const navigationRef = createNavigationContainerRef<Record<TabName, undefined>>();

export default function App() {
  const [store, setStore] = useState<Store | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    openStore().then(
      (opened) => {
        if (cancelled) {
          void opened.close();
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

  if (failure !== null) {
    return <ErrorScreen error={failure} />;
  }
  if (store === null) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <JournalProvider store={store} now={now} onSaved={revealMemories}>
        <NavigationContainer ref={navigationRef}>
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
 * Tabs is separate from App so it can call useJournal — the guard ref it needs
 * lives in the provider App renders.
 */
function Tabs() {
  const { guard } = useJournal();
  return (
    <Tab.Navigator
      // Bottom placement keeps the tabs thumb-reachable on a phone, and
      // unobtrusive in a browser.
      screenOptions={{ headerShown: false }}
      screenListeners={({ navigation, route }) => ({
        tabPress: (e: { preventDefault: () => void }) => {
          const check = guard.current;
          // Nothing unsaved, or the user pressed the tab they are already on.
          if (check === null || navigation.isFocused()) return;
          e.preventDefault();
          void check().then((mayLeave) => {
            if (mayLeave) {
              guard.current = null;
              navigation.navigate(route.name);
            }
          });
        },
      })}
    >
      <Tab.Screen name="Write" component={WriteScreen} />
      <Tab.Screen name="Memories" component={MemoriesScreen} />
      <Tab.Screen name="Stats" component={StatsScreen} />
      <Tab.Screen name="Data" component={DataScreen} />
    </Tab.Navigator>
  );
}

function ErrorScreen({ error }: { error: Error }) {
  return (
    <View style={styles.centre}>
      <Text style={styles.errorTitle}>Could not open your journal</Text>
      <Text style={styles.errorBody}>{error.message}</Text>
      <Text style={styles.errorBody}>
        Your entries are still on this device. Restarting the app is usually enough.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  errorBody: { textAlign: 'center', marginBottom: 8 },
});
