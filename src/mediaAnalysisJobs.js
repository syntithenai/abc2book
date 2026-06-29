const jobsByTuneId = {};
const listeners = new Set();

export const EMPTY_MEDIA_ANALYSIS_JOB = {
  isAnalyzing: false,
  status: '',
  progress: 0,
  error: '',
  analysis: null,
  analysisVersion: 0,
  showSourceDialog: false,
};

export function subscribeMediaAnalysisJobs(listener) {
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

export function getMediaAnalysisJob(tuneId) {
  if (!tuneId) return EMPTY_MEDIA_ANALYSIS_JOB;
  return jobsByTuneId[tuneId] || EMPTY_MEDIA_ANALYSIS_JOB;
}

export function patchMediaAnalysisJob(tuneId, patch) {
  if (!tuneId) return;
  jobsByTuneId[tuneId] = Object.assign({}, getMediaAnalysisJob(tuneId), patch);
  notifyListeners();
}

export function getMediaAnalysisAbortController(tuneId) {
  const job = jobsByTuneId[tuneId];
  return job && job.abortController ? job.abortController : null;
}

export function setMediaAnalysisAbortController(tuneId, abortController) {
  if (!tuneId) return;
  const current = jobsByTuneId[tuneId] || Object.assign({}, EMPTY_MEDIA_ANALYSIS_JOB);
  current.abortController = abortController;
  jobsByTuneId[tuneId] = current;
}

export function clearMediaAnalysisAbortController(tuneId) {
  if (!tuneId || !jobsByTuneId[tuneId]) return;
  delete jobsByTuneId[tuneId].abortController;
}
