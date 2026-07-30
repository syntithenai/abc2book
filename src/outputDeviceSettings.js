const STORAGE_KEY = 'bookstorage_audio_output_device';

export function getOutputDeviceId() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw || '';
  } catch (e) {
    return '';
  }
}

export function setOutputDeviceId(deviceId) {
  const next = deviceId || '';
  try {
    if (next) {
      localStorage.setItem(STORAGE_KEY, next);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (e) {}
  return next;
}
