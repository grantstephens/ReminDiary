import { File, Paths } from 'expo-file-system';

import { buildUmamiPayload, UMAMI_ENDPOINT } from './umamiPayload';

const file = new File(Paths.document, 'analytics-preference.json');

export async function getAnalyticsEnabled(): Promise<boolean> {
  if (!file.exists) return false;
  try {
    const { enabled } = JSON.parse(await file.text()) as { enabled?: unknown };
    return enabled === true;
  } catch {
    // A corrupt preference file defaults to off, same as a first launch -
    // never to on, which would be an unopted-in change of behaviour.
    return false;
  }
}

export async function setAnalyticsEnabled(enabled: boolean): Promise<void> {
  if (file.exists) file.delete();
  file.create();
  await file.write(JSON.stringify({ enabled }));
}

export async function trackScreenView(screenName: string): Promise<void> {
  if (!(await getAnalyticsEnabled())) return;
  try {
    await fetch(UMAMI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Umami silently discards requests with no User-Agent. A browser's
        // fetch() always sends its own and forbids overriding it (see
        // analytics.web.ts) - React Native's fetch has no such restriction,
        // so this is set explicitly here only.
        'User-Agent': 'ReminDiary (Android)',
      },
      body: JSON.stringify(buildUmamiPayload(screenName, 'android')),
    });
  } catch {
    // Analytics must never crash the app or surface a dialog to the user.
  }
}
