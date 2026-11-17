/**
 * Persists whether streaks and streak nudges are shown: the "write
 * yesterday's entry?" prompt on save, and the streak lines in Settings. On
 * (true) until the user turns it off. Same shape as analytics.ts: a file on
 * native, localStorage on web.
 *
 * The implementations live in streakPreference.native.ts and
 * streakPreference.web.ts; Metro picks one by platform extension. This file
 * exists so imports have something to resolve to for TypeScript, and so the
 * contract is stated once.
 */

/** getStreaksEnabled reads the stored choice. On (true) until set. */
export declare function getStreaksEnabled(): Promise<boolean>;

/** setStreaksEnabled persists the choice. */
export declare function setStreaksEnabled(enabled: boolean): Promise<void>;
