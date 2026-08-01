import { useEffect, useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';
import { normalizeMeter } from '../barModel';
import { normalizeTempo } from '../chordsEditorSections';
import { setChordRecordNavigationBlocker } from '../chordRecordNavigationGuard';
import ChordRecordControls from './ChordRecordControls';
import './ChordSectionRecordModal.css';

/**
 * Full-screen record dialog for one section or the whole grid.
 * Save writes chords into ABC via onSave.
 */
export default function ChordSectionRecordModal(props) {
  const show = !!props.show;
  const title = props.title || 'Record chords';
  const existingChart = String(props.chart == null ? '' : props.chart);
  const initialMeter = normalizeMeter(props.meter || (props.tune && props.tune.meter) || '4/4');
  const initialTempo = normalizeTempo(
    props.tempo != null ? props.tempo : (props.tune && props.tune.tempo)
  ) || 120;
  const [draft, setDraft] = useState('');
  const [meter, setMeter] = useState(initialMeter);
  const [tempo, setTempo] = useState(initialTempo);
  const [sessionDirty, setSessionDirty] = useState(false);
  const [showCloseWarning, setShowCloseWarning] = useState(false);

  useEffect(function() {
    if (!show) return;
    setDraft('');
    setMeter(initialMeter);
    setTempo(initialTempo);
    setSessionDirty(false);
    setShowCloseWarning(false);
  }, [show, props.sectionKey, initialMeter, initialTempo]);

  const hasUnsavedChords = !!String(draft || '').trim();
  const needsDismiss = sessionDirty || hasUnsavedChords;
  const canSave = hasUnsavedChords;

  useEffect(function() {
    if (!show) {
      setChordRecordNavigationBlocker(null);
      return undefined;
    }
    setChordRecordNavigationBlocker(function() {
      return needsDismiss;
    });
    return function() {
      setChordRecordNavigationBlocker(null);
    };
  }, [show, needsDismiss]);

  function closeModal() {
    setShowCloseWarning(false);
    setSessionDirty(false);
    if (typeof props.onHide === 'function') {
      props.onHide();
    }
  }

  function handleSave() {
    if (!canSave) return;
    if (typeof props.onSave === 'function') {
      props.onSave({ chart: draft, meter: meter, tempo: tempo });
    }
  }

  function requestClose() {
    if (needsDismiss) {
      setShowCloseWarning(true);
      return;
    }
    closeModal();
  }

  function handleSaveFromWarning() {
    setShowCloseWarning(false);
    handleSave();
  }

  return (
    <>
      <Modal
        show={show}
        onHide={requestClose}
        fullscreen
        className="chord-section-record-modal"
        contentClassName="chord-section-record-modal-content"
      >
        <Modal.Header closeButton className="chord-section-record-modal-header">
          <Modal.Title>{title}</Modal.Title>
          <div className="chord-section-record-modal-header-actions">
            <Button
              variant="secondary"
              size="lg"
              onClick={requestClose}
            >
              Cancel
            </Button>
            <Button
              variant="success"
              size="lg"
              disabled={!canSave}
              onClick={handleSave}
            >
              Save
            </Button>
          </div>
        </Modal.Header>
        <Modal.Body className="chord-section-record-modal-body">
          <ChordRecordControls
            tune={props.tune}
            meter={meter}
            tempo={tempo}
            meterOptions={props.meterOptions}
            initialChords={existingChart}
            autoActivate={!!props.autoActivate}
            onSessionDirtyChange={setSessionDirty}
            onMeterTempoChange={function(next) {
              if (next && next.meter) setMeter(normalizeMeter(next.meter));
              if (next && next.tempo != null) {
                const t = normalizeTempo(next.tempo);
                if (t) setTempo(t);
              }
            }}
            onChordsCaptured={function(gridText) {
              setDraft(String(gridText || ''));
            }}
            onRecordingReset={function() {
              setDraft('');
            }}
          />
          <div className="chord-section-record-compare">
            <div className="chord-section-record-compare-pane">
              <div className="small text-muted mb-1">Existing</div>
              <pre className="chord-section-record-compare-pre">
                {existingChart.trim() ? existingChart : '(none)'}
              </pre>
            </div>
            <div className="chord-section-record-compare-pane">
              <div className="small text-muted mb-1">Recorded (editable)</div>
              <Form.Control
                as="textarea"
                rows={6}
                className="chord-section-record-compare-textarea"
                value={draft}
                placeholder="Stop recording to fill this, or type/edit chord grid text here"
                onChange={function(e) {
                  setDraft(e.target.value);
                }}
              />
            </div>
          </div>
        </Modal.Body>
      </Modal>

      <Modal
        show={show && showCloseWarning}
        onHide={function() { setShowCloseWarning(false); }}
        centered
        className="chord-section-record-close-warning"
      >
        <Modal.Header closeButton>
          <Modal.Title>Leave chord recorder?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Save your recorded chords, or cancel the recording session using the Cancel button below the chord palette, before leaving.
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="outline-secondary"
            onClick={function() { setShowCloseWarning(false); }}
          >
            Keep recording
          </Button>
          <Button variant="danger" onClick={closeModal}>
            Leave without saving
          </Button>
          <Button variant="success" onClick={handleSaveFromWarning} disabled={!canSave}>
            Save
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
