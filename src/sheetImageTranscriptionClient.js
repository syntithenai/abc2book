import { fetchViaMediaProxy } from './mediaProxyClient';

const SHEET_IMAGE_ACCEPT_HEADER = 'application/x-ndjson, application/json';

function normalizeSheetImageTranscription(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Resolver returned an invalid sheet image response');
  }
  if (body.error) {
    throw new Error(body.error);
  }
  const chordSheet = body.chordSheet && typeof body.chordSheet === 'object' ? body.chordSheet : {};
  const melody = body.melody && typeof body.melody === 'object' ? body.melody : null;
  const chordText = typeof chordSheet.text === 'string' ? chordSheet.text.trim() : '';
  const melodyAbc = melody && typeof melody.abc === 'string' ? melody.abc.trim() : '';
  if (!chordText && !melodyAbc) {
    throw new Error('No chords, lyrics, or melody were detected in the image');
  }
  return {
    title: typeof body.title === 'string' ? body.title.trim() : '',
    artist: typeof body.artist === 'string' ? body.artist.trim() : '',
    pageType: typeof body.pageType === 'string' ? body.pageType : 'unknown',
    chordSheet: {
      format: chordSheet.format || 'chords-over-words',
      text: chordText,
      lines: Array.isArray(chordSheet.lines) ? chordSheet.lines : [],
      sections: Array.isArray(chordSheet.sections) ? chordSheet.sections : [],
      confidence: Number(chordSheet.confidence) || 0,
      lineDetails: Array.isArray(chordSheet.lineDetails) ? chordSheet.lineDetails : [],
    },
    melody: melodyAbc ? {
      abc: melodyAbc,
      key: typeof melody.key === 'string' ? melody.key : '',
      meter: typeof melody.meter === 'string' ? melody.meter : '',
      confidence: Number(melody.confidence) || 0,
      warnings: Array.isArray(melody.warnings) ? melody.warnings : [],
      source: typeof melody.source === 'string' ? melody.source : '',
    } : null,
    warnings: Array.isArray(body.warnings) ? body.warnings : [],
    staffDetection: body.staffDetection || null,
  };
}

export function formatSheetImageEta(progressState) {
  if (!progressState || typeof progressState !== 'object') return '';
  const estimatedTotal = Number(progressState.estimatedTotalSeconds) || 0;
  const elapsed = Number(progressState.elapsedSeconds) || 0;
  const fraction = Number(progressState.progress) || 0;
  let remaining = 0;
  if (estimatedTotal > 0 && fraction > 0 && fraction < 1) {
    remaining = Math.max(0, estimatedTotal - elapsed);
  } else if (estimatedTotal > 0 && fraction <= 0) {
    remaining = estimatedTotal;
  }
  if (remaining < 8) return '';
  if (remaining < 60) return '~' + Math.round(remaining) + 's remaining';
  return '~' + Math.ceil(remaining / 60) + ' min remaining';
}

export function handleSheetImageStreamEvent(event, onProgress) {
  if (!event || typeof event !== 'object') return null;
  if (event.type === 'progress') {
    if (typeof onProgress === 'function') {
      onProgress({
        message: event.message || '',
        progress: Number(event.progress) || 0,
        stage: event.stage || '',
        estimatedTotalSeconds: Number(event.estimatedTotalSeconds) || 0,
        elapsedSeconds: Number(event.elapsedSeconds) || 0,
      });
    }
    return null;
  }
  if (event.type === 'error') {
    throw new Error(event.message || 'Sheet image transcription failed');
  }
  if (event.type === 'result') {
    return normalizeSheetImageTranscription(event.body);
  }
  return null;
}

async function parseStreamingSheetImageResponse(response, onProgress) {
  if (!response.ok) {
    let body = null;
    try {
      body = await response.json();
    } catch (e) {
      // ignore
    }
    throw new Error(body && body.error ? body.error : 'Sheet image transcription failed');
  }

  const reader = response.body && response.body.getReader ? response.body.getReader() : null;
  if (!reader) {
    return parseSheetImageResponse(response);
  }

  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (!line) continue;
      const parsed = handleSheetImageStreamEvent(JSON.parse(line), onProgress);
      if (parsed) return parsed;
    }
  }
  if (buffer.trim()) {
    const parsed = handleSheetImageStreamEvent(JSON.parse(buffer.trim()), onProgress);
    if (parsed) return parsed;
  }
  throw new Error('Sheet image transcription stream ended without a result');
}

async function parseSheetImageResponse(response) {
  let body = null;
  try {
    body = await response.json();
  } catch (e) {
    throw new Error('Resolver returned an unreadable sheet image response');
  }
  if (!response.ok) {
    throw new Error(body && body.error ? body.error : 'Sheet image transcription failed');
  }
  return normalizeSheetImageTranscription(body);
}

async function parseTranscriptionResponse(response, onProgress) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.indexOf('application/x-ndjson') >= 0) {
    return parseStreamingSheetImageResponse(response, onProgress);
  }
  return parseSheetImageResponse(response);
}

export async function transcribeSheetImageFile(options) {
  const {
    file,
    accessToken,
    signal,
    onProgress,
  } = options;

  if (!file) {
    throw new Error('No image selected');
  }

  if (typeof onProgress === 'function') {
    onProgress({
      message: 'Uploading image...',
      progress: 0.02,
      stage: 'upload',
      estimatedTotalSeconds: 90,
      elapsedSeconds: 0,
    });
  }

  const formData = new FormData();
  formData.append('file', file, file.name || 'sheet.png');
  if (Array.isArray(options.titleHints) && options.titleHints.length > 0) {
    formData.append('titleHints', JSON.stringify(options.titleHints));
  }

  const response = await fetchViaMediaProxy('/transcribe-sheet-image', accessToken, {
    method: 'POST',
    body: formData,
    signal: signal,
    headers: {
      Accept: SHEET_IMAGE_ACCEPT_HEADER,
    },
  });

  return parseTranscriptionResponse(response, onProgress);
}
