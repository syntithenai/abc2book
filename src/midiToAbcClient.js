import { fetchViaMediaProxy } from './mediaProxyClient';
import { resolveImportAbcFromResponse } from './midiImportAbcResolve';
import { normalizeMidiBytes } from './scoreImportClient';

export const MAX_MIDI_IMPORT_BYTES = 4 * 1024 * 1024;

function appendListParam(params, key, values) {
  if (!values || !values.length) return;
  params.set(key, values.map(function(v) { return String(v); }).join(','));
}

function buildMidiImportUrl(options) {
  const params = new URLSearchParams();
  const opts = options || {};
  if (opts.mode) params.set('mode', opts.mode);
  if (opts.strategy) params.set('strategy', opts.strategy);
  if (opts.includeChords === true) params.set('include_chords', '1');
  if (opts.includeChords === false) params.set('include_chords', '0');
  if (opts.includeDrums === true) params.set('include_drums', '1');
  appendListParam(params, 'track_ids', opts.trackIds);
  appendListParam(params, 'drum_track_ids', opts.drumTrackIds);
  if (opts.quantSlotsPerBeat != null) params.set('quant_slots_per_beat', String(opts.quantSlotsPerBeat));
  if (opts.noteLength) params.set('note_length', opts.noteLength);
  if (opts.tempoBpm != null) params.set('tempo_bpm', String(opts.tempoBpm));
  if (opts.timeSignature) params.set('time_signature', opts.timeSignature);
  if (opts.estimatedKey) params.set('estimated_key', opts.estimatedKey);
  if (opts.maxVoices != null) params.set('max_voices', String(opts.maxVoices));
  if (opts.quantStrength != null) params.set('quant_strength', String(opts.quantStrength));
  if (opts.rhythmDetail) params.set('rhythm_detail', opts.rhythmDetail);
  if (opts.cleanupOptions && typeof opts.cleanupOptions === 'object') {
    params.set('cleanup_options', JSON.stringify(opts.cleanupOptions));
  }
  if (Array.isArray(opts.importVoices) && opts.importVoices.length) {
    params.set('import_voices', JSON.stringify(opts.importVoices.map(function(voice) {
      return {
        source_ids: voice.sourceIds || [],
        name: voice.displayName || voice.name || '',
        staff: voice.staff || 'auto',
        system: voice.system || 'own',
        is_drum: !!voice.isDrum,
        collapse_chords: !!voice.collapseChords,
      };
    })));
  }
  if (Array.isArray(opts.staffByVoice) && opts.staffByVoice.length) {
    params.set('staff_by_voice', opts.staffByVoice.join(','));
  }
  const query = params.toString();
  return query ? '/midi2abc?' + query : '/midi2abc';
}

/**
 * Import MIDI via resolver orchestrator (/midi2abc).
 * Returns { abc, musicXml, strategy, mode, confidence, warnings, diagnostics, profile }.
 */
export async function importMidiToAbc(midiBytes, fileName, accessToken, options) {
  const opts = options || {};
  const normalized = normalizeMidiBytes(midiBytes);
  if (!normalized || !normalized.byteLength) {
    throw new Error('MIDI file is empty');
  }
  if (normalized.byteLength > MAX_MIDI_IMPORT_BYTES) {
    throw new Error(
      'MIDI file is too large (' + normalized.byteLength + ' bytes; limit is '
      + MAX_MIDI_IMPORT_BYTES + ')'
    );
  }

  const formData = new FormData();
  formData.append('file', new Blob([normalized], { type: 'audio/midi' }), fileName || 'import.mid');

  const response = await fetchViaMediaProxy(buildMidiImportUrl(opts), accessToken, {
    method: 'POST',
    body: formData,
    signal: opts.signal,
    headers: {
      Accept: 'application/json',
    },
  });

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (!response.ok) {
    if (contentType.indexOf('application/json') !== -1) {
      const body = await response.json();
      throw new Error(body.error || 'MIDI import failed');
    }
    throw new Error('MIDI import failed (HTTP ' + response.status + ')');
  }

  const body = await response.json();
  if (!body || typeof body !== 'object') {
    throw new Error('MIDI import returned invalid response');
  }
  if (body.error) {
    throw new Error(body.error);
  }

  const abc = resolveImportAbcFromResponse(body, fileName, opts);
  const mode = body.mode || 'melody';

  return {
    abc: abc,
    musicXml: body.musicXml || '',
    strategy: body.strategy || 'unknown',
    mode: mode,
    confidence: typeof body.confidence === 'number' ? body.confidence : 0,
    warnings: Array.isArray(body.warnings) ? body.warnings.slice() : [],
    diagnostics: body.diagnostics || {},
    profile: body.profile || {},
    score: body.score,
    chordSegments: body.chordSegments || null,
    harmonyAbc: body.harmonyAbc || '',
    harmonyVoiceName: body.harmonyVoiceName || '',
    chords: body.chords || null,
  };
}

export default importMidiToAbc;
