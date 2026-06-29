import React, { useState, useEffect, useRef } from 'react';
import { Button } from 'react-bootstrap';
import { formatPitchDisplay, formatFineTuneDisplay, getPlaybackSettings } from '../pitchTempoUtils';
import './PitchTempoControlsPanel.css';

const tempoPresets = {
  standard: { label: 'Standard', tempo: 1.0 },
  slowPractice: { label: 'Slow 75%', tempo: 0.75 },
  slowPractice50: { label: 'Slow 50%', tempo: 0.5 },
  fastReview: { label: 'Fast 125%', tempo: 1.25 },
};

export default function PitchTempoControlsPanel({ tune, tunebook, mediaController, showPitchControls = false }) {
  const [tempo, setTempo] = useState(1.0);
  const [pitch, setPitch] = useState(0);
  const [fineTune, setFineTune] = useState(0);
  const [selectedTempoPreset, setSelectedTempoPreset] = useState('standard');
  const saveTimerRef = useRef(null);

  useEffect(function() {
    if (tune) {
      const settings = getPlaybackSettings(tune);
      setTempo(settings.tempo);
      setPitch(settings.pitch);
      setFineTune(settings.fineTune);
    }
  }, [tune ? tune.id : null, tune ? tune.playbackTempo : null, tune ? tune.playbackPitch : null, tune ? tune.playbackFineTune : null]);

  function applyLive(nextTempo, nextPitch, nextFineTune) {
    if (mediaController && mediaController.updateTunePlaybackSettings) {
      mediaController.updateTunePlaybackSettings(nextTempo, nextPitch, nextFineTune);
    }
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

  function updateSettings(nextTempo, nextPitch, nextFineTune, tempoPresetKey) {
    setTempo(nextTempo);
    setPitch(nextPitch);
    setFineTune(nextFineTune);
    if (tempoPresetKey) {
      setSelectedTempoPreset(tempoPresetKey);
    } else {
      setSelectedTempoPreset('custom');
    }
    applyLive(nextTempo, nextPitch, nextFineTune);
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
    updateSettings(preset.tempo, pitch, fineTune, key);
  }

  function resetTempo() {
    updateSettings(1.0, pitch, fineTune, 'standard');
  }

  function resetPitch() {
    updateSettings(tempo, 0, fineTune);
  }

  function resetFineTune() {
    updateSettings(tempo, pitch, 0);
  }

  if (!tune) return null;

  const tempoPercent = Math.round(tempo * 100);

  return (
    <div className="pitch-tempo-panel">
      <div className="control-section">
        <div className="control-section-header">
          <h6>Tempo</h6>
          <div className="header-inline-actions">
            {Object.entries(tempoPresets).map(function([key, preset]) {
              return (
                <Button
                  key={key}
                  variant={selectedTempoPreset === key ? 'primary' : 'outline-primary'}
                  size="sm"
                  onClick={function() { applyTempoPreset(key) }}
                >
                  {preset.label}
                </Button>
              );
            })}
            <Button variant="outline-secondary" size="sm" onClick={resetTempo}>Reset</Button>
          </div>
        </div>
        <div className="control-display">
          <span className="display-value">{tempoPercent}%</span>
          <span>100% = normal</span>
        </div>
        <input
          type="range"
          min="0.25"
          max="2.0"
          step="0.01"
          value={tempo}
          onChange={(e) => handleTempoChange(parseFloat(e.target.value))}
          className="slider tempo-slider"
        />
        <div className="slider-labels"><span>25%</span><span>50%</span><span>100%</span><span>150%</span><span>200%</span></div>
      </div>

      {showPitchControls && (
      <div className="control-section">
        <div className="control-section-header">
          <h6>Pitch</h6>
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
        <div className="slider-labels"><span>-12</span><span>0</span><span>+12</span></div>
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
