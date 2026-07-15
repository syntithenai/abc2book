import { useEffect, useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';
import { normalizeMeter } from '../barModel';
import { normalizeTempo } from '../chordsEditorSections';
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
  const [showCloseWarning, setShowCloseWarning] = useState(false);

  useEffect(function() {
    if (!show) return;
    setDraft('');
    setMeter(initialMeter);
    setTempo(initialTempo);
    setShowCloseWarning(false);
  }, [show, props.sectionKey, initialMeter, initialTempo]);

  const hasUnsavedChords = !!String(draft || '').trim();
  const canSave = hasUnsavedChords;

  function closeModal() {
    setShowCloseWarning(false);
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
    if (hasUnsavedChords) {
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
          <Modal.Title>Unsaved recorded chords</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          You have recorded chords that have not been saved. Save them to the tune, or discard them and close?
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="outline-secondary"
            onClick={function() { setShowCloseWarning(false); }}
          >
            Keep editing
          </Button>
          <Button variant="danger" onClick={closeModal}>
            Discard
          </Button>
          <Button variant="success" onClick={handleSaveFromWarning}>
            Save
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
