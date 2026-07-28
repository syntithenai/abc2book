import { fetchViaMediaProxy, normalizeAccessToken } from './mediaProxyClient';

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

function practiceTrackPath(suffix) {
  return '/generate-practice-track' + (suffix || '');
}

function practiceTrackAudioPath(audioUrl, jobId) {
  if (jobId) {
    return practiceTrackPath('/' + encodeURIComponent(jobId) + '/audio');
  }
  const raw = String(audioUrl || '');
  const match = raw.match(/\/generate-practice-track\/[^?#]+/);
  return match ? match[0] : raw;
}

export async function fetchPracticeTrackBackends(options) {
  const opts = options || {};
  const response = await fetchViaMediaProxy(practiceTrackPath('/backends'), opts.token, {
    headers: { Accept: 'application/json' },
  });
  return parseJsonResponse(response, 'Could not reach practice-track backends');
}

export async function startPracticeTrackGeneration(payload, melodyBlob, options) {
  const opts = options || {};
  const form = new FormData();
  form.append('timingPlan', JSON.stringify(payload));
  form.append('melody', melodyBlob, 'melody.wav');
  if (opts.chordsBlob) {
    form.append('chords', opts.chordsBlob, 'chords.wav');
  }
  if (opts.scoreBlob) {
    form.append('score', opts.scoreBlob, 'score.mid');
  }

  const response = await fetchViaMediaProxy(practiceTrackPath(), opts.token, {
    method: 'POST',
    body: form,
    headers: { Accept: 'application/json' },
  });
  return parseJsonResponse(response, 'Practice track generation failed to start');
}

export async function pollPracticeTrackJob(jobId, options) {
  const opts = options || {};
  const response = await fetchViaMediaProxy(
    practiceTrackPath('/' + encodeURIComponent(jobId)),
    opts.token,
    { headers: { Accept: 'application/json' } }
  );
  return parseJsonResponse(response, 'Could not read practice-track job status');
}

export async function waitForPracticeTrackJob(jobId, options) {
  const opts = Object.assign({ intervalMs: 1500, timeoutMs: 600000 }, options || {});
  const started = Date.now();
  while (Date.now() - started < opts.timeoutMs) {
    const status = await pollPracticeTrackJob(jobId, opts);
    if (typeof opts.onProgress === 'function') {
      opts.onProgress(status);
    }
    if (status.stage === 'complete' && (status.audioUrl || jobId)) return status;
    if (status.stage === 'error') {
      throw new Error(status.message || 'Practice track generation failed');
    }
    await new Promise(function(resolve) {
      setTimeout(resolve, opts.intervalMs);
    });
  }
  throw new Error('Practice track generation timed out');
}

export async function downloadPracticeTrackAudio(audioUrl, options) {
  const opts = options || {};
  const path = practiceTrackAudioPath(audioUrl, opts.jobId);
  const response = await fetchViaMediaProxy(path, opts.token, {
    headers: { Accept: 'audio/wav' },
  });
  if (!response.ok) {
    throw new Error('Could not download practice track audio');
  }
  return response.blob();
}

export { normalizeAccessToken };
