import React, { useState, useEffect, useRef } from 'react';
import { Button } from 'react-bootstrap';
import {
  AUDIO_FILTER_KEYS,
  AUDIO_FILTER_MAX,
  AUDIO_FILTER_MIN,
  DEFAULT_AUDIO_FILTERS,
  formatAudioFilterDisplay,
  getAudioFilterSettings,
} from '../pitchTempoUtils';
import './AudioFiltersPanel.css';

const FILTER_LABELS = {
  percussion: 'Percussion',
  vocals: 'Vocals',
  bass: 'Bass',
  other: 'Other',
};

export default function AudioFiltersPanel({ tune, tunebook, mediaController, showFilters = false }) {
  const [filters, setFilters] = useState(DEFAULT_AUDIO_FILTERS);
  const saveTimerRef = useRef(null);
  const applyTimerRef = useRef(null);

  useEffect(function() {
    if (tune) {
      setFilters(getAudioFilterSettings(tune));
    }
  }, [tune ? tune.id : null, tune ? JSON.stringify(tune.playbackAudioFilters) : null]);

  useEffect(function() {
    return function() {
      if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Debounce live application: dragging a slider fires many onChange events, and
  // each one can trigger an expensive stem-separation/external-load. Apply only
  // once the user settles on a value so playback re-mixes from a stable state.
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
    // Toggle: muted (0) -> restore to full, otherwise mute.
    updateFilter(key, filters[key] <= 0 ? 1 : 0);
  }

  if (!tune) return null;

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
              Adjust stem levels from htdemucs separation. Changes apply during linked audio playback.
            </p>
            <Button variant="outline-secondary" size="sm" onClick={resetFilters}>
              Reset all
            </Button>
          </div>

          {AUDIO_FILTER_KEYS.map(function(key) {
            const value = filters[key];
            return (
              <div className="control-section" key={key}>
                <div className="control-section-header">
                  <h6>{FILTER_LABELS[key]}</h6>
                  <div className="header-inline-actions">
                    <Button
                      variant={value <= 0 ? 'secondary' : 'outline-secondary'}
                      size="sm"
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
