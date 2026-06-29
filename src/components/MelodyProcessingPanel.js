import { useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';
import { icons } from '../Icons';
import {
  MELODY_PROCESSING_DEFAULTS,
  NOISE_MODE_PRESETS,
  loadMelodyNoteSettings,
  saveMelodyProcessingSettings,
} from '../melodyProcessingSettings';

const ANALYSIS_HELP_FIELDS = [
  {
    title: 'Music type',
    body: 'Chooses how Demucs stems are mixed before analysis. Vocal music sends vocals only to lyrics and melody detection, and reduces vocals and percussion for chord detection. Instrumental favours the other and bass stems for melody and reduces percussion for chords.',
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
  const [showHelp, setShowHelp] = useState(false);
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
    <div className="melody-processing-panel" style={{ marginTop: '0.8em', marginBottom: '0.8em' }}>
      <Form.Label>{props.title || (variant === 'notation' ? 'Note detection settings' : 'Analysis settings')}</Form.Label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8em', alignItems: 'flex-end' }}>
        {variant === 'analysis' && (
          <Form.Select
            style={{ width: '11em' }}
            value={settings.musicType || 'vocal'}
            onChange={function(e) { update('musicType', e.target.value); }}
            title="Music type — controls stem mixing before analysis"
          >
            <option value="vocal">Vocal music</option>
            <option value="instrumental">Instrumental</option>
          </Form.Select>
        )}
        {variant === 'notation' && (
          <>
            <Form.Select
              style={{ width: '10em' }}
              value={settings.noiseMode}
              onChange={function(e) { update('noiseMode', e.target.value); }}
              title="Note detection sensitivity preset"
            >
              <option value="sparse">Notes: sparse</option>
              <option value="balanced">Notes: balanced</option>
              <option value="permissive">Notes: permissive</option>
            </Form.Select>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2em' }}>
              <Form.Label style={{ fontSize: '0.85em', marginBottom: 0 }}>Confidence</Form.Label>
              <Form.Control
                style={{ width: '8em' }}
                type="number"
                min="0.05"
                max="1"
                step="0.01"
                value={settings.confidenceThreshold}
                onChange={function(e) { update('confidenceThreshold', parseFloat(e.target.value) || 0.55); }}
                title="Pitch confidence threshold"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2em' }}>
              <Form.Label style={{ fontSize: '0.85em', marginBottom: 0 }}>Min note (s)</Form.Label>
              <Form.Control
                style={{ width: '8em' }}
                type="number"
                min="0.05"
                max="1"
                step="0.01"
                value={settings.minNoteSeconds}
                onChange={function(e) { update('minNoteSeconds', parseFloat(e.target.value) || 0.12); }}
                title="Minimum note length (seconds)"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2em' }}>
              <Form.Label style={{ fontSize: '0.85em', marginBottom: 0 }}>Quantize</Form.Label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35em' }}>
                <Form.Control
                  style={{ width: '8em' }}
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.quantizeStrength}
                  onChange={function(e) { update('quantizeStrength', parseFloat(e.target.value) || 0.7); }}
                  title="Beat grid quantize strength"
                />
                <Button
                  variant="link"
                  size="sm"
                  className="melody-processing-help-btn"
                  style={{ padding: '0.15em 0.35em', minWidth: 'auto', lineHeight: 1 }}
                  onClick={function() { setShowHelp(true); }}
                  title="Explain note detection settings"
                  aria-label="Explain note detection settings"
                >
                  {icons.question}
                </Button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2em' }}>
              <Form.Label style={{ fontSize: '0.85em', marginBottom: 0 }}>Snap to scale</Form.Label>
              <Form.Check
                type="switch"
                id="melody-snap-to-scale"
                checked={!!settings.snapToScale}
                onChange={function(e) { update('snapToScale', e.target.checked); }}
                label={settings.snapToScale ? 'On' : 'Off'}
              />
            </div>
          </>
        )}
        {variant === 'analysis' && (
          <Button
            variant="link"
            size="sm"
            className="melody-processing-help-btn"
            style={{ padding: '0.15em 0.35em', minWidth: 'auto', lineHeight: 1 }}
            onClick={function() { setShowHelp(true); }}
            title="Explain analysis settings"
            aria-label="Explain analysis settings"
          >
            {icons.question}
          </Button>
        )}
      </div>
      {variant === 'analysis' && settings.musicType === 'vocal' && (
        <div style={{ fontSize: '0.85em', color: '#666', marginTop: '0.5em' }}>
          Vocal preset: melody and lyrics use the vocal stem only; chords reduce vocals and percussion.
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

      <Modal show={showHelp} onHide={function() { setShowHelp(false); }} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{helpTitle}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {helpFields.map(function(field) {
            return (
              <div key={field.title} style={{ marginBottom: '1em' }}>
                <strong>{field.title}</strong>
                <div style={{ marginTop: '0.25em' }}>{field.body}</div>
              </div>
            );
          })}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={function() { setShowHelp(false); }}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
