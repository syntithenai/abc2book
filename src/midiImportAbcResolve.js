import { musicXmlToAbc, MIDI_XML2ABC_OPTIONS } from './musicXmlToAbc';
import {
  applyMidiProfileVoiceNamesToAbc,
  replaceGenericTrackNamesInAbc,
} from './midiImportAbcEnhance';

/**
 * Resolve final import ABC from orchestrator response.
 * Uses the server-winning strategy; only falls back to MusicXML when needed.
 */
export function resolveImportAbcFromResponse(body, fileName, options) {
  const opts = options || {};
  if (!body || typeof body !== 'object') return '';

  let abc = body.abc ? String(body.abc).trim() : '';
  const mode = body.mode || 'melody';
  const strategy = body.strategy || '';
  const musicXml = body.musicXml ? String(body.musicXml).trim() : '';
  const multiVoice = mode === 'multi_voice'
    || (opts.trackIds && opts.trackIds.length > 1);

  const xml2abcOptions = Object.assign(
    {},
    MIDI_XML2ABC_OPTIONS,
    {
      fileName: fileName || 'import.mid',
      v: multiVoice ? 1 : 0,
      addq: body.profile && body.profile.tempo_bpm ? 1 : 0,
      q: body.profile && body.profile.tempo_bpm ? Math.round(body.profile.tempo_bpm) : 100,
    },
    opts.xml2abcOptions || {}
  );

  const preferMusicXml = !!musicXml && (
    strategy === 'musicxml'
    || strategy === 'musescore'
    || !abc
  );

  if (preferMusicXml) {
    try {
      const fromXml = musicXmlToAbc(musicXml, xml2abcOptions);
      if (fromXml && fromXml.trim()) {
        abc = fromXml.trim();
      }
    } catch (e) {
      // Keep server ABC fallback when xml2abc fails.
    }
  }

  if (!abc) return '';

  if (body.profile) {
    abc = applyMidiProfileVoiceNamesToAbc(abc, body.profile, {
      trackIds: opts.trackIds,
    });
    abc = replaceGenericTrackNamesInAbc(abc, body.profile, opts.trackIds);
  }

  return abc;
}
