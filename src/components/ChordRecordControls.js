import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import Select from 'react-select';
import CreatableSelect from 'react-select/creatable';
import { createChordRecordSession, CHORD_RECORD_STATES } from '../chordRecordSession';
import { chordsForKeyPalette, listChordPaletteKeyOptions } from '../chordPaletteFromKey';
import { filterKeySignatureOption } from '../keySignatureNormalize';
import { rhythmFromTimeSignature } from '../metronomeRhythmPresets';
import MetronomePanel from './MetronomePanel';
import './ChordRecordControls.css';

const PALETTE_KEY_OPTIONS = listChordPaletteKeyOptions();

function uniqueChordTokens(chordText) {
  const tokens = new Set();
  String(chordText || '').split(/[\s|]+/).forEach(function(tok) {
    const clean = tok.trim();
    if (clean && clean !== '.') tokens.add(clean);
  });
  return Array.from(tokens);
}

function paletteToOptions(palette) {
  return (palette || []).map(function(label) {
    return { value: label, label: label };
  });
}

export default function ChordRecordControls(props) {
  const tune = props.tune || {};
  const meter = props.meter || tune.meter || '4/4';
  const key = tune.key || 'C';
  const defaultTempo = tune.tempo > 0 ? tune.tempo : 120;
  const initialRhythm = rhythmFromTimeSignature(meter);

  const [palette, setPalette] = useState([]);
  const [paletteKey, setPaletteKey] = useState('');
  const [tempo, setTempo] = useState(defaultTempo);
  const [rhythm, setRhythm] = useState(initialRhythm);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');
  const [preparing, setPreparing] = useState(false);
  const sessionRef = useRef(null);
  const seededRef = useRef(false);

  useEffect(function() {
    sessionRef.current = createChordRecordSession({
      meter: meter,
      tempo: tempo,
      key: key,
      rhythm: initialRhythm,
      onStateChange: function(nextState, snap) {
        setSnapshot(snap);
      },
      onError: function(message) {
        setError(String(message || 'Recording error'));
      },
    });
    return function() {
      if (sessionRef.current) sessionRef.current.dispose();
      sessionRef.current = null;
    };
  }, []);

  useEffect(function() {
    const nextRhythm = rhythmFromTimeSignature(meter);
    setRhythm(nextRhythm);
  }, [meter]);

  useEffect(function() {
    if (sessionRef.current) {
      sessionRef.current.configure({
        meter: meter,
        tempo: tempo,
        key: key,
        rhythm: rhythm,
        chordLabels: palette,
      });
    }
  }, [meter, tempo, key, rhythm, palette]);

  useEffect(function() {
    if (!seededRef.current && props.initialChords) {
      const seeded = uniqueChordTokens(props.initialChords);
      if (seeded.length) {
        setPalette(seeded);
        seededRef.current = true;
      }
    }
  }, [props.initialChords]);

  const state = snapshot ? snapshot.state : CHORD_RECORD_STATES.IDLE;
  const sessionBusy = state === CHORD_RECORD_STATES.COUNT_IN
    || state === CHORD_RECORD_STATES.RECORDING;
  const sessionActive = state === CHORD_RECORD_STATES.READY
    || state === CHORD_RECORD_STATES.COUNT_IN
    || state === CHORD_RECORD_STATES.RECORDING
    || state === CHORD_RECORD_STATES.STOPPED;
  const canPrepare = !!meter && palette.length > 0 && !preparing
    && state !== CHORD_RECORD_STATES.PREPARING
    && !sessionBusy;
  const canStart = state === CHORD_RECORD_STATES.READY || state === CHORD_RECORD_STATES.STOPPED;
  const canStop = sessionBusy;
  const canClear = state === CHORD_RECORD_STATES.STOPPED || state === CHORD_RECORD_STATES.READY;
  const canTap = state === CHORD_RECORD_STATES.RECORDING
    || state === CHORD_RECORD_STATES.COUNT_IN
    || state === CHORD_RECORD_STATES.READY
    || state === CHORD_RECORD_STATES.STOPPED;
  const showSession = sessionActive || state === CHORD_RECORD_STATES.PREPARING;

  useEffect(function() {
    if (!props.autoActivate) return
    const node = document.querySelector('.chord-record-controls')
    if (node && node.scrollIntoView) node.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [props.autoActivate])

  async function handlePrepare() {
    if (!sessionRef.current) return;
    setError('');
    setPreparing(true);
    const result = await sessionRef.current.prepare();
    setPreparing(false);
    if (!result.ok) {
      setError(result.error || 'Could not prepare chord fills');
    }
  }

  async function handleStart() {
    if (!sessionRef.current) return;
    setError('');
    if (typeof props.onRecordingReset === 'function') {
      props.onRecordingReset();
    }
    const result = await sessionRef.current.startRecording();
    if (!result.ok) {
      setError(result.error || 'Could not start recording');
    }
  }

  function handleStop() {
    if (!sessionRef.current) return;
    const grid = sessionRef.current.stopRecording();
    if (grid && String(grid).trim()) {
      if (typeof props.onChordsCaptured === 'function') {
        props.onChordsCaptured(grid);
      }
    } else {
      setError('No chords were captured. Tap chord buttons during recording before stopping.');
    }
  }

  function handleClear() {
    if (!sessionRef.current) return;
    sessionRef.current.clearRecording();
    setError('');
    if (typeof props.onRecordingReset === 'function') {
      props.onRecordingReset();
    }
  }

  function handleCancel() {
    if (!sessionRef.current) return;
    sessionRef.current.cancel();
    setError('');
    if (typeof props.onRecordingReset === 'function') {
      props.onRecordingReset();
    }
  }

  function handleChordPress(label) {
    if (!sessionRef.current) return;
    sessionRef.current.onChordPress(label);
  }

  function addPaletteTokens(chordText) {
    const tokens = uniqueChordTokens(chordText);
    if (!tokens.length) return;
    setPalette(function(prev) {
      const next = prev.slice();
      tokens.forEach(function(tok) {
        if (!next.includes(tok)) next.push(tok);
      });
      return next;
    });
  }

  function handlePaletteKeyChange(nextKey) {
    setPaletteKey(nextKey);
    if (!nextKey) return;
    const generated = chordsForKeyPalette(nextKey);
    setPalette(generated);
  }

  function statusMessage() {
    if (state === CHORD_RECORD_STATES.PREPARING || preparing) return 'Preparing piano fills…';
    if (state === CHORD_RECORD_STATES.READY) {
      return 'Click chords to hear them. Tap Start, then press chord buttons slightly before each beat change.';
    }
    if (state === CHORD_RECORD_STATES.COUNT_IN) {
      return 'Count-in… tap the first chord before beat 1.';
    }
    if (state === CHORD_RECORD_STATES.RECORDING) return 'Tap the next chord before the beat.';
    if (state === CHORD_RECORD_STATES.STOPPED) {
      return 'Recording stopped. Edit the chart below, clear to try again, or Start to re-record.';
    }
    return 'Select chords and prepare recording to tap chord changes against the metronome.';
  }

  const metroTune = Object.assign({}, tune, { meter: meter, tempo: tempo });

  return (
    <div className="chord-record-controls">
      <div className="chord-record-setup">
        <Form.Group className="chord-record-palette mb-0">
          <Form.Label className="small mb-1">Chord palette</Form.Label>
          <div className="chord-record-palette-row">
            <div className="chord-record-palette-key">
              <Select
                aria-label="Key for chord palette"
                options={PALETTE_KEY_OPTIONS}
                value={paletteKey ? { value: paletteKey, label: paletteKey } : null}
                onChange={function(val) {
                  handlePaletteKeyChange(val ? val.value : '');
                }}
                isClearable={true}
                isDisabled={sessionBusy}
                filterOption={filterKeySignatureOption}
                placeholder="Key…"
                blurInputOnSelect={true}
                menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
                styles={{
                  menuPortal: function(base) { return Object.assign({}, base, { zIndex: 9999 }); },
                }}
              />
            </div>
            <div className="chord-record-palette-select">
              <CreatableSelect
                isMulti
                isDisabled={sessionBusy}
                value={paletteToOptions(palette)}
                onChange={function(vals, actionMeta) {
                  if (actionMeta && actionMeta.action === 'create-option') {
                    addPaletteTokens(actionMeta.option && actionMeta.option.value);
                    return;
                  }
                  setPalette((vals || []).map(function(item) { return item.value; }));
                }}
                placeholder="Add chords (C, Am, G7…)"
                blurInputOnSelect={true}
                createOptionPosition="first"
                allowCreateWhileLoading={true}
                allowCreate={true}
              />
            </div>
          </div>
        </Form.Group>

        <div className="chord-record-actions">
          {!showSession ? (
            <Button variant="primary" disabled={!canPrepare} onClick={handlePrepare}>
              Prepare recording
            </Button>
          ) : null}
          {showSession ? (
            <>
              <Button variant="success" disabled={!canStart} onClick={handleStart}>Start</Button>
              <Button variant="danger" disabled={!canStop} onClick={handleStop}>Stop</Button>
              <Button
                variant="outline-warning"
                disabled={!canClear || sessionBusy}
                onClick={handleClear}
              >
                Clear &amp; retry
              </Button>
              <Button
                variant="outline-secondary"
                disabled={sessionBusy}
                onClick={handleCancel}
              >
                Cancel
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="chord-record-metronome">
        <MetronomePanel
          settingsOnly={true}
          showPreview={true}
          hideTempo={false}
          hideTransport={true}
          disabled={sessionBusy}
          tune={metroTune}
          rhythm={rhythm}
          previewTempo={tempo}
          onTempoChange={setTempo}
          onRhythmChange={function(next) {
            if (next && next.rhythm) setRhythm(next.rhythm);
          }}
        />
      </div>

      {error ? <Alert variant="danger" className="py-2 px-3 mt-2 mb-0">{error}</Alert> : null}

      {showSession ? (
        <div className="chord-record-session">
          <div className="chord-record-status text-muted">{statusMessage()}</div>
          {state === CHORD_RECORD_STATES.RECORDING || state === CHORD_RECORD_STATES.COUNT_IN ? (
            <div className="chord-record-live">
              {state === CHORD_RECORD_STATES.COUNT_IN ? (
                <span>Count-in beat <strong>{snapshot && snapshot.beatInBar ? snapshot.beatInBar : 0}</strong></span>
              ) : (
                <>
                  <span>Bar <strong>{snapshot && snapshot.barNumber ? snapshot.barNumber : 0}</strong></span>
                  <span>Beat <strong>{snapshot && snapshot.beatInBar ? snapshot.beatInBar : 0}</strong></span>
                </>
              )}
              {snapshot && snapshot.lastAssignedChord ? (
                <span>Last chord <strong>{snapshot.lastAssignedChord}</strong></span>
              ) : null}
            </div>
          ) : null}
          <div className="chord-record-buttons">
            {palette.map(function(label) {
              return (
                <Button
                  key={label}
                  className="chord-record-chord-btn"
                  variant="outline-primary"
                  size="lg"
                  disabled={!canTap}
                  onClick={function() { handleChordPress(label); }}
                >
                  {label}
                </Button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
