import { fetchViaMediaProxy } from './mediaProxyClient';
import { formatDiscoveredChords } from './chordDiscoveryFormatter';
import { formatMelodyNotes } from './melodyFormatter';

function normalizeMediaAnalysis(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Resolver returned an invalid media analysis response');
  }

  if (body.error) {
    throw new Error(body.error);
  }

  const lyrics = body.lyrics && typeof body.lyrics === 'object' ? body.lyrics : {};
  const chords = body.chords && typeof body.chords === 'object' ? body.chords : {};
  const melody = body.melody && typeof body.melody === 'object' ? body.melody : {};

  return {
    lyrics: {
      text: typeof lyrics.text === 'string' ? lyrics.text.trim() : '',
      segments: Array.isArray(lyrics.segments) ? lyrics.segments : [],
      language: typeof lyrics.language === 'string' ? lyrics.language : '',
      backend: typeof lyrics.backend === 'string' ? lyrics.backend : '',
      error: typeof lyrics.error === 'string' ? lyrics.error : '',
    },
    chords: {
      segments: Array.isArray(chords.segments) ? chords.segments : [],
      beatTimes: Array.isArray(chords.beatTimes) ? chords.beatTimes : [],
      tempo: typeof chords.tempo === 'number' ? chords.tempo : 0,
      duration: typeof chords.duration === 'number' ? chords.duration : 0,
      backend: typeof chords.backend === 'string' ? chords.backend : '',
      error: typeof chords.error === 'string' ? chords.error : '',
    },
    melody: {
      notes: Array.isArray(melody.notes) ? melody.notes : [],
      duration: typeof melody.duration === 'number' ? melody.duration : 0,
      backend: typeof melody.backend === 'string' ? melody.backend : '',
      error: typeof melody.error === 'string' ? melody.error : '',
    },
  };
}

async function parseMediaAnalysisResponse(response) {
  let body = null;
  try {
    body = await response.json();
  } catch (e) {
    throw new Error('Resolver returned an unreadable media analysis response');
  }

  if (!response.ok) {
    throw new Error(body && body.error ? body.error : 'Media analysis failed');
  }

  return normalizeMediaAnalysis(body);
}

export function formatMediaAnalysisForTune(analysis, tune, tunebook) {
  const meter = tune && tune.meter ? tune.meter : '4/4';
  const noteLength = tune && tune.noteLength ? tune.noteLength : '1/8';
  const beatsPerBar = tunebook && tunebook.abcTools
    ? tunebook.abcTools.getBeatsPerBar(meter) || 4
    : 4;
  const barSlots = tunebook && tunebook.abcTools
    ? tunebook.abcTools.getNoteLengthsPerBar(noteLength, meter)
    : 0;
  const slotsPerBeat = barSlots && beatsPerBar
    ? Math.max(1, Math.round(barSlots / beatsPerBar))
    : 2;

  const chordsText = formatDiscoveredChords({
    segments: analysis.chords.segments,
    beatTimes: analysis.chords.beatTimes,
    beatsPerBar: beatsPerBar,
    slotsPerBeat: slotsPerBeat,
  });

  const melodyText = formatMelodyNotes({
    notes: analysis.melody.notes,
    beatTimes: analysis.chords.beatTimes,
    beatsPerBar: beatsPerBar,
    slotsPerBeat: slotsPerBeat,
    noteLength: noteLength,
  });

  return {
    lyricsText: analysis.lyrics.text || '',
    chordsText: chordsText || '',
    melodyText: melodyText || '',
  };
}

export async function analyzeMediaFromSource(options) {
  const {
    source,
    accessToken,
    signal,
    onProgress,
  } = options;

  if (!source) {
    throw new Error('No media source selected');
  }

  if (typeof onProgress === 'function') {
    onProgress(source.kind === 'recording' ? 'Uploading audio...' : 'Resolving audio...');
  }

  if (source.kind === 'recording') {
    if (!source.blob) {
      throw new Error('Recording data is not available');
    }
    const formData = new FormData();
    formData.append('file', source.blob, source.fileName || 'recording.wav');
    formData.append('sourceName', source.label || source.fileName || 'Recording');
    if (typeof onProgress === 'function') {
      onProgress('Analyzing lyrics, chords, and melody...');
    }
    const response = await fetchViaMediaProxy('/analyze-media', accessToken, {
      method: 'POST',
      body: formData,
      signal: signal,
      headers: {
        Accept: 'application/json',
      },
    });
    return parseMediaAnalysisResponse(response);
  }

  if (!source.src) {
    throw new Error('Media source URL is missing');
  }

  if (typeof onProgress === 'function') {
    onProgress('Analyzing lyrics, chords, and melody...');
  }

  const response = await fetchViaMediaProxy('/analyze-media', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      sourceUrl: source.src,
      sourceType: source.srcType || 'audio',
      sourceName: source.label || '',
    }),
    signal: signal,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });

  return parseMediaAnalysisResponse(response);
}
