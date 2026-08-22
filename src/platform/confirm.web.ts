export async function confirm(title: string, message: string): Promise<boolean> {
  return window.confirm(`${title}\n\n${message}`);
}

export async function notify(title: string, message: string): Promise<void> {
  window.alert(`${title}\n\n${message}`);
}
