import { beginMidiImportOpen } from './midiImportPendingStore';

/**
 * Open MIDI import editor (dedicated /import/midi page). Resolves when user saves.
 */
export function openMidiImportWizard(options) {
  return new Promise(function(resolve, reject) {
    beginMidiImportOpen(options || {}, resolve, reject);
  });
}

export async function midiFileToWizardPending(file, sourceUrl) {
  const { pendingMidiFromBytes } = await import('./midiImportDetect');
  if (!file) return null;
  const buffer = await file.arrayBuffer();
  return pendingMidiFromBytes(new Uint8Array(buffer), file.name, sourceUrl);
}

export { pendingMidiFromFile } from './midiImportDetect';
