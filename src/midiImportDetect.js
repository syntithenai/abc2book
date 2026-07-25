import { detectScoreFormat } from './scoreImportClient';
import { normalizeMidiBytes } from './scoreImportClient';
import { isMidiImportFile } from './midiFileUtils';

/**
 * True when bytes/file should open the MIDI import wizard (notation conversion).
 */
export function isMidiNotationImport(fileOrBytes, fileName) {
  if (fileOrBytes && typeof File !== 'undefined' && fileOrBytes instanceof File) {
    return isMidiImportFile(fileOrBytes) || detectScoreFormat(fileOrBytes.name) === 'midi';
  }
  const name = String(fileName || '').toLowerCase();
  return name.endsWith('.mid') || name.endsWith('.midi');
}

export function pendingMidiFromFile(file, sourceUrl) {
  if (!file) return null;
  return {
    bytes: file,
    fileName: file.name || 'import.mid',
    sourceUrl: sourceUrl || '',
  };
}

export async function pendingMidiFromBytes(midiBytes, fileName, sourceUrl) {
  const normalized = normalizeMidiBytes(midiBytes);
  if (!normalized || !normalized.byteLength) return null;
  return {
    bytes: normalized,
    fileName: fileName || 'import.mid',
    sourceUrl: sourceUrl || '',
  };
}

export function pendingMidiFromUrl(url, midiBytes, fileName) {
  return {
    bytes: midiBytes,
    fileName: fileName || 'import.mid',
    sourceUrl: url || '',
  };
}
