import { fetchViaMediaProxy, isMediaResolverInfrastructureError } from './mediaProxyClient';
import { MAX_MIDI_IMPORT_BYTES } from './midiToAbcClient';
import { normalizeMidiBytes } from './scoreImportClient';
import { buildLocalMidiImportProfile } from './midiLocalAnalyze';

/**
 * Prefer the local SMF voice list so the wizard never loses tracks before the
 * Tracks step. Optionally enrich tempo/key from /midi2analyze when reachable.
 */
export async function analyzeMidiBytes(midiBytes, fileName, accessToken, options) {
  const opts = options || {};
  const normalized = normalizeMidiBytes(midiBytes);
  if (!normalized || !normalized.byteLength) {
    throw new Error('MIDI file is empty');
  }
  if (normalized.byteLength > MAX_MIDI_IMPORT_BYTES) {
    throw new Error('MIDI file is too large');
  }

  const localProfile = buildLocalMidiImportProfile(normalized, fileName);
  if (opts.localOnly || !accessToken) {
    return localProfile;
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
      return localProfile;
    }

    const body = await response.json();
    const remote = body.profile || body;
    if (!remote || typeof remote !== 'object') {
      return localProfile;
    }

    return mergeAnalyzeProfiles(localProfile, remote);
  } catch (error) {
    if (isMediaResolverInfrastructureError(error) || opts.preferLocal) {
      return localProfile;
    }
    // Network / proxy issues must not block opening the wizard.
    return localProfile;
  }
}

function mergeAnalyzeProfiles(localProfile, remoteProfile) {
  const merged = Object.assign({}, localProfile);
  if (remoteProfile.tempo_bpm) merged.tempo_bpm = remoteProfile.tempo_bpm;
  if (remoteProfile.time_signature) merged.time_signature = remoteProfile.time_signature;
  if (remoteProfile.estimated_key) merged.estimated_key = remoteProfile.estimated_key;
  if (remoteProfile.title) merged.title = remoteProfile.title;
  if (remoteProfile.beats_per_bar) merged.beats_per_bar = remoteProfile.beats_per_bar;
  if (remoteProfile.source_hint && remoteProfile.source_hint !== 'unknown') {
    merged.source_hint = remoteProfile.source_hint;
  }
  const remoteTracks = Array.isArray(remoteProfile.tracks) ? remoteProfile.tracks : [];
  merged.voice_count_server = remoteTracks.filter(function(t) {
    return (t.note_count || 0) > 0;
  }).length;
  if (
    merged.voice_count_server
    && merged.voice_count_client
    && merged.voice_count_server !== merged.voice_count_client
  ) {
    merged.voice_count_mismatch = true;
  }
  // Keep local SMF track list as the source of truth for selection.
  return merged;
}
