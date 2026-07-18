import { fetchViaMediaProxy } from './mediaProxyClient';
import { formatDiscoveredChords } from './chordDiscoveryFormatter';
import { formatMelodyNotes } from './melodyFormatter';
import { formatKeySignatureShort } from './melodyPitchSpelling';
import { buildAnalysisProcessingPayload, loadMelodyProcessingSettings } from './melodyProcessingSettings';

export function normalizeMediaAnalysis(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Resolver returned an invalid media analysis response');
  }

  if (body.error) {
    throw new Error(body.error);
  }

  const lyrics = body.lyrics && typeof body.lyrics === 'object' ? body.lyrics : {};
  const chords = body.chords && typeof body.chords === 'object' ? body.chords : {};
  const melody = body.melody && typeof body.melody === 'object' ? body.melody : {};
  const inputsUsed = body.inputsUsed && typeof body.inputsUsed === 'object' ? body.inputsUsed : {};

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
      detectedKey: typeof chords.detectedKey === 'string' ? chords.detectedKey : '',
      keySource: typeof chords.keySource === 'string' ? chords.keySource : '',
      error: typeof chords.error === 'string' ? chords.error : '',
    },
    melody: {
      notes: Array.isArray(melody.notes) ? melody.notes : [],
      silences: Array.isArray(melody.silences) ? melody.silences : [],
      noise: Array.isArray(melody.noise) ? melody.noise : [],
      duration: typeof melody.duration === 'number' ? melody.duration : 0,
      backend: typeof melody.backend === 'string' ? melody.backend : '',
      separated: !!melody.separated,
      melodySource: typeof melody.melodySource === 'string' ? melody.melodySource : '',
      detectedKey: typeof melody.detectedKey === 'string'
        ? formatKeySignatureShort(melody.detectedKey)
        : '',
      detectedMeter: typeof melody.detectedMeter === 'string' ? melody.detectedMeter : '',
      processing: melody.processing && typeof melody.processing === 'object' ? melody.processing : {},
      error: typeof melody.error === 'string' ? melody.error : '',
    },
    timing: body.timing && typeof body.timing === 'object' ? {
      beatTimes: Array.isArray(body.timing.beatTimes) ? body.timing.beatTimes : [],
      downbeatTimes: Array.isArray(body.timing.downbeatTimes) ? body.timing.downbeatTimes : [],
      tempo: typeof body.timing.tempo === 'number' ? body.timing.tempo : 0,
      meter: typeof body.timing.meter === 'string' ? body.timing.meter : '',
      beatsPerBar: typeof body.timing.beatsPerBar === 'number' ? body.timing.beatsPerBar : 0,
      meterChanges: Array.isArray(body.timing.meterChanges) ? body.timing.meterChanges : [],
      detectedKey: typeof body.timing.detectedKey === 'string'
        ? formatKeySignatureShort(body.timing.detectedKey)
        : '',
      detectedMeter: typeof body.timing.detectedMeter === 'string' ? body.timing.detectedMeter : '',
      backend: typeof body.timing.backend === 'string' ? body.timing.backend : '',
    } : null,
    inputsUsed: {
      fromStemCache: !!(inputsUsed.fromStemCache || body.fromStemCache),
      stemCacheId: typeof inputsUsed.stemCacheId === 'string'
        ? inputsUsed.stemCacheId
        : (typeof body.stemCacheId === 'string' ? body.stemCacheId : ''),
      stemModel: typeof inputsUsed.stemModel === 'string' ? inputsUsed.stemModel : '',
      musicType: typeof inputsUsed.musicType === 'string' ? inputsUsed.musicType : '',
      keySource: typeof inputsUsed.keySource === 'string' ? inputsUsed.keySource : '',
      melodyBackend: typeof inputsUsed.melodyBackend === 'string' ? inputsUsed.melodyBackend : '',
      chordBackend: typeof inputsUsed.chordBackend === 'string' ? inputsUsed.chordBackend : '',
      melodyVoicing: typeof inputsUsed.melodyVoicing === 'string' ? inputsUsed.melodyVoicing : '',
    },
    warnings: Array.isArray(body.warnings)
      ? body.warnings.filter(function(item) { return typeof item === 'string' && item; })
      : [],
    stemCacheId: typeof body.stemCacheId === 'string'
      ? body.stemCacheId
      : (typeof inputsUsed.stemCacheId === 'string' ? inputsUsed.stemCacheId : ''),
    fromStemCache: !!(body.fromStemCache || inputsUsed.fromStemCache),
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

export function handleAnalysisStreamEvent(event, onProgress) {
  if (!event || typeof event !== 'object') return null;
  if (event.type === 'progress') {
    if (typeof onProgress === 'function') {
      onProgress(event.message || '', event.progress);
    }
    return null;
  }
  if (event.type === 'error') {
    throw new Error(event.message || 'Media analysis failed');
  }
  if (event.type === 'result') {
    return normalizeMediaAnalysis(event.body);
  }
  return null;
}

async function parseStreamingMediaAnalysisResponse(response, onProgress) {
  if (!response.ok) {
    return parseMediaAnalysisResponse(response);
  }

  if (!response.body || typeof response.body.getReader !== 'function') {
    return parseMediaAnalysisResponse(response);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = null;

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    lines.forEach(function(line) {
      if (!line.trim()) return;
      const parsed = handleAnalysisStreamEvent(JSON.parse(line), onProgress);
      if (parsed) result = parsed;
    });
  }

  if (buffer.trim()) {
    const parsed = handleAnalysisStreamEvent(JSON.parse(buffer), onProgress);
    if (parsed) result = parsed;
  }

  if (!result) {
    throw new Error('Media analysis stream ended without a result');
  }
  return result;
}

async function parseAnalysisResponse(response, onProgress) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.indexOf('application/x-ndjson') >= 0) {
    return parseStreamingMediaAnalysisResponse(response, onProgress);
  }
  return parseMediaAnalysisResponse(response);
}

const ANALYSIS_ACCEPT_HEADER = 'application/x-ndjson, application/json';

export function getDetectedTempoFromAnalysis(raw) {
  if (!raw || typeof raw !== 'object') return 0;

  const candidates = [
    raw.timing && raw.timing.tempo,
    raw.chords && raw.chords.tempo,
    raw.melody && raw.melody.tempo,
  ];
  for (let index = 0; index < candidates.length; index += 1) {
    const value = candidates[index];
    if (typeof value === 'number' && value > 0) {
      return Math.round(value);
    }
  }
  return 0;
}

export function tuneHasTempo(tune) {
  if (!tune || tune.tempo == null || tune.tempo === '') return false;
  const parsed = parseInt(String(tune.tempo).split('=').pop(), 10);
  return !isNaN(parsed) && parsed > 0;
}

export function formatMediaAnalysisForTune(analysis, tune, tunebook, options) {
  const meter = tune && tune.meter ? tune.meter : '4/4';
  const noteLength = tune && tune.noteLength ? tune.noteLength : '1/8';
  const includeMeterChanges = !(options && options.includeMeterChanges === false);
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
    beatTimes: analysis.timing && analysis.timing.beatTimes && analysis.timing.beatTimes.length > 0
      ? analysis.timing.beatTimes
      : analysis.chords.beatTimes,
    beatsPerBar: beatsPerBar,
    slotsPerBeat: slotsPerBeat,
    meterChanges: analysis.timing && Array.isArray(analysis.timing.meterChanges)
      ? analysis.timing.meterChanges
      : [],
    includeMeterChanges: includeMeterChanges,
  });

  const detectedKey = (analysis.melody && (analysis.melody.detectedKey || analysis.melody.key))
    || (tune && tune.key)
    || '';
  const snapToScale = !!(analysis.melody && analysis.melody.processing && analysis.melody.processing.snapToScale);

  const melodyText = formatMelodyNotes({
    notes: analysis.melody.notes,
    beatTimes: analysis.timing && analysis.timing.beatTimes && analysis.timing.beatTimes.length > 0
      ? analysis.timing.beatTimes
      : analysis.chords.beatTimes,
    beatsPerBar: beatsPerBar,
    slotsPerBeat: slotsPerBeat,
    meterChanges: analysis.timing && Array.isArray(analysis.timing.meterChanges)
      ? analysis.timing.meterChanges
      : [],
    noteLength: noteLength,
    key: detectedKey,
    snapToScale: snapToScale,
  });

  return {
    lyricsText: analysis.lyrics.text || '',
    chordsText: chordsText || '',
    melodyText: melodyText || '',
    tempo: getDetectedTempoFromAnalysis(analysis) || 0,
    meter: (analysis.timing && analysis.timing.meter) || '',
    key: detectedKey
      || (analysis.timing && analysis.timing.detectedKey)
      || '',
  };
}

export async function analyzeMediaFromSource(options) {
  const {
    source,
    accessToken,
    signal,
    onProgress,
    processing,
  } = options;

  const melodyProcessing = processing || buildAnalysisProcessingPayload(loadMelodyProcessingSettings());

  if (!source) {
    throw new Error('No media source selected');
  }

  if (typeof onProgress === 'function') {
    onProgress(source.kind === 'recording' ? 'Uploading audio...' : 'Resolving audio...', 0);
  }

  if (source.kind === 'recording') {
    if (!source.blob) {
      throw new Error('Recording data is not available');
    }
    const formData = new FormData();
    formData.append('file', source.blob, source.fileName || 'recording.wav');
    formData.append('sourceName', source.label || source.fileName || 'Recording');
    formData.append('processing', JSON.stringify(melodyProcessing));
    const response = await fetchViaMediaProxy('/analyze-media', accessToken, {
      method: 'POST',
      body: formData,
      signal: signal,
      headers: {
        Accept: ANALYSIS_ACCEPT_HEADER,
      },
    });
    return parseAnalysisResponse(response, onProgress);
  }

  if (!source.src) {
    throw new Error('Media source URL is missing');
  }

  const payload = {
    sourceUrl: source.src,
    sourceType: source.srcType || 'audio',
    sourceName: source.label || '',
    processing: melodyProcessing,
  };
  if (typeof source.startAt === 'number' && source.startAt > 0) {
    payload.startAt = source.startAt;
  }
  if (typeof source.endAt === 'number' && source.endAt > 0) {
    payload.endAt = source.endAt;
  }

  const response = await fetchViaMediaProxy('/analyze-media', accessToken, {
    method: 'POST',
    body: JSON.stringify(payload),
    signal: signal,
    headers: {
      Accept: ANALYSIS_ACCEPT_HEADER,
      'Content-Type': 'application/json',
    },
  });

  return parseAnalysisResponse(response, onProgress);
}
