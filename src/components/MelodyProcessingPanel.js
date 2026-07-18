import { useState } from 'react';
import { Button, Form } from 'react-bootstrap';
import FormFieldHelp from './FormFieldHelp';
import {
  ANALYSIS_FILTER_PRESETS,
  MELODY_PROCESSING_DEFAULTS,
  NOISE_MODE_PRESETS,
  getAnalysisAudioFilters,
  getAnalysisStemKeysForSettings,
  loadMelodyNoteSettings,
  resolveMelodyVoicing,
  saveMelodyProcessingSettings,
} from '../melodyProcessingSettings';
import './MelodyProcessingPanel.css';

export const MUSIC_TYPE_OPTIONS = [
  { value: 'vocal', label: 'Song' },
  { value: 'instrumental', label: 'Instrumental' },
  { value: 'piano', label: 'Piano' },
];

export const ANALYSIS_HELP_FIELDS = [
  {
    title: 'Music type',
    body: 'Chooses how Demucs stems are mixed before analysis. Song sends vocals to lyrics and melody, and bass+other to chords. Instrumental favours other+bass. Piano prefers the piano stem (6-stem Demucs) or other for Kong piano transcription.',
  },
  {
    title: 'Create stems first',
    body: 'When enabled, Analyse Audio creates or reuses Demucs stems before transcription so lyrics, chords, and melody each get a task-specific mix without running separation twice.',
  },
  {
    title: 'Full piano voicing',
    body: 'When music type is Piano, keep simultaneous notes from the transcription instead of collapsing each chord to the highest pitch (melody line).',
  },
  {
    title: 'Advanced stem mixes',
    body: 'Per-task Demucs stem weights for lyrics, chords, and melody. Reset restores the preset for the current music type.',
  },
];

const NOTATION_HELP_FIELDS = [
  {
    title: 'Notes',
    body: 'Sensitivity preset for the transcribed melody. Sparse keeps fewer, stronger notes. Balanced is the default. Permissive keeps more quiet or short notes, but may add spurious pitches. Selecting a preset also resets the Confidence and Min note values below.',
  },
  {
    title: 'Confidence',
    body: 'Minimum pitch-tracking confidence (0–1) for a note to be kept. Higher values give a cleaner, sparser melody; lower values keep more uncertain pitches.',
  },
  {
    title: 'Min note (s)',
    body: 'Shortest note length in seconds. Brief pitch blips, slides, and ornaments shorter than this are dropped.',
  },
  {
    title: 'Quantize',
    body: 'How strongly note starts and lengths are snapped to the detected beat grid. 0 leaves timing as detected; 1 fully aligns notes to the grid.',
  },
  {
    title: 'Snap to scale',
    body: 'When enabled, low-confidence detected pitches are nudged to the nearest note in the current key signature before ABC spelling.',
  },
];

const NOISE_MODE_OPTIONS = [
  { key: 'sparse', label: 'Sparse' },
  { key: 'balanced', label: 'Balanced' },
  { key: 'permissive', label: 'Permissive' },
];

const ANALYSIS_TASKS = [
  { key: 'lyrics', label: 'Lyrics' },
  { key: 'chords', label: 'Chords' },
  { key: 'melody', label: 'Melody' },
];

function getDefaultSettings(variant) {
  if (variant === 'notation') {
    return loadMelodyNoteSettings();
  }
  return {
    musicType: MELODY_PROCESSING_DEFAULTS.musicType,
  };
}

function StemMixSliders(props) {
  const settings = props.settings;
  const stemKeys = getAnalysisStemKeysForSettings(settings);
  const onChange = props.onChange;

  function updateTaskStem(task, stem, value) {
    const current = settings.analysisAudioFilters && typeof settings.analysisAudioFilters === 'object'
      ? Object.assign({}, settings.analysisAudioFilters)
      : {};
    const taskWeights = Object.assign({}, getAnalysisAudioFilters(settings, task), current[task] || {});
    taskWeights[stem] = value;
    current[task] = taskWeights;
    onChange(Object.assign({}, settings, { analysisAudioFilters: current }));
  }

  function resetToPreset() {
    const musicType = settings.musicType || 'vocal';
    const preset = ANALYSIS_FILTER_PRESETS[musicType] || ANALYSIS_FILTER_PRESETS.vocal;
    onChange(Object.assign({}, settings, {
      analysisAudioFilters: {
        melody: Object.assign({}, preset.melody),
        chords: Object.assign({}, preset.chords),
        lyrics: Object.assign({}, preset.lyrics),
      },
    }));
  }

  return (
    <div className="melody-processing-stem-mixes">
      <div className="melody-processing-stem-mixes-header">
        <Button size="sm" variant="outline-secondary" onClick={resetToPreset}>
          Reset to preset
        </Button>
      </div>
      {ANALYSIS_TASKS.map(function(task) {
        const weights = getAnalysisAudioFilters(settings, task.key);
        return (
          <div key={task.key} className="melody-processing-stem-task">
            <div className="melody-processing-stem-task-label">{task.label}</div>
            <div className="melody-processing-stem-sliders">
              {stemKeys.map(function(stem) {
                const value = typeof weights[stem] === 'number' ? weights[stem] : 0;
                return (
                  <div key={stem} className="melody-processing-stem-slider">
                    <Form.Label>
                      {stem}
                      <span className="melody-processing-stem-value">{value.toFixed(2)}</span>
                    </Form.Label>
                    <Form.Range
                      min={0}
                      max={1}
                      step={0.05}
                      value={value}
                      onChange={function(e) {
                        updateTaskStem(task.key, stem, parseFloat(e.target.value) || 0);
                      }}
                      aria-label={task.label + ' ' + stem + ' weight'}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function MelodyProcessingPanel(props) {
  const variant = props.variant || 'analysis';
  const settings = props.settings || getDefaultSettings(variant);
  const persist = props.persist !== false;
  const helpFields = variant === 'notation' ? NOTATION_HELP_FIELDS : ANALYSIS_HELP_FIELDS;
  const helpTitle = variant === 'notation' ? 'Note detection settings' : 'Analysis settings';
  const [showAdvancedMixes, setShowAdvancedMixes] = useState(false);
  const isPiano = (settings.musicType || 'vocal') === 'piano';
  const fullVoicing = resolveMelodyVoicing(settings) === 'full';

  function update(field, value) {
    const next = Object.assign({}, settings, { [field]: value });
    if (field === 'noiseMode') {
      const preset = NOISE_MODE_PRESETS[value] || NOISE_MODE_PRESETS.balanced;
      next.confidenceThreshold = preset.confidenceThreshold;
      next.minNoteSeconds = preset.minNoteSeconds;
    }
    if (persist) {
      saveMelodyProcessingSettings(Object.assign({}, loadMelodyNoteSettings(), next));
    }
    if (typeof props.onChange === 'function') {
      props.onChange(next);
    }
  }

  function replaceSettings(next) {
    if (persist) {
      saveMelodyProcessingSettings(Object.assign({}, loadMelodyNoteSettings(), next));
    }
    if (typeof props.onChange === 'function') {
      props.onChange(next);
    }
  }

  return (
    <div className={'melody-processing-panel' + (props.showTitle === false ? ' melody-processing-panel--no-title' : '')}>
      {props.showTitle !== false && (
        <Form.Label>{props.title || (variant === 'notation' ? 'Note detection settings' : 'Analysis settings')}</Form.Label>
      )}
      {variant === 'analysis' && !props.hideAnalysisControls && (
        <div className="melody-processing-analysis-options">
          <div className="melody-processing-field melody-processing-music-type">
            <Form.Label>Music type</Form.Label>
            <Form.Select
              value={settings.musicType || 'vocal'}
              onChange={function(e) { update('musicType', e.target.value); }}
              size="sm"
              aria-label="Music type"
            >
              {MUSIC_TYPE_OPTIONS.map(function(option) {
                return (
                  <option key={option.value} value={option.value}>{option.label}</option>
                );
              })}
            </Form.Select>
          </div>
          <div className="melody-processing-meter-changes">
            <Form.Check
              type="checkbox"
              id="analysis-enable-meter-changes"
              label="Enable time signature changes"
              checked={!!settings.enableMeterChanges}
              onChange={function(e) { update('enableMeterChanges', e.target.checked); }}
              title="Include detected meter changes in chord and melody output"
            />
          </div>
          <div className="melody-processing-precreate-stems">
            <Form.Check
              type="checkbox"
              id="analysis-precreate-stems"
              label="Create stems before analyse"
              checked={settings.precreateStemsBeforeAnalyze !== false}
              onChange={function(e) { update('precreateStemsBeforeAnalyze', e.target.checked); }}
              title="Run Demucs once and reuse stems for lyrics, chords, and melody"
            />
          </div>
          <FormFieldHelp
            title={helpTitle}
            fields={helpFields}
            className="melody-processing-help-btn"
            buttonTitle="Explain analysis settings"
          />
        </div>
      )}
      {variant === 'analysis' && isPiano && (
        <div className="melody-processing-piano-voicing">
          <Form.Check
            type="checkbox"
            id="analysis-full-piano-voicing"
            label="Full piano voicing"
            checked={fullVoicing}
            onChange={function(e) { update('melodyVoicing', e.target.checked ? 'full' : 'melody-line'); }}
            title="Keep simultaneous piano notes instead of collapsing to a melody line"
          />
        </div>
      )}
      {variant === 'analysis' && (
        <div className="melody-processing-advanced-mixes">
          <button
            type="button"
            className="melody-processing-advanced-toggle"
            onClick={function() { setShowAdvancedMixes(!showAdvancedMixes); }}
            aria-expanded={showAdvancedMixes}
          >
            {showAdvancedMixes ? 'Hide' : 'Show'} advanced stem mixes
          </button>
          {showAdvancedMixes && (
            <StemMixSliders settings={settings} onChange={replaceSettings} />
          )}
        </div>
      )}
      {variant === 'notation' && (
        <>
          <div className="melody-processing-noise-buttons">
            {NOISE_MODE_OPTIONS.map(function(option) {
              return (
                <Button
                  key={option.key}
                  size="sm"
                  variant={settings.noiseMode === option.key ? 'primary' : 'outline-primary'}
                  onClick={function() { update('noiseMode', option.key); }}
                >
                  Notes: {option.label}
                </Button>
              );
            })}
          </div>
          <div className="melody-processing-settings-grid">
            <div className="melody-processing-field">
              <Form.Label>Confidence</Form.Label>
              <Form.Control
                type="number"
                min="0.05"
                max="1"
                step="0.01"
                value={settings.confidenceThreshold}
                onChange={function(e) { update('confidenceThreshold', parseFloat(e.target.value) || 0.55); }}
                title="Pitch confidence threshold"
              />
            </div>
            <div className="melody-processing-field">
              <Form.Label>Min note (s)</Form.Label>
              <Form.Control
                type="number"
                min="0.05"
                max="1"
                step="0.01"
                value={settings.minNoteSeconds}
                onChange={function(e) { update('minNoteSeconds', parseFloat(e.target.value) || 0.12); }}
                title="Minimum note length (seconds)"
              />
            </div>
            <div className="melody-processing-field">
              <Form.Label>Quantize</Form.Label>
              <div className="melody-processing-field-row">
                <Form.Control
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.quantizeStrength}
                  onChange={function(e) { update('quantizeStrength', parseFloat(e.target.value) || 0.7); }}
                  title="Beat grid quantize strength"
                />
                <FormFieldHelp
                  title={helpTitle}
                  fields={helpFields}
                  className="melody-processing-help-btn"
                  buttonTitle="Explain note detection settings"
                />
              </div>
            </div>
            <div className="melody-processing-field">
              <Form.Label>Snap to scale</Form.Label>
              <Form.Check
                type="switch"
                id="melody-snap-to-scale"
                checked={!!settings.snapToScale}
                onChange={function(e) { update('snapToScale', e.target.checked); }}
                label={settings.snapToScale ? 'On' : 'Off'}
              />
            </div>
          </div>
        </>
      )}
      {variant === 'analysis' && (settings.musicType || 'vocal') === 'vocal' && (
        <div style={{ fontSize: '0.85em', color: '#666', marginTop: '0.5em' }}>
          Song preset: melody and lyrics use the vocal stem; chords use bass+other (no vocals/drums).
        </div>
      )}
      {variant === 'analysis' && settings.musicType === 'instrumental' && (
        <div style={{ fontSize: '0.85em', color: '#666', marginTop: '0.5em' }}>
          Instrumental preset: melody favours the other stem; chords use bass+other.
        </div>
      )}
      {variant === 'analysis' && settings.musicType === 'piano' && (
        <div style={{ fontSize: '0.85em', color: '#666', marginTop: '0.5em' }}>
          Piano preset: uses 6-stem Demucs (htdemucs_6s) and Kong when available; full voicing keeps chords.
        </div>
      )}
      {variant === 'notation' && (
        <div style={{ fontSize: '0.85em', color: '#666', marginTop: '0.5em' }}>
          Changing these settings re-filters the detected melody and replaces any manual note edits.
        </div>
      )}
    </div>
  );
}
