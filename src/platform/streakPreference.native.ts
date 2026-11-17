import { File, Paths } from 'expo-file-system';

const file = new File(Paths.document, 'streak-preference.json');

export async function getStreaksEnabled(): Promise<boolean> {
  if (!file.exists) return true;
  try {
    const { enabled } = JSON.parse(await file.text()) as { enabled?: unknown };
    return enabled !== false;
  } catch {
    // A corrupt preference file defaults to on, same as a first launch.
    return true;
  }
}

export async function setStreaksEnabled(enabled: boolean): Promise<void> {
  if (file.exists) file.delete();
  file.create();
  await file.write(JSON.stringify({ enabled }));
}
