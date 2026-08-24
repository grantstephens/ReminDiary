/**
 * Opt-in, off-by-default screen-view analytics via self-hosted Umami. Native
 * only differs from web in where the toggle persists and whether a custom
 * User-Agent header can be set - see analytics.native.ts and analytics.web.ts.
 *
 * The implementations live in analytics.native.ts and analytics.web.ts;
 * Metro picks one by platform extension. This file exists so imports have
 * something to resolve to for TypeScript, and so the contract is stated
 * once. Same shape as themePreference.ts.
 */

/** getAnalyticsEnabled reads the stored opt-in choice. Off (false) until set. */
export declare function getAnalyticsEnabled(): Promise<boolean>;

/** setAnalyticsEnabled persists the opt-in choice. */
export declare function setAnalyticsEnabled(enabled: boolean): Promise<void>;

/**
 * trackScreenView reports a screen change as a pageview, if and only if the
 * user has opted in. A no-op otherwise, and never throws or rejects - a
 * failed analytics request must never be visible to the user.
 */
export declare function trackScreenView(screenName: string): Promise<void>;
