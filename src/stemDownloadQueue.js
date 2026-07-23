import { resolveActiveLinkForTune } from './mediaLinkResolve';
import { getMediaResolverHealthState } from './mediaResolverHealthStore';
import { sanitizeDownloadFilename } from './tuneDownloadActions';
import { downloadStemZipForTune } from './stemDownloadUtils';
import { areStemBulkOperationsEnabled } from './stemBulkOperations';

let jobCounter = 0;
let running = false;
let jobs = [];
const listeners = new Set();
let currentJobId = null;

function notify() {
  const snapshot = getState();
  listeners.forEach(function(listener) {
    try {
      listener(snapshot);
    } catch (e) {
      console.log(e);
    }
  });
}

function makeJobId() {
  jobCounter += 1;
  return 'stem-job-' + jobCounter;
}

function findDuplicateJob(tuneId, linkIndex, src) {
  return jobs.find(function(job) {
    return job.tuneId === tuneId
      && job.linkIndex === linkIndex
      && job.src === src
      && (job.status === 'pending' || job.status === 'running');
  });
}

function publicJob(job) {
  return {
    id: job.id,
    tuneId: job.tuneId,
    linkIndex: job.linkIndex,
    src: job.src,
    srcType: job.srcType,
    tuneName: job.tuneName,
    linkTitle: job.linkTitle,
    status: job.status,
    progress: job.progress,
    message: job.message,
    error: job.error,
    filename: job.filename,
  };
}

export function getState() {
  return {
    running: running,
    jobs: jobs.map(publicJob),
    currentJobId: currentJobId,
  };
}

export function subscribe(listener) {
  listeners.add(listener);
  return function unsubscribe() {
    listeners.delete(listener);
  };
}

export function enqueueStemDownloadJob(options) {
  if (!areStemBulkOperationsEnabled()) {
    return null;
  }
  const tuneId = options.tuneId;
  const linkIndex = options.linkIndex;
  const src = options.src;
  if (!tuneId || linkIndex === null || linkIndex === undefined || !src || !options.tune) {
    return null;
  }

  const duplicate = findDuplicateJob(tuneId, linkIndex, src);
  if (duplicate) return duplicate.id;

  const job = {
    id: makeJobId(),
    tuneId: tuneId,
    linkIndex: linkIndex,
    src: src,
    srcType: options.srcType || 'audio',
    tuneName: options.tuneName || '',
    linkTitle: options.linkTitle || '',
    tune: options.tune,
    status: 'pending',
    progress: 0,
    message: '',
    error: null,
    filename: options.filename || '',
    cancelled: false,
    accessToken: options.accessToken,
    demucsModel: options.demucsModel || '',
  };
  jobs.push(job);
  notify();
  return job.id;
}

export function enqueueTunesStemDownloadJobs(tunes, tunebook, preferredLinkIndexByTuneId) {
  if (!areStemBulkOperationsEnabled()) {
    return [];
  }
  const ids = [];
  const isYoutubeLink = tunebook && tunebook.utils ? tunebook.utils.isYoutubeLink : null;
  const accessToken = tunebook && tunebook.getGoogleAccessToken
    ? tunebook.getGoogleAccessToken()
    : (tunebook && tunebook.accessToken ? tunebook.accessToken : null);
  const demucsModel = tunebook && tunebook.demucsModel
    ? tunebook.demucsModel
    : ((getMediaResolverHealthState().status && getMediaResolverHealthState().status.demucsModel)
      || 'htdemucs');

  if (!Array.isArray(tunes)) return ids;

  tunes.forEach(function(tune) {
    if (!tune || !tune.id) return;
    const preferred = preferredLinkIndexByTuneId && preferredLinkIndexByTuneId[tune.id] !== undefined
      ? preferredLinkIndexByTuneId[tune.id]
      : null;
    const resolved = resolveActiveLinkForTune(tune, preferred, isYoutubeLink);
    if (!resolved) return;
    const safeName = sanitizeDownloadFilename(tune.name, 'tune');
    const jobId = enqueueStemDownloadJob({
      tuneId: tune.id,
      linkIndex: resolved.linkIndex,
      src: resolved.src,
      srcType: resolved.srcType,
      tuneName: tune.name || '',
      linkTitle: resolved.linkTitle,
      tune: tune,
      filename: safeName + ' stems.zip',
      accessToken: accessToken,
      demucsModel: demucsModel,
    });
    if (jobId) ids.push(jobId);
  });

  return ids;
}

export function cancelJob(id) {
  const job = jobs.find(function(item) { return item.id === id; });
  if (!job) return false;
  if (job.status === 'done' || job.status === 'cancelled') return false;
  job.cancelled = true;
  if (job.status === 'pending') {
    job.status = 'cancelled';
  }
  notify();
  return true;
}

export function cancelAllJobs() {
  let changed = false;
  jobs.forEach(function(job) {
    if (job.status !== 'pending' && job.status !== 'running') return;
    job.cancelled = true;
    if (job.status === 'pending') {
      job.status = 'cancelled';
    }
    changed = true;
  });
  if (changed) {
    notify();
  }
}

export function clearFinishedJobs() {
  jobs = jobs.filter(function(job) {
    return job.status === 'pending' || job.status === 'running';
  });
  notify();
}

export function start() {
  if (!running) {
    running = true;
    processQueue();
  }
  notify();
}

export function getProgressForTuneIds(tuneIds) {
  const ids = Array.isArray(tuneIds) ? tuneIds.filter(Boolean) : [];
  if (!ids.length) {
    return { active: false, percent: 0, message: '', error: null };
  }

  const relevant = jobs.filter(function(job) {
    return ids.indexOf(job.tuneId) !== -1;
  });
  if (!relevant.length) {
    return { active: false, percent: 0, message: '', error: null };
  }

  const activeJob = relevant.find(function(job) {
    return job.status === 'running' || job.status === 'pending';
  });
  const errorJob = relevant.find(function(job) {
    return job.status === 'error';
  });

  if (activeJob) {
    return {
      active: true,
      percent: activeJob.status === 'pending' ? 0 : (activeJob.progress || 0),
      message: activeJob.message || (activeJob.status === 'pending' ? 'Waiting...' : 'Preparing stems...'),
      error: null,
    };
  }

  return {
    active: false,
    percent: 100,
    message: '',
    error: errorJob && errorJob.error ? errorJob.error : null,
  };
}

async function runJob(job) {
  if (job.cancelled) {
    job.status = 'cancelled';
    return;
  }

  job.status = 'running';
  job.progress = 0;
  job.message = 'Starting...';
  currentJobId = job.id;
  notify();

  try {
    await downloadStemZipForTune(job.tune, {
      linkIndex: job.linkIndex,
      src: job.src,
      srcType: job.srcType,
      linkTitle: job.linkTitle,
    }, {
      accessToken: job.accessToken,
      demucsModel: job.demucsModel,
      onProgress: function(percent, message) {
        if (job.cancelled) return;
        job.progress = percent;
        job.message = message || '';
        notify();
      },
    });
    if (job.cancelled) {
      job.status = 'cancelled';
      return;
    }
    job.status = 'done';
    job.progress = 100;
    job.message = 'Downloaded';
    job.error = null;
  } catch (e) {
    if (job.cancelled) {
      job.status = 'cancelled';
    } else {
      job.status = 'error';
      job.error = e && e.message ? e.message : 'Stem download failed';
    }
  } finally {
    if (currentJobId === job.id) {
      currentJobId = null;
    }
  }
}

async function processQueue() {
  while (running) {
    const next = jobs.find(function(job) { return job.status === 'pending'; });
    if (!next) {
      running = false;
      notify();
      return;
    }
    await runJob(next);
    notify();
  }
}
