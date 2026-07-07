const STORAGE_KEY = 'bookstorage_audio_drive_upload';

export function getDefaultAudioDriveUpload() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch (e) {
    return false;
  }
}

export function setDefaultAudioDriveUpload(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
  } catch (e) {}
}

export function preferenceFromUploadSelection(flags) {
  if (!Array.isArray(flags) || flags.length === 0) {
    return getDefaultAudioDriveUpload();
  }
  const first = !!flags[0];
  const allSame = flags.every(function(flag) { return !!flag === first; });
  return allSame ? first : getDefaultAudioDriveUpload();
}
