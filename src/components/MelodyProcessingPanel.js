import { Button, Form } from 'react-bootstrap';
import FormFieldHelp from './FormFieldHelp';
import {
  MELODY_PROCESSING_DEFAULTS,
  NOISE_MODE_PRESETS,
  loadMelodyNoteSettings,
  saveMelodyProcessingSettings,
} from '../melodyProcessingSettings';
import './MelodyProcessingPanel.css';

const MUSIC_TYPE_OPTIONS = [
  { value: 'vocal', label: 'Song' },
  { value: 'instrumental', label: 'Instrumental' },
];

const ANALYSIS_HELP_FIELDS = [
  {
    title: 'Music type',
    body: 'Chooses how Demucs stems are mixed before analysis. Song sends vocals only to lyrics and melody detection, and reduces vocals and percussion for chord detection. Instrumental favours the other and bass stems for melody and reduces percussion for chords.',
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

function getDefaultSettings(variant) {
  if (variant === 'notation') {
    return loadMelodyNoteSettings();
  }
  return {
    musicType: MELODY_PROCESSING_DEFAULTS.musicType,
  };
}

export default function MelodyProcessingPanel(props) {
  const variant = props.variant || 'analysis';
  const settings = props.settings || getDefaultSettings(variant);
  const persist = props.persist !== false;
  const helpFields = variant === 'notation' ? NOTATION_HELP_FIELDS : ANALYSIS_HELP_FIELDS;
  const helpTitle = variant === 'notation' ? 'Note detection settings' : 'Analysis settings';

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

  return (
    <div className={'melody-processing-panel' + (props.showTitle === false ? ' melody-processing-panel--no-title' : '')}>
      {props.showTitle !== false && (
        <Form.Label>{props.title || (variant === 'notation' ? 'Note detection settings' : 'Analysis settings')}</Form.Label>
      )}
      {variant === 'analysis' && (
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
          <FormFieldHelp
            title={helpTitle}
            fields={helpFields}
            className="melody-processing-help-btn"
            buttonTitle="Explain analysis settings"
          />
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
          Song preset: melody and lyrics use the vocal stem only; chords reduce vocals and percussion.
        </div>
      )}
      {variant === 'analysis' && settings.musicType === 'instrumental' && (
        <div style={{ fontSize: '0.85em', color: '#666', marginTop: '0.5em' }}>
          Instrumental preset: melody favours the other stem; chords reduce percussion.
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
