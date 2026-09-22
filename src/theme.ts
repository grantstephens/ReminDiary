/**
 * ThemeMode is the user's stored preference; 'system' follows the OS.
 *
 * Colors, typography and shape are no longer a bespoke token set here - they
 * come from react-native-paper's Material 3 palettes (MD3LightTheme /
 * MD3DarkTheme), selected in ThemeContext.tsx and provided to the app via
 * PaperProvider. `Theme` is re-exported as an alias for Paper's MD3Theme so
 * every screen's `createStyles(theme: Theme)` signature keeps working
 * unchanged; only the token paths moved (e.g. `theme.text` -> `theme.colors.onBackground`,
 * `theme.accent` -> `theme.colors.primary`).
 */
export type ThemeMode = 'system' | 'light' | 'dark';

export type { MD3Theme as Theme } from 'react-native-paper';
