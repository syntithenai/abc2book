import { fetchViaMediaProxy } from './mediaProxyClient';
import { musicXmlToAbc, MIDI_XML2ABC_OPTIONS } from './musicXmlToAbc';
import { normalizeMidiBytes } from './scoreImportClient';

export const MAX_MIDI_IMPORT_BYTES = 4 * 1024 * 1024;

function buildMidiImportUrl(options) {
  const params = new URLSearchParams();
  if (options && options.mode) params.set('mode', options.mode);
  if (options && options.strategy) params.set('strategy', options.strategy);
  if (options && options.includeChords === true) params.set('include_chords', '1');
  if (options && options.includeChords === false) params.set('include_chords', '0');
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

  let abc = body.abc ? String(body.abc).trim() : '';
  const mode = body.mode || 'melody';
  const xml2abcOptions = Object.assign(
    {},
    MIDI_XML2ABC_OPTIONS,
    {
      fileName: fileName || 'import.mid',
      v: mode === 'multi_voice' ? 1 : 0,
      addq: body.profile && body.profile.tempo_bpm ? 1 : 0,
      q: body.profile && body.profile.tempo_bpm ? Math.round(body.profile.tempo_bpm) : 100,
    },
    opts.xml2abcOptions || {}
  );

  if (!abc && body.musicXml) {
    abc = musicXmlToAbc(body.musicXml, xml2abcOptions);
  } else if (abc && body.musicXml && body.strategy === 'musicxml') {
    try {
      const refined = musicXmlToAbc(body.musicXml, xml2abcOptions);
      if (refined && refined.trim()) {
        abc = refined;
      }
    } catch (e) {
      // Keep server-generated ABC fallback.
    }
  }

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
