import React, { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { Button } from 'react-bootstrap';
import { formatPitchDisplay, formatFineTuneDisplay, getTunePlaybackSettings } from '../pitchTempoUtils';
import { getGlobalTempoPercent, subscribeGlobalTempo } from '../globalTempoSettings';
import { isChromiumDesktopBrowser } from '../platformUtils';
import { requestOpenYoutubeHelperInstall } from '../youtubeHelperInstallOpen';
import './PitchTempoControlsPanel.css';

const tempoPresets = {
  standard: { label: 'Standard', tempo: 1.0 },
  slowPractice: { label: 'Slow 75%', tempo: 0.75 },
  slowPractice50: { label: 'Slow 50%', tempo: 0.5 },
  fastReview: { label: 'Fast 125%', tempo: 1.25 },
};

export default function PitchTempoControlsPanel({
  tune,
  tunebook,
  mediaController,
  showPitchControls = false,
  showYoutubeHelperInvite = false,
  disabled = false,
}) {
  const [tempo, setTempo] = useState(1.0);
  const [pitch, setPitch] = useState(0);
  const [fineTune, setFineTune] = useState(0);
  const [selectedTempoPreset, setSelectedTempoPreset] = useState('standard');
  const saveTimerRef = useRef(null);
  const liveTimerRef = useRef(null);
  const globalTempoPercent = useSyncExternalStore(subscribeGlobalTempo, getGlobalTempoPercent);
  const globalTempoActive = globalTempoPercent > 0;
  const tempoControlsDisabled = disabled || globalTempoActive;

  const tuneId = tune ? tune.id : null
  const playbackTempo = tune ? tune.playbackTempo : null
  const playbackPitch = tune ? tune.playbackPitch : null
  const playbackFineTune = tune ? tune.playbackFineTune : null
  useEffect(function() {
    if (tune) {
      const settings = getTunePlaybackSettings(tune);
      setTempo(settings.tempo);
      setPitch(settings.pitch);
      setFineTune(settings.fineTune);
    }
  }, [tune, tuneId, playbackTempo, playbackPitch, playbackFineTune]);

  useEffect(function() {
    return function() {
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  function applyLive(nextTempo, nextPitch, nextFineTune) {
    if (!mediaController) return;
    const liveOpts = { fromUserGesture: true };
    if (mediaController.applyLivePlaybackSettings) {
      mediaController.applyLivePlaybackSettings(nextTempo, nextPitch, nextFineTune, liveOpts);
    } else if (mediaController.updateTunePlaybackSettings) {
      mediaController.updateTunePlaybackSettings(nextTempo, nextPitch, nextFineTune);
    }
  }

  function scheduleLive(nextTempo, nextPitch, nextFineTune, immediate) {
    if (liveTimerRef.current) {
      clearTimeout(liveTimerRef.current);
      liveTimerRef.current = null;
    }
    if (immediate) {
      applyLive(nextTempo, nextPitch, nextFineTune);
      return;
    }
    liveTimerRef.current = setTimeout(function() {
      liveTimerRef.current = null;
      applyLive(nextTempo, nextPitch, nextFineTune);
    }, 80);
  }

  function scheduleSave(nextTempo, nextPitch, nextFineTune) {
    if (!tune || !tunebook) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(function() {
      const updated = Object.assign({}, tune, {
        playbackTempo: nextTempo,
        playbackPitch: nextPitch,
        playbackFineTune: nextFineTune,
      });
      tunebook.saveTune(updated);
    }, 400);
  }

  function updateSettings(nextTempo, nextPitch, nextFineTune, tempoPresetKey, immediateLive) {
    if (disabled) return;
    if (globalTempoActive && nextTempo !== tempo) return;
    setTempo(nextTempo);
    setPitch(nextPitch);
    setFineTune(nextFineTune);
    if (tempoPresetKey) {
      setSelectedTempoPreset(tempoPresetKey);
    } else {
      setSelectedTempoPreset('custom');
    }
    const pitchOrFineChanged = nextPitch !== pitch || nextFineTune !== fineTune;
    scheduleLive(nextTempo, nextPitch, nextFineTune, immediateLive || !pitchOrFineChanged);
    scheduleSave(nextTempo, nextPitch, nextFineTune);
  }

  function handleTempoChange(value) {
    updateSettings(value, pitch, fineTune);
  }

  function handlePitchChange(value) {
    updateSettings(tempo, value, fineTune);
  }

  function handleFineTuneChange(value) {
    updateSettings(tempo, pitch, value);
  }

  function applyTempoPreset(key) {
    const preset = tempoPresets[key];
    updateSettings(preset.tempo, pitch, fineTune, key, true);
  }

  function resetTempo() {
    updateSettings(1.0, pitch, fineTune, 'standard', true);
  }

  function resetPitch() {
    updateSettings(tempo, 0, fineTune, null, true);
  }

  function resetFineTune() {
    updateSettings(tempo, pitch, 0, null, true);
  }

  if (!tune) return null;

  const tempoPercent = Math.round((globalTempoActive ? globalTempoPercent / 100 : tempo) * 100);
  const pitchShiftPreparing = !!(mediaController && mediaController.pitchShiftPreparing);

  return (
    <div className={'pitch-tempo-panel' + (disabled ? ' pitch-tempo-panel--disabled' : '')}>
      <div className="control-section">
        <h6>Tempo</h6>
        <div className="control-display">
          <span className="display-value">{tempoPercent}%</span>
          <span>{globalTempoActive ? 'Forced from Account' : '100% = normal'}</span>
        </div>
        {globalTempoActive ? (
          <p className="pitch-tempo-global-override-note">
            Account playback tempo is set to {globalTempoPercent}%. Song tempo is ignored until that slider is Off.
          </p>
        ) : null}
        <input
          type="range"
          min="0.25"
          max="2.0"
          step="0.01"
          value={globalTempoActive ? globalTempoPercent / 100 : tempo}
          onChange={(e) => handleTempoChange(parseFloat(e.target.value))}
          className="slider tempo-slider"
          disabled={tempoControlsDisabled}
        />
        <div className="slider-labels"><span>25%</span><span>50%</span><span>100%</span><span>150%</span><span>200%</span></div>
        <div className="preset-buttons">
          {Object.entries(tempoPresets).map(function([key, preset]) {
            return (
              <Button
                key={key}
                variant={selectedTempoPreset === key ? 'primary' : 'outline-primary'}
                size="sm"
                disabled={tempoControlsDisabled}
                onClick={function() { applyTempoPreset(key) }}
              >
                {preset.label}
              </Button>
            );
          })}
          <Button
            variant="outline-secondary"
            size="sm"
            className="preset-reset-btn"
            disabled={tempoControlsDisabled}
            onClick={resetTempo}
          >
            Reset
          </Button>
        </div>
      </div>

      {showYoutubeHelperInvite && !showPitchControls && (
      <div className="control-section youtube-helper-pitch-invite">
        <h6>Pitch shift</h6>
        <p className="youtube-helper-pitch-invite-text">
          YouTube pitch shift needs downloaded audio. Install the TuneBook Helper extension in Chrome
          to enable pitch and fine-tune controls here.
        </p>
        {isChromiumDesktopBrowser() ? (
          <Button
            variant="primary"
            size="sm"
            data-testid="youtube-helper-pitch-invite-install"
            onClick={function() { requestOpenYoutubeHelperInstall() }}
          >
            Install TuneBook Helper
          </Button>
        ) : (
          <p className="youtube-helper-pitch-invite-text">
            TuneBook Helper is available on Chrome desktop.
          </p>
        )}
      </div>
      )}

      {showPitchControls && (
      <div className="control-section">
        <div className="control-section-header">
          <h6>
            Pitch
            {pitchShiftPreparing && (
              <span
                className="pitch-shift-preparing-icon"
                aria-hidden="true"
                title="Applying pitch shift…"
              >
                {tunebook.icons.waiting}
              </span>
            )}
          </h6>
          <div className="header-inline-actions">
            <Button variant="outline-secondary" size="sm" onClick={resetPitch}>Reset</Button>
          </div>
        </div>
        <div className="control-display">
          <span className="display-value">{formatPitchDisplay(pitch)}</span>
          <span>±12 semitones</span>
        </div>
        <input
          type="range"
          min="-12"
          max="12"
          step="1"
          value={pitch}
          onChange={(e) => handlePitchChange(parseInt(e.target.value, 10))}
          className="slider pitch-slider"
        />
        <div className="slider-labels">
          <span
            className="pitch-slider-label"
            role="button"
            tabIndex={0}
            onClick={function() { handlePitchChange(-12) }}
            onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlePitchChange(-12) } }}
          >-12</span>
          <span
            className="pitch-slider-label"
            role="button"
            tabIndex={0}
            onClick={function() { handlePitchChange(0) }}
            onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlePitchChange(0) } }}
          >0</span>
          <span
            className="pitch-slider-label"
            role="button"
            tabIndex={0}
            onClick={function() { handlePitchChange(12) }}
            onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlePitchChange(12) } }}
          >+12</span>
        </div>
      </div>
      )}

      {showPitchControls && (
      <div className="control-section">
        <div className="control-section-header">
          <h6>Fine tune</h6>
          <div className="header-inline-actions">
            <Button variant="outline-secondary" size="sm" onClick={resetFineTune}>Reset</Button>
          </div>
        </div>
        <div className="control-display">
          <span className="display-value">{formatFineTuneDisplay(fineTune)}</span>
          <span>±50 cents</span>
        </div>
        <input
          type="range"
          min="-50"
          max="50"
          step="1"
          value={fineTune}
          onChange={(e) => handleFineTuneChange(parseInt(e.target.value, 10))}
          className="slider fine-tune-slider"
        />
        <div className="slider-labels"><span>-50¢</span><span>0¢</span><span>+50¢</span></div>
      </div>
      )}

    </div>
  );
}
