/**
 * Persists the user's light/dark override across launches. Native only, by
 * design - see themePreference.web.ts.
 *
 * The implementations live in themePreference.native.ts and
 * themePreference.web.ts; Metro picks one by platform extension. This file
 * exists so imports have something to resolve to for TypeScript, and so the
 * contract is stated once.
 */

import type { ThemeMode } from '../theme';

/** getThemeMode reads the stored override, or null if none has been set. */
export declare function getThemeMode(): Promise<ThemeMode | null>;

/** setThemeMode persists the override. */
export declare function setThemeMode(mode: ThemeMode): Promise<void>;
