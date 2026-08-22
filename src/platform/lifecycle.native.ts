import { AppState, type AppStateStatus } from 'react-native';

export function onAppHidden(callback: () => void): () => void {
  const handle = (state: AppStateStatus) => {
    if (state === 'background' || state === 'inactive') callback();
  };
  const subscription = AppState.addEventListener('change', handle);
  return () => subscription.remove();
}
