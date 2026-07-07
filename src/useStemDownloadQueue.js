import { useCallback, useEffect, useState } from 'react';
import * as stemDownloadQueue from './stemDownloadQueue';

export default function useStemDownloadQueue() {
  const [state, setState] = useState(stemDownloadQueue.getState());

  useEffect(function() {
    return stemDownloadQueue.subscribe(setState);
  }, []);

  const start = useCallback(function() {
    stemDownloadQueue.start();
  }, []);

  const getProgressForTunes = useCallback(function(tunes) {
    const tuneIds = Array.isArray(tunes)
      ? tunes.map(function(tune) { return tune && tune.id; }).filter(Boolean)
      : [];
    return stemDownloadQueue.getProgressForTuneIds(tuneIds);
  }, []);

  const enqueueTunes = useCallback(function(tunes, tunebook, preferredLinkIndexByTuneId) {
    return stemDownloadQueue.enqueueTunesStemDownloadJobs(tunes, tunebook, preferredLinkIndexByTuneId);
  }, []);

  const pendingCount = state.jobs.filter(function(job) {
    return job.status === 'pending' || job.status === 'running';
  }).length;

  return {
    state: state,
    pendingCount: pendingCount,
    start: start,
    getProgressForTunes: getProgressForTunes,
    enqueueTunes: enqueueTunes,
    cancelJob: stemDownloadQueue.cancelJob,
    cancelAll: stemDownloadQueue.cancelAllJobs,
    clearFinishedJobs: stemDownloadQueue.clearFinishedJobs,
  };
}
