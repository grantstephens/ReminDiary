import type { PickedFile } from './files';

export function pickCsv(): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      file.text().then(
        (text) => resolve({ name: file.name, text }),
        () => resolve(null),
      );
    };
    // A browser gives no cancel event, so a dismissed picker simply never
    // resolves. That is fine: nothing is waiting on it but a dialog that
    // should not appear.
    input.click();
  });
}

export async function saveCsv(name: string, text: string): Promise<string | null> {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
  return name;
}
