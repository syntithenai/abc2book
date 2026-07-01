const jobsByKey = {};
const listeners = new Set();

export const EMPTY_PLAYBACK_REGION_SCAN_JOB = {
  isScanning: false,
  status: '',
  progress: 0,
  error: '',
  result: null,
};

export function getPlaybackRegionScanJobKey(tuneId, linkIndex) {
  if (!tuneId && tuneId !== 0) return '';
  if (linkIndex === null || linkIndex === undefined) return '';
  return String(tuneId) + ':' + String(linkIndex);
}

export function subscribePlaybackRegionScanJobs(listener) {
  listeners.add(listener);
  return function unsubscribe() {
    listeners.delete(listener);
  };
}

function notifyListeners() {
  listeners.forEach(function(listener) {
    listener();
  });
}

export function getPlaybackRegionScanJob(tuneId, linkIndex) {
  const key = getPlaybackRegionScanJobKey(tuneId, linkIndex);
  if (!key) return EMPTY_PLAYBACK_REGION_SCAN_JOB;
  return jobsByKey[key] || EMPTY_PLAYBACK_REGION_SCAN_JOB;
}

export function hasActivePlaybackRegionScanJobs() {
  return Object.keys(jobsByKey).some(function(key) {
    return !!jobsByKey[key].isScanning;
  });
}

export function patchPlaybackRegionScanJob(tuneId, linkIndex, patch) {
  const key = getPlaybackRegionScanJobKey(tuneId, linkIndex);
  if (!key) return;
  jobsByKey[key] = Object.assign({}, getPlaybackRegionScanJob(tuneId, linkIndex), patch);
  notifyListeners();
}

export function getPlaybackRegionScanAbortController(tuneId, linkIndex) {
  const job = jobsByKey[getPlaybackRegionScanJobKey(tuneId, linkIndex)];
  return job && job.abortController ? job.abortController : null;
}

export function setPlaybackRegionScanAbortController(tuneId, linkIndex, abortController) {
  const key = getPlaybackRegionScanJobKey(tuneId, linkIndex);
  if (!key) return;
  const current = jobsByKey[key] || Object.assign({}, EMPTY_PLAYBACK_REGION_SCAN_JOB);
  current.abortController = abortController;
  jobsByKey[key] = current;
}

export function clearPlaybackRegionScanAbortController(tuneId, linkIndex) {
  const key = getPlaybackRegionScanJobKey(tuneId, linkIndex);
  if (!key || !jobsByKey[key]) return;
  delete jobsByKey[key].abortController;
}
