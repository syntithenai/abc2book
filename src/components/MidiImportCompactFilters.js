import React from 'react';
import { Form } from 'react-bootstrap';
import DualEndedSlider from './DualEndedSlider';
import MidiImportKeySelect from './MidiImportKeySelect';
import { METER_OPTIONS, KEY_OPTIONS, midiNoteName } from '../midiImportWizardState';

export default function MidiImportCompactFilters(props) {
  const filters = props.filters || {};
  const grid = props.grid || {};
  const quantOn = filters.quantize !== false;
  const keySnapOn = !!filters.keySnap;

  function setFilters(patch) {
    if (props.onFiltersChange) props.onFiltersChange(Object.assign({}, filters, patch));
  }

  function setGrid(patch) {
    if (props.onGridChange) props.onGridChange(Object.assign({}, grid, patch));
  }

  return (
    <div className="midi-import-compact-filters px-2 py-1">
      {props.trackLabel ? (
        <div className="midi-import-filter-track-hint small text-muted mb-1">
          {props.trackColor ? (
            <span
              className="midi-import-track-swatch"
              style={{ background: props.trackColor, display: 'inline-block', marginRight: '0.35rem', verticalAlign: 'middle' }}
              aria-hidden="true"
            />
          ) : null}
          Filters for <strong>{props.trackLabel}</strong>
        </div>
      ) : null}
      <div className="midi-import-grid-row d-flex flex-wrap align-items-end gap-2 mb-1">
        <label className="midi-import-field mb-0">
          <span className="midi-import-field-label">Tempo</span>
          <Form.Control
            size="sm"
            type="number"
            className="midi-import-tempo-input"
            min={20}
            max={300}
            value={grid.tempoBpm || 120}
            onChange={function(e) { setGrid({ tempoBpm: parseFloat(e.target.value) || 120 }); }}
            aria-label="Tempo BPM"
          />
        </label>
        <label className="midi-import-field mb-0">
          <span className="midi-import-field-label">Meter</span>
          <Form.Select
            size="sm"
            className="midi-import-meter-select"
            value={grid.timeSignature || '4/4'}
            onChange={function(e) { setGrid({ timeSignature: e.target.value }); }}
            aria-label="Time signature"
          >
            {METER_OPTIONS.map(function(m) {
              return <option key={m} value={m}>{m}</option>;
            })}
          </Form.Select>
        </label>

        <div className="midi-import-option-box d-flex flex-wrap align-items-center gap-2">
          <label className="midi-import-field midi-import-field-check mb-0">
            <span className="midi-import-field-label">Ghosts</span>
            <input
              type="checkbox"
              checked={filters.showOnlyPassing !== false}
              onChange={function(e) { setFilters({ showOnlyPassing: e.target.checked }); }}
            />
          </label>
          <label className="midi-import-field midi-import-field-check mb-0">
            <span className="midi-import-field-label">Invert</span>
            <input
              type="checkbox"
              checked={!!filters.filterInvert}
              onChange={function(e) { setFilters({ filterInvert: e.target.checked }); }}
            />
          </label>
          <div className="midi-import-keysnap-group d-flex align-items-center gap-2">
            <label className="midi-import-field midi-import-field-check mb-0">
              <span className="midi-import-field-label">Key snap</span>
              <input
                type="checkbox"
                checked={keySnapOn}
                onChange={function(e) { setFilters({ keySnap: e.target.checked }); }}
              />
            </label>
            <MidiImportKeySelect
              value={props.estimatedKey || 'C'}
              options={KEY_OPTIONS}
              onChange={function(key) {
                if (props.onKeyChange) props.onKeyChange(key);
              }}
            />
          </div>
          <label className="midi-import-field midi-import-field-check mb-0">
            <span className="midi-import-field-label">Legato</span>
            <input
              type="checkbox"
              checked={!!filters.legatoTrim}
              onChange={function(e) { setFilters({ legatoTrim: e.target.checked }); }}
            />
          </label>
          <label className="midi-import-field midi-import-field-check mb-0">
            <span className="midi-import-field-label">Chords</span>
            <input
              type="checkbox"
              checked={filters.allowChords !== false}
              onChange={function(e) { setFilters({ allowChords: e.target.checked }); }}
            />
          </label>
        </div>
      </div>

      <div className="midi-import-range-row d-flex flex-wrap align-items-stretch gap-2">
        <div className="midi-import-filter-range midi-import-slider-box">
          <span className="midi-import-field-label">Pitch</span>
          <DualEndedSlider
            min={0}
            max={127}
            low={filters.pitchMin != null ? filters.pitchMin : 0}
            high={filters.pitchMax != null ? filters.pitchMax : 127}
            formatLow={midiNoteName}
            formatHigh={midiNoteName}
            onChange={function(lo, hi) {
              setFilters({ pitchEnabled: true, pitchMin: lo, pitchMax: hi });
            }}
          />
        </div>
        <div className="midi-import-filter-range midi-import-slider-box">
          <span className="midi-import-field-label">Velocity</span>
          <DualEndedSlider
            min={0}
            max={127}
            low={filters.velocityMin != null ? filters.velocityMin : 0}
            high={filters.velocityMax != null ? filters.velocityMax : 127}
            onChange={function(lo, hi) {
              setFilters({ velocityEnabled: true, velocityMin: lo, velocityMax: hi });
            }}
          />
        </div>
        <div className="midi-import-filter-range midi-import-slider-box">
          <span className="midi-import-field-label">Length</span>
          <DualEndedSlider
            min={0}
            max={64}
            low={filters.lengthMinSlots != null ? filters.lengthMinSlots : 0}
            high={filters.lengthMaxSlots != null ? filters.lengthMaxSlots : 64}
            onChange={function(lo, hi) {
              setFilters({ lengthEnabled: true, lengthMinSlots: lo, lengthMaxSlots: hi });
            }}
          />
        </div>
        <div className="midi-import-filter-range midi-import-slider-box midi-import-quant-box">
          <span className="midi-import-field-label">Quantise</span>
          <div className="midi-import-quant-box-body d-flex align-items-center gap-2 flex-grow-1">
            <label className="midi-import-field midi-import-field-check mb-0">
              <span className="visually-hidden">Enable quantise</span>
              <input
                type="checkbox"
                checked={quantOn}
                onChange={function(e) { setFilters({ quantize: e.target.checked }); }}
              />
            </label>
            <Form.Range
              className="midi-import-strength-range flex-grow-1"
              min={0}
              max={1}
              step={0.05}
              disabled={!quantOn}
              value={filters.quantStrength != null ? filters.quantStrength : 1}
              onChange={function(e) { setFilters({ quantStrength: parseFloat(e.target.value) }); }}
              aria-label="Quantise strength"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
