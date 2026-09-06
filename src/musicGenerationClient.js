import { fetchViaMediaProxy, normalizeAccessToken } from './mediaProxyClient';
import { withGpuBusyRetries } from './gpuBusyRetry';

async function parseJsonResponse(response, fallbackMessage) {
  const body = await response.json().catch(function() {
    return {};
  });
  if (!response.ok) {
    const detail = body.error || body.detail;
    if (Array.isArray(detail)) {
      throw new Error(detail.map(function(item) {
        return item && item.msg ? item.msg : JSON.stringify(item);
      }).join('; ') || fallbackMessage);
    }
    throw new Error(detail || fallbackMessage);
  }
  return body;
}

function audioGenerationPath(suffix) {
  return '/generate-audio' + (suffix || '');
}

function audioJobPath(audioUrl, jobId) {
  if (jobId) {
    return audioGenerationPath('/' + encodeURIComponent(jobId) + '/audio');
  }
  const raw = String(audioUrl || '');
  const match = raw.match(/\/generate-a(?:udio|practice-track)\/[^?#/]+/);
  if (match) {
    return match[0].replace('/generate-practice-track/', '/generate-audio/');
  }
  return raw;
}

export async function fetchAudioGenerationBackends(options) {
  const opts = options || {};
  const response = await fetchViaMediaProxy(audioGenerationPath('/backends'), opts.token, {
    headers: { Accept: 'application/json' },
  });
  return parseJsonResponse(response, 'Could not reach audio generation backends');
}

export const fetchPracticeTrackBackends = fetchAudioGenerationBackends;

export async function startAudioGeneration(formData, options) {
  const opts = options || {};
  return withGpuBusyRetries(async function() {
    const response = await fetchViaMediaProxy(audioGenerationPath(), opts.token, {
      method: 'POST',
      body: formData,
      headers: { Accept: 'application/json' },
      signal: opts.signal,
    });
    return parseJsonResponse(response, 'Audio generation failed to start');
  }, {
    signal: opts.signal,
    onWaiting: opts.onWaiting,
  });
}

export async function startPracticeTrackGeneration(payload, melodyBlob, options) {
  const opts = options || {};
  const form = new FormData();
  form.append('taskId', 'practice_track');
  form.append('presetId', opts.presetId || payload.presetId || 'fast');
  form.append('timingPlan', JSON.stringify(payload));
  form.append('melody', melodyBlob, 'melody.wav');
  if (opts.chordsBlob) {
    form.append('chords', opts.chordsBlob, 'chords.wav');
  }
  if (opts.scoreBlob) {
    form.append('score', opts.scoreBlob, 'score.mid');
  }
  return startAudioGeneration(form, opts);
}

export async function startLinkedCoverGeneration(requestPayload, options) {
  const opts = options || {};
  const form = new FormData();
  form.append('taskId', 'linked_cover');
  form.append('presetId', opts.presetId || requestPayload.presetId || 'fast');
  form.append('requestJson', JSON.stringify(requestPayload));
  if (opts.sourceBlob) {
    form.append('source', opts.sourceBlob, opts.sourceFilename || 'source.wav');
  }
  return startAudioGeneration(form, opts);
}

export async function pollAudioGenerationJob(jobId, options) {
  const opts = options || {};
  const response = await fetchViaMediaProxy(
    audioGenerationPath('/' + encodeURIComponent(jobId)),
    opts.token,
    { headers: { Accept: 'application/json' } }
  );
  return parseJsonResponse(response, 'Could not read audio generation job status');
}

export const pollPracticeTrackJob = pollAudioGenerationJob;

export async function waitForPracticeTrackJob(jobId, options) {
  const opts = Object.assign({ intervalMs: 1500, timeoutMs: 600000 }, options || {});
  const started = Date.now();
  while (Date.now() - started < opts.timeoutMs) {
    const status = await pollAudioGenerationJob(jobId, opts);
    if (typeof opts.onProgress === 'function') {
      opts.onProgress(status);
    }
    if (status.stage === 'complete' && (status.audioUrl || jobId)) return status;
    if (status.stage === 'error') {
      throw new Error(status.message || 'Audio generation failed');
    }
    await new Promise(function(resolve) {
      setTimeout(resolve, opts.intervalMs);
    });
  }
  throw new Error('Audio generation timed out');
}

export async function downloadAudioGenerationResult(audioUrl, options) {
  const opts = options || {};
  const path = audioJobPath(audioUrl, opts.jobId);
  const response = await fetchViaMediaProxy(path, opts.token, {
    headers: { Accept: 'audio/wav' },
  });
  if (!response.ok) {
    throw new Error('Could not download generated audio');
  }
  return response.blob();
}

export const downloadPracticeTrackAudio = downloadAudioGenerationResult;

export { normalizeAccessToken };
