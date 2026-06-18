import React, { useState, useEffect, useRef } from 'react';
import { Button } from 'react-bootstrap';
import { formatPitchDisplay, formatFineTuneDisplay, getPlaybackSettings } from '../pitchTempoUtils';
import './PitchTempoControlsPanel.css';

const presets = {
  standard: { label: 'Standard', tempo: 1.0, pitch: 0, fineTune: 0 },
  slowPractice: { label: 'Slow 75%', tempo: 0.75, pitch: 0, fineTune: 0 },
  slowPractice50: { label: 'Slow 50%', tempo: 0.5, pitch: 0, fineTune: 0 },
  fastReview: { label: 'Fast 125%', tempo: 1.25, pitch: 0, fineTune: 0 },
  capoSimulator: { label: 'Capo +2', tempo: 1.0, pitch: 2, fineTune: 0 },
  learnerPack: { label: 'Learner', tempo: 0.75, pitch: -2, fineTune: 0 },
};

export default function PitchTempoControlsPanel({ tune, tunebook, mediaController }) {
  const [tempo, setTempo] = useState(1.0);
  const [pitch, setPitch] = useState(0);
  const [fineTune, setFineTune] = useState(0);
  const [selectedPreset, setSelectedPreset] = useState('standard');
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

  function updateSettings(nextTempo, nextPitch, nextFineTune, presetKey) {
    setTempo(nextTempo);
    setPitch(nextPitch);
    setFineTune(nextFineTune);
    if (presetKey) setSelectedPreset(presetKey);
    else setSelectedPreset('custom');
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

  function applyPreset(key) {
    const preset = presets[key];
    updateSettings(preset.tempo, preset.pitch, preset.fineTune, key);
  }

  function handleReset() {
    applyPreset('standard');
  }

  if (!tune) return null;

  const tempoPercent = Math.round(tempo * 100);

  return (
    <div className="pitch-tempo-panel">
      <p className="scope-note">
        Saved per song. Applies to synthesized ABC playback and linked audio or video.
      </p>

      <div className="control-section">
        <h6>Tempo</h6>
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

      <div className="control-section">
        <h6>Pitch</h6>
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

      <div className="control-section">
        <h6>Fine tune</h6>
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

      <div className="control-section">
        <h6>Presets</h6>
        <div className="preset-buttons">
          {Object.entries(presets).map(([key, preset]) => (
            <Button
              key={key}
              variant={selectedPreset === key ? 'primary' : 'outline-primary'}
              size="sm"
              onClick={() => applyPreset(key)}
            >
              {preset.label}
            </Button>
          ))}
          <Button variant="outline-secondary" size="sm" onClick={handleReset}>Reset</Button>
        </div>
      </div>
    </div>
  );
}
