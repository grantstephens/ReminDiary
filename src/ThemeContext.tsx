import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';

import { getThemeMode, setThemeMode } from './platform/themePreference';
import { darkTheme, lightTheme, type Theme, type ThemeMode } from './theme';

export interface ThemeValue {
  theme: Theme;
  /** mode is the stored preference; 'system' is the default until changed. */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeReactContext = createContext<ThemeValue | null>(null);

/**
 * ThemeProvider is native-only in effect: on web it always resolves to
 * lightTheme and never touches platform/themePreference, so web keeps
 * exactly the appearance it had before this existed. See themePreference.web.ts.
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

  const theme = useMemo<Theme>(() => {
    if (Platform.OS === 'web') return lightTheme;
    const effective = mode === 'system' ? systemScheme : mode;
    return effective === 'dark' ? darkTheme : lightTheme;
  }, [mode, systemScheme]);

  const value = useMemo<ThemeValue>(() => ({ theme, mode, setMode }), [theme, mode, setMode]);

  return <ThemeReactContext.Provider value={value}>{children}</ThemeReactContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeReactContext);
  if (value === null) {
    throw new Error('useTheme must be used inside a ThemeProvider');
  }
  return value;
}
