import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { useParams } from 'react-router-dom';
import {
  analyzeMediaFromSource,
  formatMediaAnalysisForTune,
  getDetectedTempoFromAnalysis,
  tuneHasTempo,
} from './mediaAnalysisClient';
import { buildTimedModelsFromAnalysis } from './mediaAnalysisModels';
import { saveTimedMediaDraft } from './timedMediaCache';
import { buildAnalysisProcessingPayload, loadMelodyProcessingSettings } from './melodyProcessingSettings';
import { getLinkedMediaSources } from './mediaTranscriptionSources';
import useUtils from './useUtils';
import {
  clearMediaAnalysisAbortController,
  EMPTY_MEDIA_ANALYSIS_JOB,
  getMediaAnalysisAbortController,
  getMediaAnalysisJob,
  patchMediaAnalysisJob,
  setMediaAnalysisAbortController,
  subscribeMediaAnalysisJobs,
} from './mediaAnalysisJobs';

const TuneMediaAnalysisDepsContext = createContext(null);

function resolveTune(deps, tune, tuneId) {
  if (tune && tune.id) return tune;
  if (tuneId && deps && deps.tunes) return deps.tunes[tuneId] || null;
  return null;
}

async function runMediaAnalysisJob(deps, tuneId, source, options) {
  const force = !!(options && options.force);
  const currentJob = getMediaAnalysisJob(tuneId);
  if (!force && currentJob.analysis && currentJob.analysis.sourceId === source.id) {
    patchMediaAnalysisJob(tuneId, {
      showSourceDialog: false,
      error: '',
    });
    return currentJob.analysis;
  }

  const abortController = new AbortController();
  setMediaAnalysisAbortController(tuneId, abortController);
  patchMediaAnalysisJob(tuneId, {
    error: '',
    status: 'Preparing audio...',
    progress: 0,
    isAnalyzing: true,
    showSourceDialog: false,
  });

  try {
    const preparedSource = source;
    if (abortController.signal.aborted) {
      return null;
    }

    patchMediaAnalysisJob(tuneId, {
      status: 'Resolving audio...',
      progress: 0,
    });

    const tune = resolveTune(deps, null, tuneId);
    const result = await analyzeMediaFromSource({
      source: preparedSource,
      accessToken: deps.accessToken,
      signal: abortController.signal,
      onProgress: function(message, progressValue) {
        const patch = { status: message };
        if (typeof progressValue === 'number' && !isNaN(progressValue)) {
          patch.progress = Math.max(0, Math.min(100, Math.round(progressValue)));
        }
        patchMediaAnalysisJob(tuneId, patch);
      },
      processing: (options && options.processing)
        ? options.processing
        : buildAnalysisProcessingPayload(loadMelodyProcessingSettings()),
    });

    const processing = (options && options.processing)
        ? options.processing
        : buildAnalysisProcessingPayload(loadMelodyProcessingSettings());
    const formatted = formatMediaAnalysisForTune(result, tune, deps.tunebook, {
      includeMeterChanges: !!processing.enableMeterChanges,
    });
    const timedModels = buildTimedModelsFromAnalysis(result, tune, preparedSource);
    const nextVersion = getMediaAnalysisJob(tuneId).analysisVersion + 1;
    const nextAnalysis = {
      sourceId: source.id,
      version: nextVersion,
      raw: result,
      formatted: formatted,
      timed: timedModels,
    };

    const liveTune = resolveTune(deps, null, tuneId);
    const skipPersist = !!(options && options.skipPersist);
    if (liveTune && !skipPersist) {
      if (timedModels.timedLyrics) liveTune.timedLyrics = timedModels.timedLyrics;
      if (timedModels.timedChords) liveTune.timedChords = timedModels.timedChords;
      if (timedModels.timedMelody) liveTune.timedMelody = timedModels.timedMelody;
      if (!liveTune.meter && result.timing && result.timing.meter) {
        liveTune.meter = result.timing.meter;
      }
      if (!tuneHasTempo(liveTune)) {
        const detectedTempo = getDetectedTempoFromAnalysis(result);
        if (detectedTempo > 0) {
          liveTune.tempo = detectedTempo;
        }
      }
      if (!liveTune.key && timedModels.timedMelody && timedModels.timedMelody.detectedKey) {
        liveTune.key = timedModels.timedMelody.detectedKey;
      }
      if (typeof deps.tunebook.saveTune === 'function') {
        deps.tunebook.saveTune(liveTune);
      }
      if (liveTune.id) {
        await saveTimedMediaDraft(liveTune.id, {
          chordGridText: formatted.chordsText || '',
          melodyAbcText: formatted.melodyText || '',
          transcriptionText: formatted.lyricsText || '',
        });
      }
    }

    patchMediaAnalysisJob(tuneId, {
      analysis: nextAnalysis,
      analysisVersion: nextVersion,
      status: 'Analysis complete',
      progress: 100,
      error: '',
      isAnalyzing: false,
      showSourceDialog: false,
    });

    if (typeof deps.forceRefresh === 'function' && !skipPersist) {
      deps.forceRefresh();
    }

    return nextAnalysis;
  } catch (err) {
    if (err && err.name === 'AbortError') {
      patchMediaAnalysisJob(tuneId, {
        status: 'Analysis cancelled',
        progress: 0,
        error: '',
        isAnalyzing: false,
      });
    } else {
      patchMediaAnalysisJob(tuneId, {
        error: err && err.message ? err.message : 'Media analysis failed',
        status: '',
        progress: 0,
        isAnalyzing: false,
      });
    }
    return null;
  } finally {
    clearMediaAnalysisAbortController(tuneId);
  }
}

function useTuneMediaAnalysisState(options) {
  const deps = useContext(TuneMediaAnalysisDepsContext);
  if (!deps) {
    throw new Error('useTuneMediaAnalysis must be used within TuneMediaAnalysisProvider');
  }

  const tune = options && options.tune ? options.tune : null;
  const params = useParams();
  const tuneId = (options && options.tuneId) || (tune && tune.id) || params.tuneId || null;
  const utils = useUtils();

  const job = useSyncExternalStore(
    subscribeMediaAnalysisJobs,
    function() {
      return getMediaAnalysisJob(tuneId);
    },
    function() {
      return EMPTY_MEDIA_ANALYSIS_JOB;
    }
  );

  const resolvedTune = resolveTune(deps, tune, tuneId);
  const mediaSources = useMemo(function() {
    return getLinkedMediaSources(resolvedTune, deps.tunebook);
  }, [resolvedTune, deps.tunebook]);

  const runAnalysis = useCallback(async function(source, runOptions) {
    if (!tuneId || !source) return null;
    return runMediaAnalysisJob(Object.assign({}, deps, { utils: utils }), tuneId, source, runOptions);
  }, [deps, tuneId, utils]);

  const requestAnalysis = useCallback(function(runOptions) {
    if (!tuneId) return;
    const currentJob = getMediaAnalysisJob(tuneId);
    if (currentJob.isAnalyzing) {
      const abortController = getMediaAnalysisAbortController(tuneId);
      if (abortController) {
        patchMediaAnalysisJob(tuneId, { status: 'Cancelling...' });
        abortController.abort();
      }
      return;
    }

    patchMediaAnalysisJob(tuneId, { error: '' });
    if (mediaSources.length === 0) {
      patchMediaAnalysisJob(tuneId, {
        error: 'No linked media is available for analysis',
      });
      return;
    }
    if (mediaSources.length === 1) {
      runAnalysis(mediaSources[0], runOptions);
      return;
    }
    patchMediaAnalysisJob(tuneId, { showSourceDialog: true });
  }, [tuneId, mediaSources, runAnalysis]);

  const setShowSourceDialog = useCallback(function(show) {
    if (!tuneId) return;
    patchMediaAnalysisJob(tuneId, { showSourceDialog: !!show });
  }, [tuneId]);

  function getStatusLabel(activeLabel) {
    if (job.isAnalyzing) {
      return job.status || activeLabel || 'Analyzing...';
    }
    return '';
  }

  return {
    tuneId: tuneId,
    analysis: job.analysis,
    analysisVersion: job.analysisVersion,
    mediaSources: mediaSources,
    isAnalyzing: job.isAnalyzing,
    status: job.status,
    progress: job.progress,
    error: job.error,
    showSourceDialog: job.showSourceDialog,
    setShowSourceDialog: setShowSourceDialog,
    requestAnalysis: requestAnalysis,
    runAnalysis: runAnalysis,
    getStatusLabel: getStatusLabel,
  };
}

export function TuneMediaAnalysisProvider({ children, tunebook, tunes, token, forceRefresh }) {
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
    <TuneMediaAnalysisDepsContext.Provider value={value}>
      {children}
    </TuneMediaAnalysisDepsContext.Provider>
  );
}

export function useTuneMediaAnalysis(options) {
  return useTuneMediaAnalysisState(options || {});
}

export default useTuneMediaAnalysis;
