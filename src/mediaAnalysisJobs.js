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

export function hasActiveMediaAnalysisJobs() {
  return Object.keys(jobsByTuneId).some(function(tuneId) {
    return !!jobsByTuneId[tuneId].isAnalyzing;
  });
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

export function resetMediaAnalysisJob(tuneId) {
  if (!tuneId) return;
  const controller = getMediaAnalysisAbortController(tuneId);
  if (controller) {
    controller.abort();
  }
  delete jobsByTuneId[tuneId];
  notifyListeners();
}

export function getAllMediaAnalysisJobs() {
  return Object.keys(jobsByTuneId).map(function(tuneId) {
    const job = jobsByTuneId[tuneId];
    return {
      tuneId: tuneId,
      isAnalyzing: !!job.isAnalyzing,
      status: job.status || '',
      progress: job.progress || 0,
      error: job.error || '',
    };
  });
}

export function cancelAllActiveMediaAnalysisJobs() {
  Object.keys(jobsByTuneId).forEach(function(tuneId) {
    if (jobsByTuneId[tuneId].isAnalyzing) {
      resetMediaAnalysisJob(tuneId);
    }
  });
}

export function clearInactiveMediaAnalysisJobs() {
  Object.keys(jobsByTuneId).forEach(function(tuneId) {
    if (!jobsByTuneId[tuneId].isAnalyzing) {
      delete jobsByTuneId[tuneId];
    }
  });
  notifyListeners();
}
