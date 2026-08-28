import localforage from 'localforage';
import { createAttachedAudioLink } from './linkRecording';
import {
  downloadAudioGenerationResult,
  pollAudioGenerationJob,
} from './musicGenerationClient';
import { formatAudioGenerationError, linkTitleForTask } from './audioGenerationPresets';
import {
  showAudioGenerationCompleteToast,
  showAudioGenerationErrorToast,
  showAudioGenerationStartedToast,
} from './audioGenerationToast';
import { isNavigatorOffline, registerOnlineResume } from './offlineNetwork';

const STORAGE_KEY = 'queue-state';
const store = localforage.createInstance({ name: 'audiogenerationqueue' });

let jobCounter = 0;
let jobs = [];
let processing = false;
let persistTimer = null;
let lastGetTuneContext = null;
let restored = false;

const listeners = new Set();
let cachedSnapshot = { jobs: [], processing: false };

function rebuildSnapshot() {
  cachedSnapshot = {
    jobs: jobs.map(publicJob),
    processing: processing,
  };
}

function notify() {
  rebuildSnapshot();
  listeners.forEach(function(listener) {
    try {
      listener();
    } catch (e) {
      console.log(e);
    }
  });
}

function makeJobId() {
  jobCounter += 1;
  return 'audio-gen-' + jobCounter;
}

function publicJob(job) {
  return {
    id: job.id,
    tuneId: job.tuneId,
    tuneName: job.tuneName,
    taskId: job.taskId,
    presetId: job.presetId,
    presetLabel: job.presetLabel,
    resolverJobId: job.resolverJobId,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    message: job.message,
    error: job.error,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  };
}

export function getState() {
  return cachedSnapshot;
}

export function subscribe(listener) {
  listeners.add(listener);
  return function unsubscribe() {
    listeners.delete(listener);
  };
}

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(function() {
    persistTimer = null;
    persistState();
  }, 200);
}

async function persistState() {
  try {
    await store.setItem(STORAGE_KEY, {
      jobCounter: jobCounter,
      jobs: jobs.map(function(job) {
        return {
          id: job.id,
          tuneId: job.tuneId,
          tuneName: job.tuneName,
          taskId: job.taskId,
          presetId: job.presetId,
          presetLabel: job.presetLabel,
          resolverJobId: job.resolverJobId,
          status: job.status === 'running' ? 'pending' : job.status,
          stage: job.stage,
          progress: job.progress,
          message: job.message,
          error: job.error,
          accessToken: job.accessToken,
          linkTitle: job.linkTitle,
          cancelled: job.cancelled,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
          tuneLinks: job.tuneLinks,
        };
      }),
    });
  } catch (e) {
    console.log(e);
  }
}

function mapSavedJob(item) {
  const hasResolver = !!item.resolverJobId;
  let status = item.status === 'running' ? 'pending' : (item.status || 'pending');
  // Preparing jobs do not survive reload — local MIDI/WAV work was lost.
  if (!hasResolver && (status === 'pending' || status === 'running')) {
    status = 'error';
  }
  return {
    id: item.id,
    tuneId: item.tuneId,
    tuneName: item.tuneName || '',
    taskId: item.taskId || 'practice_track',
    presetId: item.presetId || 'fast',
    presetLabel: item.presetLabel || 'Fast',
    resolverJobId: item.resolverJobId || null,
    status: status,
    stage: !hasResolver && status === 'error' ? 'error' : (item.stage || ''),
    progress: typeof item.progress === 'number' ? item.progress : 0,
    message: !hasResolver && status === 'error'
      ? (item.message || 'Interrupted while preparing')
      : (item.message || ''),
    error: !hasResolver && status === 'error'
      ? (item.error || 'Interrupted while preparing — start generation again')
      : (item.error || null),
    accessToken: item.accessToken || null,
    linkTitle: item.linkTitle || '',
    cancelled: !!item.cancelled,
    startedAt: item.startedAt || null,
    completedAt: item.completedAt || (!hasResolver && status === 'error' ? Date.now() : null),
    tuneLinks: Array.isArray(item.tuneLinks) ? item.tuneLinks : [],
    onTuneChange: null,
    tunebook: null,
  };
}

export async function restoreAndResume(getTuneContext) {
  if (restored) return;
  restored = true;
  try {
    const saved = await store.getItem(STORAGE_KEY);
    if (saved && Array.isArray(saved.jobs)) {
      jobCounter = saved.jobCounter || 0;
      jobs = saved.jobs.map(mapSavedJob);
    }
  } catch (e) {
    console.log(e);
  }
  if (typeof getTuneContext === 'function') {
    jobs.forEach(function(job) {
      if (job.status === 'pending' || job.status === 'running') {
        const ctx = getTuneContext(job.tuneId);
        if (ctx) {
          job.onTuneChange = ctx.onTuneChange;
          job.tunebook = ctx.tunebook;
        }
      }
    });
  }
  rebuildSnapshot();
  lastGetTuneContext = getTuneContext;
  processQueue(getTuneContext);
}

export function enqueueAudioGenerationJob(spec) {
  const hasResolver = !!(spec && spec.resolverJobId);
  const job = {
    id: makeJobId(),
    tuneId: spec.tuneId,
    tuneName: spec.tuneName || '',
    taskId: spec.taskId || 'practice_track',
    presetId: spec.presetId || 'fast',
    presetLabel: spec.presetLabel || 'Fast',
    resolverJobId: hasResolver ? spec.resolverJobId : null,
    status: 'pending',
    stage: hasResolver ? 'queued' : 'preparing',
    progress: 0,
    message: hasResolver ? 'Queued' : (spec.message || 'Preparing…'),
    error: null,
    accessToken: spec.accessToken || null,
    linkTitle: spec.linkTitle || linkTitleForTask(spec.taskId, spec.tuneName),
    cancelled: false,
    startedAt: Date.now(),
    completedAt: null,
    tuneLinks: Array.isArray(spec.tune && spec.tune.links) ? spec.tune.links.slice() : [],
    tuneSnapshot: spec.tune || null,
    onTuneChange: spec.onTuneChange || null,
    tunebook: spec.tunebook || null,
    forceRefresh: spec.forceRefresh || null,
  };
  jobs.unshift(job);
  if (spec.showToast !== false) {
    showAudioGenerationStartedToast({ tuneName: job.tuneName });
  }
  notify();
  schedulePersist();
  if (hasResolver) {
    processQueue(spec.getTuneContext);
  } else if (typeof spec.getTuneContext === 'function') {
    lastGetTuneContext = spec.getTuneContext;
  }
  return job.id;
}

/** Attach a resolver job id after local prep (MIDI/WAV) finishes and the API accepts the job. */
export function bindAudioGenerationResolverJob(localJobId, resolverJobId, options) {
  const opts = options || {};
  const job = jobs.find(function(item) { return item.id === localJobId; });
  if (!job || job.cancelled) return false;
  job.resolverJobId = resolverJobId;
  job.stage = 'queued';
  job.message = opts.message || 'Queued';
  job.status = 'pending';
  if (opts.accessToken) job.accessToken = opts.accessToken;
  notify();
  schedulePersist();
  processQueue(opts.getTuneContext || lastGetTuneContext);
  return true;
}

export function failAudioGenerationJob(localJobId, errorMessage) {
  const job = jobs.find(function(item) { return item.id === localJobId; });
  if (!job || job.cancelled) return false;
  job.status = 'error';
  job.stage = 'error';
  job.error = formatAudioGenerationError(errorMessage || 'Could not start audio generation');
  job.message = job.error;
  job.completedAt = Date.now();
  notify();
  schedulePersist();
  return true;
}

export function updateAudioGenerationJobMessage(localJobId, message, stage) {
  const job = jobs.find(function(item) { return item.id === localJobId; });
  if (!job || job.cancelled) return false;
  if (message) job.message = message;
  if (stage) job.stage = stage;
  notify();
  return true;
}

export function cancelAudioGenerationJob(id) {
  const job = jobs.find(function(item) { return item.id === id; });
  if (!job) return;
  job.cancelled = true;
  job.status = 'cancelled';
  job.message = 'Cancelled';
  job.completedAt = Date.now();
  notify();
  schedulePersist();
}

export function clearFinishedAudioGenerationJobs() {
  jobs = jobs.filter(function(job) {
    return job.status === 'pending' || job.status === 'running';
  });
  notify();
  schedulePersist();
}

export function countActiveAudioGenerationJobs() {
  return jobs.filter(function(job) {
    return job.status === 'pending' || job.status === 'running';
  }).length;
}

function refreshJobTuneContext(job, getTuneContext) {
  if (typeof getTuneContext !== 'function') return;
  const ctx = getTuneContext(job.tuneId);
  if (!ctx) return;
  if (ctx.tune) job.tuneSnapshot = ctx.tune;
  if (ctx.onTuneChange) job.onTuneChange = ctx.onTuneChange;
  if (ctx.tunebook) job.tunebook = ctx.tunebook;
  if (ctx.forceRefresh) job.forceRefresh = ctx.forceRefresh;
}

async function completeJob(job, status, getTuneContext) {
  if (job.cancelled) return;
  refreshJobTuneContext(job, getTuneContext);
  job.stage = status.stage || job.stage;
  job.progress = typeof status.progress === 'number' ? status.progress : job.progress;
  job.message = status.message || job.message;

  if (status.stage === 'error') {
    job.status = 'error';
    job.error = formatAudioGenerationError(status.message || 'Generation failed');
    job.completedAt = Date.now();
    showAudioGenerationErrorToast((job.tuneName || 'Tune') + ': ' + job.error);
    notify();
    schedulePersist();
    return;
  }

  if (status.stage !== 'complete') return;

  try {
    const blob = await downloadAudioGenerationResult(status.audioUrl, {
      token: job.accessToken,
      jobId: job.resolverJobId,
    });
    const tune = job.tuneSnapshot || { id: job.tuneId, name: job.tuneName, links: job.tuneLinks };
    const file = new File([blob], (job.tuneName || 'audio') + '.wav', { type: 'audio/wav' });
    const linkResult = await createAttachedAudioLink({
      file: file,
      title: job.linkTitle,
      tune: tune,
      token: job.accessToken,
      uploadToDrive: false,
    });
    if (linkResult && linkResult.link) {
      const existingLinks = Array.isArray(tune.links) ? tune.links : [];
      const updated = Object.assign({}, tune, {
        links: existingLinks.concat([linkResult.link]),
      });
      if (job.onTuneChange) job.onTuneChange(updated);
      if (job.tunebook && typeof job.tunebook.saveTune === 'function') {
        job.tunebook.saveTune(updated);
      }
      if (typeof job.forceRefresh === 'function') job.forceRefresh();
    }
    job.status = 'done';
    job.completedAt = Date.now();
    job.progress = 100;
    job.message = 'Complete';
    showAudioGenerationCompleteToast({ tuneName: job.tuneName, tuneId: job.tuneId });
  } catch (err) {
    job.status = 'error';
    job.error = err && err.message ? err.message : 'Could not attach generated audio';
    job.completedAt = Date.now();
    showAudioGenerationErrorToast(job.error);
  }
  notify();
  schedulePersist();
}

async function processJob(job, getTuneContext) {
  if (job.cancelled) return;
  refreshJobTuneContext(job, getTuneContext);
  job.status = 'running';
  notify();
  const started = Date.now();
  while (!job.cancelled && Date.now() - started < 600000) {
    const status = await pollAudioGenerationJob(job.resolverJobId, {
      token: job.accessToken,
    });
    job.stage = status.stage || job.stage;
    job.progress = typeof status.progress === 'number' ? status.progress : job.progress;
    job.message = status.message || job.message;
    notify();
    schedulePersist();
    if (status.stage === 'complete' || status.stage === 'error') {
      await completeJob(job, status, getTuneContext);
      return;
    }
    await new Promise(function(resolve) {
      setTimeout(resolve, 1500);
    });
  }
  if (!job.cancelled) {
    job.status = 'error';
    job.error = 'Timed out waiting for generation';
    job.completedAt = Date.now();
    showAudioGenerationErrorToast(job.error);
    notify();
    schedulePersist();
  }
}

async function processQueue(getTuneContext) {
  if (getTuneContext) lastGetTuneContext = getTuneContext;
  if (processing) return;
  if (isNavigatorOffline()) return;
  processing = true;
  try {
    while (true) {
      const next = jobs.find(function(job) {
        return job.status === 'pending' && !job.cancelled && job.resolverJobId;
      });
      if (!next) break;
      await processJob(next, getTuneContext);
    }
  } finally {
    processing = false;
  }
}

export function __resetForTests() {
  jobs = [];
  jobCounter = 0;
  processing = false;
  restored = false;
  lastGetTuneContext = null;
  cachedSnapshot = { jobs: [], processing: false };
  notify();
}

registerOnlineResume(function() {
  processQueue(lastGetTuneContext);
});

