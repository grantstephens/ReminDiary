import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

/**
 * Brand palette, drawn from the app icon: olive, cream, sage, amber, charcoal.
 * Paper's stock MD3 themes are the base so error/disabled/backdrop roles stay
 * stock; everything brand-coloured is overridden here and nowhere else (the
 * brand test fails on hex literals elsewhere in src/).
 *
 * Light amber (`tertiary`) is 3.7:1 on cream: large accents only, never small
 * text. Dark mode deliberately keeps charcoal backgrounds.
 */
export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#55633C',
    onPrimary: '#F4EFE6',
    primaryContainer: '#DDE6CC',
    onPrimaryContainer: '#1C2410',
    secondary: '#5D6350',
    onSecondary: '#F4EFE6',
    secondaryContainer: '#E1E4D3',
    onSecondaryContainer: '#1A1E12',
    tertiary: '#B86E00',
    onTertiary: '#FFFFFF',
    tertiaryContainer: '#FFDDB0',
    onTertiaryContainer: '#3A2400',
    background: '#FBF7EF',
    onBackground: '#221F1B',
    surface: '#F4EFE6',
    onSurface: '#221F1B',
    surfaceVariant: '#E4E2D6',
    onSurfaceVariant: '#47473F',
    outline: '#78786B',
    outlineVariant: '#CAC8BA',
    inverseSurface: '#34312C',
    inverseOnSurface: '#F4EFE6',
    inversePrimary: '#B7C4A0',
    elevation: {
      level0: 'transparent',
      level1: '#F5F1E8',
      level2: '#F0ECE1',
      level3: '#EBE7DB',
      level4: '#E9E5D8',
      level5: '#E6E2D4',
    },
  },
};

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#B7C4A0',
    onPrimary: '#26301A',
    primaryContainer: '#3E4B2B',
    onPrimaryContainer: '#DDE6CC',
    secondary: '#C3C9B3',
    onSecondary: '#2D3223',
    secondaryContainer: '#444A36',
    onSecondaryContainer: '#E1E4D3',
    tertiary: '#F2A33A',
    onTertiary: '#3A2400',
    tertiaryContainer: '#5C3D00',
    onTertiaryContainer: '#FFDDB0',
    background: '#221F1B',
    onBackground: '#EDE8DC',
    surface: '#2E2A26',
    onSurface: '#EDE8DC',
    surfaceVariant: '#3A362F',
    onSurfaceVariant: '#CBC6B8',
    outline: '#948F83',
    outlineVariant: '#4A463E',
    inverseSurface: '#EDE8DC',
    inverseOnSurface: '#221F1B',
    inversePrimary: '#55633C',
    elevation: {
      level0: 'transparent',
      level1: '#2A2723',
      level2: '#2E2A26',
      level3: '#332F2A',
      level4: '#35312C',
      level5: '#383430',
    },
  },
};
