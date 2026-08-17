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
} from './mediaAnalysisClient';
import { buildTimedModelsFromAnalysis } from './mediaAnalysisModels';
import { saveTimedMediaDraft } from './timedMediaCache';
import { buildAnalysisProcessingPayload, loadMelodyProcessingSettings } from './melodyProcessingSettings';
import { getLinkedMediaSources } from './mediaTranscriptionSources';
import { prepareMediaAnalysisSource } from './prepareMediaAnalysisSource';
import { separateStemsFromSource } from './mediaStemClient';
import { getCachedStemSet, getStemSourceCacheKey } from './audioStemCache';
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
import { persistMediaAnalysisFieldSuggestions } from './mediaAnalysisSuggestions';
import { extractMelodySourceNotes } from './melodyRefilterUtils';
import useAbcjsParser from './useAbcjsParser';
import { getMediaResolverHealthState } from './mediaResolverHealthStore';

const TuneMediaAnalysisDepsContext = createContext(null);

function resolveTune(deps, tune, tuneId) {
  if (tune && tune.id) return tune;
  if (tuneId && deps && deps.tunes) return deps.tunes[tuneId] || null;
  return null;
}

function extractTuneKey(tune) {
  if (!tune) return '';
  if (tune.key) return String(tune.key).trim();
  if (Array.isArray(tune.keys) && tune.keys[0]) return String(tune.keys[0]).trim();
  return '';
}

function fallbackDemucsModel(deps) {
  if (deps && deps.tunebook && deps.tunebook.demucsModel) {
    return deps.tunebook.demucsModel;
  }
  const health = getMediaResolverHealthState().status;
  return (health && health.demucsModel) || 'htdemucs';
}

async function resolveStemCacheIdForAnalysis(deps, tune, source, preparedSource, processing, abortController) {
  const shouldPrecreate = processing
    && processing.applyAudioFilters !== false
    && processing.precreateStemsBeforeAnalyze !== false;
  if (!shouldPrecreate || !source) {
    return processing && processing.stemCacheId ? processing.stemCacheId : '';
  }

  const demucsModel = (processing && processing.demucsModel)
    || fallbackDemucsModel(deps);
  const tuneId = tune && tune.id ? tune.id : '';
  const linkIndex = source.linkIndex != null ? source.linkIndex : 0;
  const src = (preparedSource && (preparedSource.src || preparedSource.sourceUrl))
    || source.src
    || source.sourceUrl
    || '';
  if (tuneId && src) {
    try {
      const cacheKey = getStemSourceCacheKey(tuneId, linkIndex, src, demucsModel);
      const cached = await getCachedStemSet(cacheKey);
      if (cached && cached.separation && cached.separation.cacheId) {
        return cached.separation.cacheId;
      }
    } catch (e) {
      // Fall through to network separation.
    }
  }

  patchMediaAnalysisJob(tune && tune.id, {
    status: 'Creating stems for analysis...',
    progress: 5,
  });

  const stemSource = preparedSource || source;
  const separation = await separateStemsFromSource({
    source: stemSource,
    accessToken: deps.accessToken,
    signal: abortController.signal,
    demucsModel: demucsModel,
    onProgress: function(message, progressValue) {
      const patch = { status: message || 'Separating stems...' };
      if (typeof progressValue === 'number' && !isNaN(progressValue)) {
        patch.progress = Math.max(0, Math.min(40, Math.round(progressValue * 0.4)));
      }
      patchMediaAnalysisJob(tune && tune.id, patch);
    },
  });
  return separation && separation.cacheId ? separation.cacheId : '';
}

async function runMediaAnalysisJob(deps, tuneId, source, options) {
  const force = !!(options && options.force);
  const currentJob = getMediaAnalysisJob(tuneId);
  if (currentJob.isAnalyzing) {
    const existingController = getMediaAnalysisAbortController(tuneId);
    if (existingController) {
      existingController.abort();
    }
  }
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
    analyzingSourceId: source && source.id ? source.id : null,
    analyzingLinkIndex: source && source.linkIndex != null ? source.linkIndex : null,
  });

  try {
    if (abortController.signal.aborted) {
      return null;
    }

    let tune = (options && options.tune) || resolveTune(deps, null, tuneId);

    if (options && typeof options.ensurePlayRange === 'function') {
      patchMediaAnalysisJob(tuneId, {
        status: 'Detecting play range...',
        progress: 0,
      });
      try {
        const nextTune = await options.ensurePlayRange(source, tune, {
          signal: abortController.signal,
        });
        if (nextTune) tune = nextTune;
      } catch (rangeErr) {
        if (rangeErr && rangeErr.name === 'AbortError') throw rangeErr;
        // Continue analysis even if play-range detection fails.
        console.log(rangeErr);
      }
      if (abortController.signal.aborted) {
        return null;
      }
    }

    patchMediaAnalysisJob(tuneId, {
      status: 'Resolving audio...',
      progress: 0,
    });

    const youtubeGetId = deps.tunebook && deps.tunebook.utils
      && typeof deps.tunebook.utils.YouTubeGetID === 'function'
      ? deps.tunebook.utils.YouTubeGetID
      : null;
    const preparedSource = await prepareMediaAnalysisSource(source, tune, {
      accessToken: deps.accessToken,
      driveApi: deps.driveApi,
      youtubeGetId: youtubeGetId,
    });
    if (abortController.signal.aborted) {
      return null;
    }

    let processing = (options && options.processing)
      ? Object.assign({}, options.processing)
      : buildAnalysisProcessingPayload(loadMelodyProcessingSettings(), null, {
        name: tune && tune.name,
        composer: tune && tune.composer,
        key: extractTuneKey(tune),
        demucsModel: fallbackDemucsModel(deps),
      });
    if (!processing.demucsModel) {
      processing.demucsModel = fallbackDemucsModel(deps);
    }
    if (String(processing.musicType || '').toLowerCase() === 'piano') {
      processing.demucsModel = 'htdemucs_6s';
    }
    if (!processing.detectedKey && !processing.key) {
      const key = extractTuneKey(tune);
      if (key) {
        processing.detectedKey = key;
        processing.key = key;
      }
    }

    try {
      const stemCacheId = await resolveStemCacheIdForAnalysis(
        deps,
        tune,
        source,
        preparedSource,
        processing,
        abortController
      );
      if (stemCacheId) {
        processing.stemCacheId = stemCacheId;
      }
    } catch (stemErr) {
      if (stemErr && stemErr.name === 'AbortError') throw stemErr;
      // Continue without precreated stems — resolver will separate during analyze.
      console.log(stemErr);
    }
    if (abortController.signal.aborted) {
      return null;
    }

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
      processing: processing,
    });

    const formatted = formatMediaAnalysisForTune(result, tune, deps.tunebook, {
      includeMeterChanges: !!processing.enableMeterChanges,
    });
    const timedModels = buildTimedModelsFromAnalysis(result, tune, preparedSource);
    const melodySourceNotes = extractMelodySourceNotes(
      result && result.melody,
      timedModels && timedModels.timedMelody
    );
    const nextVersion = getMediaAnalysisJob(tuneId).analysisVersion + 1;
    const nextAnalysis = {
      sourceId: source.id,
      version: nextVersion,
      raw: result,
      formatted: formatted,
      timed: timedModels,
    };

    const liveTune = tune || resolveTune(deps, null, tuneId);
    const skipPersist = !!(options && options.skipPersist);
    if (liveTune && !skipPersist) {
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
      analyzingSourceId: null,
      analyzingLinkIndex: null,
      melodySourceNotes: melodySourceNotes,
      timedMelody: timedModels && timedModels.timedMelody ? timedModels.timedMelody : null,
      chordsText: formatted.chordsText || '',
    });

    if (!skipPersist && liveTune && liveTune.id) {
      try {
        const suggestionPayload = Object.assign({}, formatted);
        if (!suggestionPayload.key && timedModels && timedModels.timedMelody && timedModels.timedMelody.detectedKey) {
          suggestionPayload.key = timedModels.timedMelody.detectedKey;
        }
        persistMediaAnalysisFieldSuggestions(liveTune.id, suggestionPayload, liveTune, {
          abcTools: deps.tunebook && deps.tunebook.abcTools,
          abcjsParser: deps.abcjsParser || null,
          kinds: options && options.suggestionKinds,
          saveTune: deps.tunebook && typeof deps.tunebook.saveTune === 'function'
            ? function(tuneToSave, skipHistory, opts) {
              return deps.tunebook.saveTune(tuneToSave, skipHistory, opts);
            }
            : null,
        });
      } catch (e) {
        console.log(e);
      }
    }

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
        analyzingSourceId: null,
        analyzingLinkIndex: null,
      });
    } else {
      patchMediaAnalysisJob(tuneId, {
        error: err && err.message ? err.message : 'Media analysis failed',
        status: '',
        progress: 0,
        isAnalyzing: false,
        analyzingSourceId: null,
        analyzingLinkIndex: null,
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
    const mergedOptions = Object.assign({}, runOptions, {
      tune: resolveTune(deps, tune, tuneId),
    });
    return runMediaAnalysisJob(Object.assign({}, deps, { utils: utils }), tuneId, source, mergedOptions);
  }, [deps, tuneId, tune, utils]);

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
    analyzingSourceId: job.analyzingSourceId || null,
    analyzingLinkIndex: job.analyzingLinkIndex != null ? job.analyzingLinkIndex : null,
    showSourceDialog: job.showSourceDialog,
    setShowSourceDialog: setShowSourceDialog,
    requestAnalysis: requestAnalysis,
    runAnalysis: runAnalysis,
    getStatusLabel: getStatusLabel,
    melodySourceNotes: job.melodySourceNotes || null,
    timedMelody: job.timedMelody || null,
    chordsText: job.chordsText || '',
  };
}

export function useTuneMediaAnalysisDeps() {
  return useContext(TuneMediaAnalysisDepsContext);
}

export function TuneMediaAnalysisProvider({ children, tunebook, tunes, token, forceRefresh }) {
  const accessToken = token && token.access_token ? token.access_token : null;
  const abcjsParser = useAbcjsParser({ tunebook: tunebook });
  const value = useMemo(function() {
    return {
      tunebook: tunebook,
      tunes: tunes,
      token: token,
      forceRefresh: forceRefresh,
      accessToken: accessToken,
      abcjsParser: abcjsParser,
    };
  }, [tunebook, tunes, token, forceRefresh, accessToken, abcjsParser]);

  return (
    <TuneMediaAnalysisDepsContext.Provider value={value}>
      {children}
    </TuneMediaAnalysisDepsContext.Provider>
  );
}

export function useTuneMediaAnalysis(options) {
  return useTuneMediaAnalysisState(options || {});
}

export async function requestTuneMediaAnalysis(deps, tuneId, options) {
  if (!deps || tuneId == null) return null;
  const tune = resolveTune(deps, options && options.tune, tuneId);
  if (!tune) return null;
  const sources = getLinkedMediaSources(tune, deps.tunebook);
  if (!sources.length) return null;

  let source = sources[0];
  const preferredIndex = options && options.linkIndex;
  if (preferredIndex != null) {
    const matched = sources.find(function(entry) {
      return entry.linkIndex === preferredIndex;
    });
    if (matched) source = matched;
  }

  return runMediaAnalysisJob(deps, tuneId, source, Object.assign({}, options, { tune: tune }));
}

export default useTuneMediaAnalysis;
