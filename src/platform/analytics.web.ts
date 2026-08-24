import { buildUmamiPayload, UMAMI_ENDPOINT } from './umamiPayload';

const STORAGE_KEY = 'remindiary-analytics-enabled';

export async function getAnalyticsEnabled(): Promise<boolean> {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    // Storage can be unavailable (private browsing, blocked site data) -
    // default to off, same as a first launch.
    return false;
  }
}

export async function setAnalyticsEnabled(enabled: boolean): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // The toggle just will not persist across reloads, which is not worth
    // surfacing to the user.
  }
}

export async function trackScreenView(screenName: string): Promise<void> {
  if (!(await getAnalyticsEnabled())) return;
  try {
    await fetch(UMAMI_ENDPOINT, {
      method: 'POST',
      // No User-Agent here: a browser's fetch() always sends its own and
      // forbids a script from overriding it, which already satisfies
      // Umami's requirement for one. See analytics.native.ts for the
      // platform that does need to set it explicitly.
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildUmamiPayload(screenName, 'web')),
    });
  } catch {
    // Analytics must never crash the app or surface a dialog to the user.
  }
}
