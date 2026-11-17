const STORAGE_KEY = 'remindiary-streaks-enabled';

export async function getStreaksEnabled(): Promise<boolean> {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    // Storage can be unavailable (private browsing, blocked site data) -
    // default to on, same as a first launch.
    return true;
  }
}

export async function setStreaksEnabled(enabled: boolean): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // The toggle just will not persist across reloads, which is not worth
    // surfacing to the user.
  }
}
