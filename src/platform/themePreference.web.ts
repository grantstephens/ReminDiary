import type { ThemeMode } from '../theme';

// Deliberately a no-op: light/dark mode is native-only. This file exists
// only so Metro has something to resolve for the web bundle, matching every
// other platform-split module in this directory (each keeps both sides
// rather than scattering Platform.OS checks through shared code).
export async function getThemeMode(): Promise<ThemeMode | null> {
  return null;
}

export async function setThemeMode(_mode: ThemeMode): Promise<void> {}
