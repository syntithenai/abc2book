import { useEffect, useMemo, useState } from 'react';
import { Button, Modal, Tab, Tabs } from 'react-bootstrap';
import useAbcjsParser from '../useAbcjsParser';
import useTuneMediaAnalysis from '../useTuneMediaAnalysis';
import { createWizardDraft, applyAnalysisToDraft } from '../mediaImportWizardState';
import { finishMediaImportWizard } from '../mediaImportWizardFinish';
import { getLyricLines } from '../wLinesUtils';
import { buildSectionsFromLines } from '../timedLyricsModel';
import { buildAlignedLyricRows } from '../lyricsAlignmentUtils';
import { mergeLyricsFromChoices } from '../lyricsMergeUtils';
import MediaImportAnalyzeStep from './mediaImportWizard/AnalyzeStep';
import MediaImportMetadataStep from './mediaImportWizard/MetadataStep';
import MediaImportLyricsStep from './mediaImportWizard/LyricsStep';
import MediaImportChordsStep from './mediaImportWizard/ChordsStep';
import MediaImportNotationStep from './mediaImportWizard/NotationStep';
import './MediaImportWizard.css';

const STEPS = [
  { key: 'analyze', title: 'Analyze' },
  { key: 'metadata', title: 'Metadata' },
  { key: 'lyrics', title: 'Lyrics' },
  { key: 'chords', title: 'Chords' },
  { key: 'notation', title: 'Notation' },
];

export default function MediaImportWizard(props) {
  const show = !!props.show;
  const [activeStep, setActiveStep] = useState('analyze');
  const [draft, setDraft] = useState(null);
  const abcjsParser = useAbcjsParser({ tunebook: props.tunebook });
  const { analysis } = useTuneMediaAnalysis({ tune: props.tune });

  function close() {
    if (typeof props.onClose === 'function') props.onClose();
  }

  useEffect(function() {
    if (!show || !props.tune) return;
    const nextDraft = createWizardDraft(props.tune);
    nextDraft.existingWLines = getLyricLines(props.tune);
    nextDraft.baseTuneAbc = props.abc || props.tunebook.abcTools.json2abc(props.tune);
    setDraft(nextDraft);
    setActiveStep('analyze');
  }, [show, props.tune && props.tune.id]);

  useEffect(function() {
    if (!analysis || !draft || draft.analysisVersion === analysis.version) return;
    setDraft(function(current) {
      if (!current) return current;
      const next = applyAnalysisToDraft(current, analysis, props.tunebook);
      next.existingWLines = current.existingWLines || getLyricLines(props.tune);

      // Reflect the detected key/meter in the editable metadata so the Notation
      // preview and the Metadata step show what was detected (user can override).
      const detectedKey = next.timedMelody && next.timedMelody.detectedKey
        ? next.timedMelody.detectedKey
        : '';
      const detectedMeter = (next.timedMelody && next.timedMelody.detectedMeter)
        || (analysis.raw && analysis.raw.timing && analysis.raw.timing.meter)
        || '';
      next.metadata = Object.assign({}, current.metadata || {});
      if (detectedKey) next.metadata.key = detectedKey;
      if (detectedMeter && !next.metadata.meter) next.metadata.meter = detectedMeter;

      if (next.timedLyrics) {
        next.sections = buildSectionsFromLines(next.timedLyrics);
        const transcribed = next.timedLyrics.lines.map(function(line) { return line.text; });
        const rows = buildAlignedLyricRows(next.existingWLines, transcribed);
        const choices = {};
        rows.forEach(function(row) {
          choices[row.id] = row.defaultChoice;
        });
        next.lyricRows = rows;
        next.mergedLyricLines = mergeLyricsFromChoices(rows, choices);
      }
      return next;
    });
  }, [analysis]);

  const stepIndex = useMemo(function() {
    return STEPS.findIndex(function(step) { return step.key === activeStep; });
  }, [activeStep]);

  const analyzed = !!(draft && draft.analyzed) || !!(analysis && analysis.formatted);

  function goNext() {
    if (stepIndex < STEPS.length - 1) {
      setActiveStep(STEPS[stepIndex + 1].key);
    }
  }

  function goPrevious() {
    if (stepIndex > 0) {
      setActiveStep(STEPS[stepIndex - 1].key);
    }
  }

  function handleFinish() {
    if (!draft || !props.tune) return;
    finishMediaImportWizard({
      tune: props.tune,
      tunebook: props.tunebook,
      abcjsParser: abcjsParser,
      draft: draft,
    });
    if (typeof props.forceRefresh === 'function') {
      props.forceRefresh();
    }
    close();
  }

  function updateDraft(patch) {
    setDraft(function(current) {
      return Object.assign({}, current || {}, patch);
    });
  }

  return (
    <>
      <Modal
        show={show}
        onHide={close}
        fullscreen={true}
        dialogClassName="media-import-wizard-modal"
        contentClassName="media-import-wizard-content"
      >
        <Modal.Header closeButton>
          <Modal.Title>Media import wizard</Modal.Title>
        </Modal.Header>
        <Modal.Body className="media-import-wizard-body">
          <div className="media-import-wizard-nav">
            <div className="media-import-wizard-nav-actions">
              <Button size="sm" variant="secondary" disabled={stepIndex <= 0} onClick={goPrevious}>
                Previous
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={stepIndex >= STEPS.length - 1 || (activeStep === 'analyze' && !analyzed)}
                onClick={goNext}
              >
                Next
              </Button>
              <Button
                size="sm"
                variant="success"
                disabled={!analyzed}
                onClick={handleFinish}
              >
                Finish
              </Button>
            </div>
          </div>
          {draft && (
            <Tabs
              activeKey={activeStep}
              onSelect={function(key) {
                if (key === 'analyze' || analyzed) setActiveStep(key);
              }}
              className="mb-3"
            >
              {STEPS.map(function(step) {
                const disabled = step.key !== 'analyze' && !analyzed;
                return (
                  <Tab key={step.key} eventKey={step.key} title={step.title} disabled={disabled}>
                    <div className="media-import-wizard-step-body">
                      {step.key === 'analyze' && (
                        <MediaImportAnalyzeStep
                          tune={props.tune}
                          processingSettings={draft.processingSettings}
                          melodyNoteSettings={draft.melodyNoteSettings}
                          onProcessingChange={function(settings) {
                            updateDraft({ processingSettings: settings });
                          }}
                        />
                      )}
                      {step.key === 'metadata' && (
                        <MediaImportMetadataStep
                          draft={draft}
                          tunebook={props.tunebook}
                          onChange={function(metadata) { updateDraft({ metadata: metadata }); }}
                        />
                      )}
                      {step.key === 'lyrics' && (
                        <MediaImportLyricsStep
                          draft={draft}
                          onChange={function(patch) { updateDraft(patch); }}
                        />
                      )}
                      {step.key === 'chords' && (
                        <MediaImportChordsStep
                          draft={draft}
                          onChange={function(patch) { updateDraft(patch); }}
                        />
                      )}
                      {step.key === 'notation' && (
                        <MediaImportNotationStep
                          draft={draft}
                          tunebook={props.tunebook}
                          initialAbc={props.abc}
                          onChange={function(patch) { updateDraft(patch); }}
                        />
                      )}
                    </div>
                  </Tab>
                );
              })}
            </Tabs>
          )}
        </Modal.Body>
      </Modal>
    </>
  );
}
