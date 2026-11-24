import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';

import { contrastRatio } from './contrast';
import { darkTheme, lightTheme } from './palette';

describe('brand palette', () => {
  test('light theme uses the brand olive as primary', () => {
    expect(lightTheme.dark).toBe(false);
    expect(lightTheme.colors.primary).toBe('#55633C');
    expect(lightTheme.colors.background).toBe('#FBF7EF');
  });

  test('dark theme keeps charcoal backgrounds and uses sage as primary', () => {
    expect(darkTheme.dark).toBe(true);
    expect(darkTheme.colors.background).toBe('#221F1B');
    expect(darkTheme.colors.surface).toBe('#2E2A26');
    expect(darkTheme.colors.primary).toBe('#B7C4A0');
  });

  test('stock error and disabled roles are kept', () => {
    expect(lightTheme.colors.error).toBe(MD3LightTheme.colors.error);
    expect(darkTheme.colors.error).toBe(MD3DarkTheme.colors.error);
    expect(darkTheme.colors.surfaceDisabled).toBe(MD3DarkTheme.colors.surfaceDisabled);
  });

  test.each([
    ['light onPrimary/primary', lightTheme.colors.onPrimary, lightTheme.colors.primary, 4.5],
    ['light onBackground/background', lightTheme.colors.onBackground, lightTheme.colors.background, 7],
    ['light onSurfaceVariant/surfaceVariant', lightTheme.colors.onSurfaceVariant, lightTheme.colors.surfaceVariant, 4.5],
    ['dark primary/background', darkTheme.colors.primary, darkTheme.colors.background, 7],
    ['dark onBackground/background', darkTheme.colors.onBackground, darkTheme.colors.background, 7],
    ['dark onSurface/surface', darkTheme.colors.onSurface, darkTheme.colors.surface, 7],
    ['dark onSurfaceVariant/background', darkTheme.colors.onSurfaceVariant, darkTheme.colors.background, 4.5],
    ['dark onSurfaceVariant/surface', darkTheme.colors.onSurfaceVariant, darkTheme.colors.surface, 4.5],
    ['dark tertiary/background', darkTheme.colors.tertiary, darkTheme.colors.background, 7],
    // Light amber is for large accents only (never small text): 3:1 is the graphics bar.
    ['light tertiary/background (large accents only)', lightTheme.colors.tertiary, lightTheme.colors.background, 3],
  ])('%s meets %f:1', (_name, fg, bg, min) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min as number);
  });
});
