import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { MD3DarkTheme, MD3LightTheme, PaperProvider, type MD3Theme } from 'react-native-paper';

import { getThemeMode, setThemeMode } from './platform/themePreference';
import type { ThemeMode } from './theme';

export interface ThemeValue {
  theme: MD3Theme;
  /** mode is the stored preference; 'system' is the default until changed. */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeReactContext = createContext<ThemeValue | null>(null);

/**
 * ThemeProvider is native-only in effect: on web it always resolves to
 * MD3LightTheme and never touches platform/themePreference, so web keeps
 * exactly the appearance it had before this existed. See themePreference.web.ts.
 *
 * It also mounts react-native-paper's PaperProvider with the same resolved
 * theme, so every Paper component anywhere under it (Button, TextInput,
 * Switch, ...) picks up light/dark/system automatically without each screen
 * wiring its own. The icon setting points Paper at @expo/vector-icons'
 * MaterialCommunityIcons rather than the react-native-vector-icons package
 * Paper defaults to, which this project does not depend on.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    void getThemeMode().then((stored) => {
      if (!cancelled && stored !== null) setModeState(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    if (Platform.OS !== 'web') void setThemeMode(next);
  }, []);

  const theme = useMemo<MD3Theme>(() => {
    if (Platform.OS === 'web') return MD3LightTheme;
    const effective = mode === 'system' ? systemScheme : mode;
    return effective === 'dark' ? MD3DarkTheme : MD3LightTheme;
  }, [mode, systemScheme]);

  const value = useMemo<ThemeValue>(() => ({ theme, mode, setMode }), [theme, mode, setMode]);

  return (
    <ThemeReactContext.Provider value={value}>
      <PaperProvider
        theme={theme}
        settings={{ icon: (props) => <MaterialCommunityIcons {...props} /> }}
      >
        {children}
      </PaperProvider>
    </ThemeReactContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeReactContext);
  if (value === null) {
    throw new Error('useTheme must be used inside a ThemeProvider');
  }
  return value;
}
