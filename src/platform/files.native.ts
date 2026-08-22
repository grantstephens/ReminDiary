import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { PickedFile } from './files';

export async function pickCsv(): Promise<PickedFile | null> {
  // Android's MIME reporting for CSV is unreliable — files arrive as text/csv,
  // text/comma-separated-values, application/vnd.ms-excel or nothing at all
  // depending on the provider — so the filter is deliberately wide.
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;

  const asset = result.assets[0];
  if (asset === undefined) return null;

  const file = new File(asset.uri);
  return { name: asset.name, text: await file.text() };
}

export async function saveCsv(name: string, text: string): Promise<string> {
  const file = new File(Paths.cache, name);
  // create() throws if the file already exists, and an export a minute after
  // the last one has the same dated name.
  if (file.exists) file.delete();
  file.create();
  await file.write(text);

  if (!(await Sharing.isAvailableAsync())) {
    // No share target at all. The file is written and named; say so rather
    // than pretending nothing happened.
    return name;
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    dialogTitle: 'Export your journal',
    UTI: 'public.comma-separated-values-text',
  });
  return name;
}
