import { File, Paths } from 'expo-file-system';

import type { ThemeMode } from '../theme';

const file = new File(Paths.document, 'theme-preference.json');

const VALID_MODES: ThemeMode[] = ['system', 'light', 'dark'];

export async function getThemeMode(): Promise<ThemeMode | null> {
  if (!file.exists) return null;
  try {
    const { mode } = JSON.parse(await file.text()) as { mode?: unknown };
    return VALID_MODES.includes(mode as ThemeMode) ? (mode as ThemeMode) : null;
  } catch {
    // A corrupt preference file is not worth surfacing to the user - it
    // just falls back to following the system, same as a first launch.
    return null;
  }
}

export async function setThemeMode(mode: ThemeMode): Promise<void> {
  if (file.exists) file.delete();
  file.create();
  await file.write(JSON.stringify({ mode }));
}
