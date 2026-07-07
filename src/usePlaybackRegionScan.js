import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { scanPlaybackRegion } from './playbackRegionScanClient';
import {
  clearPlaybackRegionScanAbortController,
  EMPTY_PLAYBACK_REGION_SCAN_JOB,
  getPlaybackRegionScanAbortController,
  getPlaybackRegionScanJob,
  patchPlaybackRegionScanJob,
  setPlaybackRegionScanAbortController,
  subscribePlaybackRegionScanJobs,
} from './playbackRegionScanJobs';

const PlaybackRegionScanDepsContext = createContext(null);

export function usePlaybackRegionScanDeps() {
  return useContext(PlaybackRegionScanDepsContext);
}

function resolveTune(deps, tuneId) {
  if (!tuneId || !deps || !deps.tunes) return null;
  return deps.tunes[tuneId] || null;
}

function formatStoredBoundary(seconds) {
  if (!seconds || seconds <= 0) return '';
  return String(seconds);
}

function applyScanResultToLinks(links, linkIndex, result) {
  if (!Array.isArray(links) || !links[linkIndex]) {
    return Array.isArray(links)
      ? links.map(function(link) { return Object.assign({}, link); })
      : [];
  }
  return links.map(function(link, idx) {
    if (idx !== linkIndex) return Object.assign({}, link);
    const next = Object.assign({}, link);
    if (result.startAt > 0) {
      next.startAt = formatStoredBoundary(result.startAt);
    }
    if (result.endAt > 0) {
      next.endAt = formatStoredBoundary(result.endAt);
    }
    return next;
  });
}

async function runPlaybackRegionScanJob(deps, tuneId, linkIndex, link, options) {
  const abortController = new AbortController();
  setPlaybackRegionScanAbortController(tuneId, linkIndex, abortController);
  patchPlaybackRegionScanJob(tuneId, linkIndex, {
    error: '',
    status: 'Preparing scan...',
    progress: 0,
    isScanning: true,
    result: null,
  });

  try {
    const sourceUrl = link && link.link ? String(link.link).trim() : '';
    if (!sourceUrl) {
      throw new Error('Link URL is missing');
    }

    const isYoutube = deps.tunebook && deps.tunebook.utils
      && typeof deps.tunebook.utils.isYoutubeLink === 'function'
      && deps.tunebook.utils.isYoutubeLink(sourceUrl);

    const result = await scanPlaybackRegion({
      sourceUrl: sourceUrl,
      sourceType: isYoutube ? 'youtube' : 'audio',
      accessToken: deps.accessToken,
      signal: abortController.signal,
      onProgress: function(message, progressValue) {
        const patch = { status: message };
        if (typeof progressValue === 'number' && !isNaN(progressValue)) {
          patch.progress = Math.max(0, Math.min(100, Math.round(progressValue * 100)));
        }
        patchPlaybackRegionScanJob(tuneId, linkIndex, patch);
      },
    });

    const liveTune = resolveTune(deps, tuneId);
    const scanOptions = options || {};
    const sourceLinks = Array.isArray(scanOptions.currentLinks)
      ? scanOptions.currentLinks
      : (liveTune && liveTune.links) || [];
    const updatedLinks = applyScanResultToLinks(sourceLinks, linkIndex, result);

    if (liveTune && typeof deps.tunebook.saveTune === 'function') {
      const updatedTune = Object.assign({}, liveTune, { links: updatedLinks });
      deps.tunebook.saveTune(updatedTune);
      if (typeof deps.forceRefresh === 'function') {
        deps.forceRefresh();
      }
      if (typeof scanOptions.onLinksUpdated === 'function') {
        scanOptions.onLinksUpdated(updatedLinks);
      }
    } else if (typeof scanOptions.onLinksUpdated === 'function') {
      scanOptions.onLinksUpdated(updatedLinks);
    }

    patchPlaybackRegionScanJob(tuneId, linkIndex, {
      result: result,
      status: 'Scan complete',
      progress: 100,
      error: '',
      isScanning: false,
    });

    return result;
  } catch (err) {
    if (err && err.name === 'AbortError') {
      patchPlaybackRegionScanJob(tuneId, linkIndex, {
        status: 'Scan cancelled',
        progress: 0,
        error: '',
        isScanning: false,
      });
    } else {
      patchPlaybackRegionScanJob(tuneId, linkIndex, {
        error: err && err.message ? err.message : 'Playback region scan failed',
        status: '',
        progress: 0,
        isScanning: false,
      });
    }
    return null;
  } finally {
    clearPlaybackRegionScanAbortController(tuneId, linkIndex);
  }
}

export function requestPlaybackRegionScan(deps, tuneId, linkIndex, link, options) {
  const opts = options || {};
  const currentJob = getPlaybackRegionScanJob(tuneId, linkIndex);
  if (currentJob && currentJob.isScanning) {
    if (opts.force) {
      const abortController = getPlaybackRegionScanAbortController(tuneId, linkIndex);
      if (abortController) {
        patchPlaybackRegionScanJob(tuneId, linkIndex, { status: 'Cancelling...' });
        abortController.abort();
      }
    } else {
      return Promise.resolve(null);
    }
  }
  return runPlaybackRegionScanJob(deps, tuneId, linkIndex, link, options);
}

function usePlaybackRegionScanState(tuneId, linkIndex) {
  const deps = useContext(PlaybackRegionScanDepsContext);
  if (!deps) {
    throw new Error('usePlaybackRegionScan must be used within PlaybackRegionScanProvider');
  }

  const job = useSyncExternalStore(
    subscribePlaybackRegionScanJobs,
    function() {
      return getPlaybackRegionScanJob(tuneId, linkIndex);
    },
    function() {
      return EMPTY_PLAYBACK_REGION_SCAN_JOB;
    }
  );

  const requestScan = useCallback(function(link, options) {
    if (!tuneId && tuneId !== 0) return;
    if (linkIndex === null || linkIndex === undefined) return;

    const currentJob = getPlaybackRegionScanJob(tuneId, linkIndex);
    if (currentJob.isScanning) {
      const abortController = getPlaybackRegionScanAbortController(tuneId, linkIndex);
      if (abortController) {
        patchPlaybackRegionScanJob(tuneId, linkIndex, { status: 'Cancelling...' });
        abortController.abort();
      }
      return;
    }

    patchPlaybackRegionScanJob(tuneId, linkIndex, { error: '' });
    runPlaybackRegionScanJob(deps, tuneId, linkIndex, link, options);
  }, [deps, tuneId, linkIndex]);

  function getStatusLabel() {
    if (job.isScanning) {
      return job.status || 'Scanning...';
    }
    return '';
  }

  return {
    isScanning: job.isScanning,
    status: job.status,
    progress: job.progress,
    error: job.error,
    result: job.result,
    requestScan: requestScan,
    getStatusLabel: getStatusLabel,
  };
}

export function usePlaybackRegionScan(tuneId, linkIndex) {
  return usePlaybackRegionScanState(tuneId, linkIndex);
}

export function PlaybackRegionScanProvider({ children, tunebook, tunes, token, forceRefresh }) {
  const accessToken = token && token.access_token ? token.access_token : null;
  const value = useMemo(function() {
    return {
      tunebook: tunebook,
      tunes: tunes,
      token: token,
      forceRefresh: forceRefresh,
      accessToken: accessToken,
    };
  }, [tunebook, tunes, token, forceRefresh, accessToken]);

  return (
    <PlaybackRegionScanDepsContext.Provider value={value}>
      {children}
    </PlaybackRegionScanDepsContext.Provider>
  );
}

export default usePlaybackRegionScan;
