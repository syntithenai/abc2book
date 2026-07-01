import React, { useState, useEffect, useRef } from 'react';
import { Button, ProgressBar } from 'react-bootstrap';
import {
  AUDIO_FILTER_MAX,
  AUDIO_FILTER_MIN,
  DEFAULT_AUDIO_FILTERS,
  formatAudioFilterDisplay,
  getAudioFilterKeysForDemucsModel,
  getAudioFilterSettings,
} from '../pitchTempoUtils';
import './AudioFiltersPanel.css';

const FILTER_LABELS = {
  percussion: 'Percussion',
  vocals: 'Vocals',
  bass: 'Bass',
  guitar: 'Guitar',
  piano: 'Piano',
  other: 'Other',
};

export default function AudioFiltersPanel({ tune, tunebook, mediaController, showFilters = false }) {
  const [filters, setFilters] = useState(DEFAULT_AUDIO_FILTERS);
  const [analysisError, setAnalysisError] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [analysing, setAnalysing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const saveTimerRef = useRef(null);
  const applyTimerRef = useRef(null);

  const demucsModel = mediaController && mediaController.getDemucsModel
    ? mediaController.getDemucsModel()
    : 'htdemucs';
  const filterKeys = mediaController && mediaController.getAvailableAudioFilterKeys
    ? mediaController.getAvailableAudioFilterKeys()
    : getAudioFilterKeysForDemucsModel(demucsModel);
  const stemsReady = !!(mediaController && mediaController.hasStemsForCurrentMedia && mediaController.hasStemsForCurrentMedia());
  const availableStemNames = mediaController && Array.isArray(mediaController.availableStemNames)
    ? mediaController.availableStemNames
    : [];
  const analysisActive = !!(mediaController && (
    mediaController.stemSeparationActive
    || (mediaController.stemAnalysisProgress && mediaController.stemAnalysisProgress.active)
  ));
  const analysisProgress = mediaController && mediaController.stemAnalysisProgress
    ? mediaController.stemAnalysisProgress
    : { progress: 0, message: '' };

  const playbackAudioFiltersKey = tune ? JSON.stringify(tune.playbackAudioFilters) : null
  useEffect(function() {
    if (tune) {
      setFilters(getAudioFilterSettings(tune));
    }
  }, [tune, playbackAudioFiltersKey]);

  useEffect(function() {
    return function() {
      if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  function applyLive(nextFilters) {
    if (!mediaController || !mediaController.updateTuneAudioFilterSettings) return;
    if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
    applyTimerRef.current = setTimeout(function() {
      mediaController.updateTuneAudioFilterSettings(nextFilters);
    }, 250);
  }

  function scheduleSave(nextFilters) {
    if (!tune || !tunebook) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(function() {
      const updated = Object.assign({}, tune, {
        playbackAudioFilters: nextFilters,
      });
      tunebook.saveTune(updated);
    }, 400);
  }

  function updateFilter(key, value) {
    const nextFilters = Object.assign({}, filters, { [key]: value });
    setFilters(nextFilters);
    applyLive(nextFilters);
    scheduleSave(nextFilters);
  }

  function resetFilters() {
    const nextFilters = Object.assign({}, DEFAULT_AUDIO_FILTERS);
    setFilters(nextFilters);
    applyLive(nextFilters);
    scheduleSave(nextFilters);
  }

  function muteFilter(key) {
    updateFilter(key, filters[key] <= 0 ? 1 : 0);
  }

  async function handleAnalyse(forceRefresh) {
    if (!mediaController || !mediaController.analyseMediaStems) return;
    setAnalysisError('');
    setAnalysing(true);
    try {
      await mediaController.analyseMediaStems({ forceRefresh: !!forceRefresh });
    } catch (e) {
      const message = e && e.message ? e.message : 'Stem analysis failed';
      if (e && e.name === 'AbortError') {
        setAnalysisError('Analysis cancelled.');
      } else {
        setAnalysisError(message);
      }
    } finally {
      setAnalysing(false);
    }
  }

  async function handleDownload() {
    if (!mediaController || !mediaController.saveProcessedMediaToFile) return;
    setDownloadError('');
    setDownloading(true);
    try {
      await mediaController.saveProcessedMediaToFile();
    } catch (e) {
      setDownloadError(e && e.message ? e.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  }

  function handleCancelAnalysis() {
    if (mediaController && mediaController.cancelStemAnalysis) {
      mediaController.cancelStemAnalysis();
    }
    setAnalysing(false);
  }

  if (!tune) return null;

  const slidersDisabled = showFilters && !stemsReady;
  const needsAnalysis = showFilters && !stemsReady && !analysisActive;

  return (
    <div className="audio-filters-panel">
      {!showFilters && (
        <div className="scope-note">
          Audio filters require the local media resolver for linked audio playback.
        </div>
      )}

      {showFilters && (
        <>
          <div className="audio-filters-panel-header">
            <p className="audio-filters-help">
              Adjust stem levels from Demucs separation ({demucsModel}
              {stemsReady && availableStemNames.length > 0
                ? ': ' + availableStemNames.join(', ')
                : ''}
              ). Analyse a track once, then slider changes apply live during playback.
            </p>
            <div className="audio-filters-header-actions">
              <Button
                variant="primary"
                size="sm"
                disabled={analysing && !analysisActive}
                onClick={function() {
                  if (analysisActive) {
                    handleCancelAnalysis();
                    return;
                  }
                  handleAnalyse(stemsReady);
                }}
              >
                {analysisActive ? 'Cancel' : (stemsReady ? 'ReAnalyse' : 'Analyse')}
              </Button>
              {stemsReady && (
                <Button
                  variant="outline-primary"
                  size="sm"
                  disabled={downloading || analysisActive}
                  onClick={handleDownload}
                >
                  {downloading ? 'Preparing…' : 'Download'}
                </Button>
              )}
              <Button variant="outline-secondary" size="sm" onClick={resetFilters} disabled={slidersDisabled}>
                Reset all
              </Button>
            </div>
          </div>

          {analysisActive && (
            <div className="audio-filters-status">
              <div className="audio-filters-status-row">
                <span>{analysisProgress.message || 'Analysing stems...'}</span>
                <Button variant="outline-secondary" size="sm" onClick={handleCancelAnalysis}>
                  Cancel
                </Button>
              </div>
              <ProgressBar
                now={analysisProgress.progress || 0}
                label={(analysisProgress.progress || 0) + '%'}
                striped
                animated
              />
            </div>
          )}

          {analysisError && (
            <div className="audio-filters-error">{analysisError}</div>
          )}

          {downloadError && (
            <div className="audio-filters-error">{downloadError}</div>
          )}

          {needsAnalysis && (
            <div className="scope-note">
              Click Analyse to generate stems before the filter sliders can be used.
            </div>
          )}

          {stemsReady && !analysisActive && (
            <div className="audio-filters-ready-note">
              Stems are cached locally for this tune and media link. Download applies current tempo, pitch, and stem levels.
            </div>
          )}

          {filterKeys.map(function(key) {
            const value = filters[key];
            return (
              <div className="control-section" key={key}>
                <div className="control-section-header">
                  <h6>{FILTER_LABELS[key]}</h6>
                  <div className="header-inline-actions">
                    <Button
                      variant={value <= 0 ? 'secondary' : 'outline-secondary'}
                      size="sm"
                      disabled={slidersDisabled}
                      onClick={function() { muteFilter(key); }}
                    >
                      {value <= 0 ? 'Unmute' : 'Mute'}
                    </Button>
                  </div>
                </div>
                <div className="control-display">
                  <span className="display-value">{formatAudioFilterDisplay(value)}</span>
                  <span>0% = mute, 100% = normal</span>
                </div>
                <input
                  type="range"
                  min={AUDIO_FILTER_MIN}
                  max={AUDIO_FILTER_MAX}
                  step="0.01"
                  value={value}
                  disabled={slidersDisabled}
                  onChange={function(e) { updateFilter(key, parseFloat(e.target.value)); }}
                  className="slider audio-filter-slider"
                />
                <div className="slider-labels"><span>0%</span><span>100%</span><span>200%</span></div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
