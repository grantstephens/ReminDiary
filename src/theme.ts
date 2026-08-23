/**
 * Colors, not layout. Every screen currently renders with none set at all —
 * this is the first place any deliberate color decisions get made, which is
 * why the two palettes are plain, standard tones rather than anything
 * branded: background/surface/text/muted/accent/border, nothing more.
 */
export interface Theme {
  dark: boolean;
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  accent: string;
  border: string;
}

export const lightTheme: Theme = {
  dark: false,
  background: '#FFFFFF',
  surface: '#F2F2F2',
  text: '#1C1C1E',
  textMuted: '#6E6E73',
  accent: '#0A84FF',
  border: '#D1D1D6',
};

export const darkTheme: Theme = {
  dark: true,
  // #121212, not black: Android's own Material dark-theme spec - pure black
  // makes elevated surfaces indistinguishable and halos on OLED motion blur.
  background: '#121212',
  surface: '#1E1E1E',
  text: '#E5E5E7',
  textMuted: '#9B9BA1',
  accent: '#0A84FF',
  border: '#2C2C2E',
};

/** ThemeMode is the user's stored preference; 'system' follows the OS. */
export type ThemeMode = 'system' | 'light' | 'dark';
