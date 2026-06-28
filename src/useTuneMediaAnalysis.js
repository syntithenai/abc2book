import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { analyzeMediaFromSource, formatMediaAnalysisForTune } from './mediaAnalysisClient';
import { getLinkedMediaSources } from './mediaTranscriptionSources';
import useUtils from './useUtils';

const TuneMediaAnalysisContext = createContext(null);

function useTuneMediaAnalysisState(options) {
  const {
    tune,
    tunebook,
    token,
    recordingsManager,
    pushHistory,
    onSaveTune,
  } = options;

  const utils = useUtils();
  const accessToken = token && token.access_token ? token.access_token : null;
  const [analysis, setAnalysis] = useState(null);
  const [analysisVersion, setAnalysisVersion] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showSourceDialog, setShowSourceDialog] = useState(false);
  const abortRef = useRef(null);
  const lyricsAppliedVersionRef = useRef(0);

  const mediaSources = useMemo(function() {
    return getLinkedMediaSources(tune, tunebook, recordingsManager);
  }, [tune, tunebook, recordingsManager && recordingsManager.filtered]);

  const applyLyricsImmediately = useCallback(function(lyricsText, version) {
    if (!tune || !lyricsText || !lyricsText.trim()) return;
    if (lyricsAppliedVersionRef.current === version) return;
    lyricsAppliedVersionRef.current = version;
    if (typeof pushHistory === 'function') {
      pushHistory(tune);
    }
    tune.words = lyricsText.split('\n');
    if (typeof onSaveTune === 'function') {
      onSaveTune(tune);
    }
  }, [tune, pushHistory, onSaveTune]);

  async function resolveRecordingBlob(source) {
    if (!recordingsManager || typeof recordingsManager.load !== 'function') {
      throw new Error('Recording manager is not available');
    }
    const recording = await recordingsManager.load(source.recordingId);
    if (!recording || !recording.data) {
      throw new Error('Could not load recording audio');
    }
    const blob = utils.dataURItoBlob(recording.data, recording.type || source.mimeType || 'audio/wav');
    return Object.assign({}, source, {
      blob: blob,
      fileName: recording.name || source.fileName || 'recording.wav',
      mimeType: recording.type || source.mimeType || 'audio/wav',
      label: recording.name || source.label || 'Recording',
    });
  }

  const runAnalysis = useCallback(async function(source, options) {
    const force = !!(options && options.force);
    if (!source) return null;

    if (!force && analysis && analysis.sourceId === source.id) {
      return analysis;
    }

    abortRef.current = new AbortController();
    setError('');
    setStatus('Preparing audio...');
    setIsAnalyzing(true);
    setShowSourceDialog(false);

    try {
      const preparedSource = source.kind === 'recording'
        ? await resolveRecordingBlob(source)
        : source;
      if (abortRef.current.signal.aborted) {
        return null;
      }

      setStatus(preparedSource.kind === 'recording' ? 'Uploading audio...' : 'Resolving audio...');
      const result = await analyzeMediaFromSource({
        source: preparedSource,
        accessToken: accessToken,
        signal: abortRef.current.signal,
        onProgress: setStatus,
      });

      const formatted = formatMediaAnalysisForTune(result, tune, tunebook);
      const nextVersion = analysisVersion + 1;
      const nextAnalysis = {
        sourceId: source.id,
        version: nextVersion,
        raw: result,
        formatted: formatted,
      };

      setAnalysis(nextAnalysis);
      setAnalysisVersion(nextVersion);
      applyLyricsImmediately(formatted.lyricsText, nextVersion);
      setStatus('Analysis complete');
      return nextAnalysis;
    } catch (err) {
      if (err && err.name === 'AbortError') {
        setStatus('Analysis cancelled');
      } else {
        setError(err && err.message ? err.message : 'Media analysis failed');
        setStatus('');
      }
      return null;
    } finally {
      abortRef.current = null;
      setIsAnalyzing(false);
    }
  }, [
    analysis,
    analysisVersion,
    accessToken,
    tune,
    tunebook,
    applyLyricsImmediately,
  ]);

  function requestAnalysis(options) {
    if (isAnalyzing) {
      if (abortRef.current) {
        setStatus('Cancelling...');
        abortRef.current.abort();
      }
      return;
    }

    setError('');
    if (mediaSources.length === 0) {
      setError('No linked media is available for analysis');
      return;
    }
    if (mediaSources.length === 1) {
      runAnalysis(mediaSources[0], options);
      return;
    }
    setShowSourceDialog(true);
  }

  function getStatusLabel(fallback) {
    if (isAnalyzing) {
      return status || fallback || 'Analyzing...';
    }
    return fallback || '';
  }

  return {
    analysis,
    analysisVersion,
    mediaSources,
    isAnalyzing,
    status,
    error,
    showSourceDialog,
    setShowSourceDialog,
    requestAnalysis,
    runAnalysis,
    getStatusLabel,
  };
}

export function TuneMediaAnalysisProvider({ children, ...options }) {
  const value = useTuneMediaAnalysisState(options);
  return (
    <TuneMediaAnalysisContext.Provider value={value}>
      {children}
    </TuneMediaAnalysisContext.Provider>
  );
}

export function useTuneMediaAnalysis() {
  const context = useContext(TuneMediaAnalysisContext);
  if (!context) {
    throw new Error('useTuneMediaAnalysis must be used within TuneMediaAnalysisProvider');
  }
  return context;
}

export default useTuneMediaAnalysis;
