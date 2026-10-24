import { decodeState, LEGACY_KEY, STORAGE_KEY } from './state.js';

/** Storage is optional. The world keeps working in memory when a browser blocks it. */
export function createPersistence(onStatus) {
  let storage;
  let recovered = false;

  function unavailable() {
    onStatus('unavailable', 'Browser storage is unavailable. Changes last only in this tab.');
  }

  return {
    load() {
      try {
        storage = window.localStorage;
        const result = decodeState(storage.getItem(STORAGE_KEY), storage.getItem(LEGACY_KEY));
        recovered = result.status === 'recovered';
        onStatus(
          result.status,
          recovered
            ? 'Some saved data could not be read. A safe local world has been restored.'
            : result.status === 'migrated'
              ? 'Your previous name is here. Your world stays in this browser.'
              : 'Saved in this browser. No account, no cloud.',
        );
        return result.state;
      } catch {
        unavailable();
        return decodeState(null).state;
      }
    },
    save(state) {
      try {
        if (!storage) storage = window.localStorage;
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
        storage.removeItem(LEGACY_KEY);
        onStatus(
          recovered ? 'recovered' : 'saved',
          recovered
            ? 'Unreadable data was repaired. New changes are saved in this browser.'
            : 'Saved in this browser. No account, no cloud.',
        );
        return true;
      } catch {
        unavailable();
        return false;
      }
    },
    reset(state) {
      recovered = false;
      return this.save(state);
    },
  };
}
