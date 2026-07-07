import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import CreatableSelect from 'react-select/creatable';
import { createChordRecordSession, CHORD_RECORD_STATES } from '../chordRecordSession';
import './ChordRecordControls.css';

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
  const meter = props.meter || tune.meter || '';
  const key = tune.key || 'C';
  const defaultTempo = tune.tempo > 0 ? tune.tempo : 120;

  const [palette, setPalette] = useState([]);
  const [tempo, setTempo] = useState(defaultTempo);
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
    if (sessionRef.current) {
      sessionRef.current.configure({
        meter: meter,
        tempo: tempo,
        key: key,
        chordLabels: palette,
      });
    }
  }, [meter, tempo, key, palette]);

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
  const sessionActive = state === CHORD_RECORD_STATES.READY
    || state === CHORD_RECORD_STATES.COUNT_IN
    || state === CHORD_RECORD_STATES.RECORDING
    || state === CHORD_RECORD_STATES.STOPPED;
  const canPrepare = !!meter && palette.length > 0 && !preparing
    && state !== CHORD_RECORD_STATES.PREPARING
    && state !== CHORD_RECORD_STATES.COUNT_IN
    && state !== CHORD_RECORD_STATES.RECORDING;
  const canStart = state === CHORD_RECORD_STATES.READY;
  const canStop = state === CHORD_RECORD_STATES.COUNT_IN || state === CHORD_RECORD_STATES.RECORDING;
  const canTap = state === CHORD_RECORD_STATES.RECORDING;
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

  function handleCancel() {
    if (!sessionRef.current) return;
    sessionRef.current.cancel();
    setError('');
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

  function statusMessage() {
    if (state === CHORD_RECORD_STATES.PREPARING || preparing) return 'Preparing piano fills…';
    if (state === CHORD_RECORD_STATES.READY) return 'Tap Start, then press chord buttons slightly before each beat change.';
    if (state === CHORD_RECORD_STATES.COUNT_IN) return 'Count-in…';
    if (state === CHORD_RECORD_STATES.RECORDING) return 'Tap the next chord before the beat.';
    if (state === CHORD_RECORD_STATES.STOPPED) return 'Recording stopped. Review the chord grid below, then Save.';
    return 'Select chords and prepare recording to tap chord changes against the metronome.';
  }

  return (
    <div className="chord-record-controls">
      <div className="chord-record-setup">
        <Form.Group className="chord-record-palette mb-0">
          <Form.Label className="small mb-1">Chord palette</Form.Label>
          <CreatableSelect
            isMulti
            isDisabled={state === CHORD_RECORD_STATES.COUNT_IN || state === CHORD_RECORD_STATES.RECORDING}
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
        </Form.Group>

        <Form.Group className="chord-record-tempo mb-0">
          <Form.Label className="small mb-1">Tempo</Form.Label>
          <Form.Control
            type="number"
            min="20"
            max="300"
            value={tempo}
            disabled={state === CHORD_RECORD_STATES.COUNT_IN || state === CHORD_RECORD_STATES.RECORDING}
            onChange={function(e) {
              const next = parseInt(e.target.value, 10);
              if (!isNaN(next) && next > 0) setTempo(next);
            }}
          />
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
                variant="outline-secondary"
                disabled={state === CHORD_RECORD_STATES.COUNT_IN || state === CHORD_RECORD_STATES.RECORDING}
                onClick={handleCancel}
              >
                Cancel
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {error ? <Alert variant="danger" className="py-2 px-3 mt-2 mb-0">{error}</Alert> : null}

      {showSession ? (
        <div className="chord-record-session">
          <div className="chord-record-status text-muted">{statusMessage()}</div>
          {state === CHORD_RECORD_STATES.RECORDING || state === CHORD_RECORD_STATES.COUNT_IN ? (
            <div className="chord-record-live">
              <span>Bar <strong>{snapshot && snapshot.barNumber ? snapshot.barNumber : 0}</strong></span>
              <span>Beat <strong>{snapshot && snapshot.beatInBar ? snapshot.beatInBar : 0}</strong></span>
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
