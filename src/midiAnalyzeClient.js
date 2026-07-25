import { fetchViaMediaProxy, isMediaResolverInfrastructureError } from './mediaProxyClient';
import { MAX_MIDI_IMPORT_BYTES } from './midiToAbcClient';
import { normalizeMidiBytes } from './scoreImportClient';
import { buildLocalMidiImportProfile } from './midiLocalAnalyze';

export async function analyzeMidiBytes(midiBytes, fileName, accessToken, options) {
  const opts = options || {};
  const normalized = normalizeMidiBytes(midiBytes);
  if (!normalized || !normalized.byteLength) {
    throw new Error('MIDI file is empty');
  }
  if (normalized.byteLength > MAX_MIDI_IMPORT_BYTES) {
    throw new Error('MIDI file is too large');
  }

  const formData = new FormData();
  formData.append('file', new Blob([normalized], { type: 'audio/midi' }), fileName || 'import.mid');

  try {
    const response = await fetchViaMediaProxy('/midi2analyze', accessToken, {
      method: 'POST',
      body: formData,
      signal: opts.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      const body = await response.json().catch(function() { return {}; });
      throw new Error(body.error || 'MIDI analysis failed (HTTP ' + response.status + ')');
    }

    const body = await response.json();
    return body.profile || body;
  } catch (error) {
    if (isMediaResolverInfrastructureError(error)) {
      return buildLocalMidiImportProfile(normalized, fileName);
    }
    throw error;
  }
}
