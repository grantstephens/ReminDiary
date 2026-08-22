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

export async function saveCsv(name: string, text: string): Promise<string> {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  // Appended before clicking, and revoked on a later tick. A detached anchor
  // plus a synchronous revoke works in Chrome and silently drops the download
  // in other browsers - and this is the only route a journal leaves the web
  // build, so "works on my browser" is not good enough.
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 0);
  return name;
}
