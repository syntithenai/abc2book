import { useEffect, useMemo, useState } from 'react';
import { Modal, Tab, Tabs, Alert } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import useAbcjsParser from '../useAbcjsParser';
import useMediaResolverHealth from '../useMediaResolverHealth';
import useTuneMediaAnalysis from '../useTuneMediaAnalysis';
import {
  createWizardDraft,
  applyAnalysisToDraft,
  draftHasFinishableContent,
} from '../mediaImportWizardState';
import { getDetectedTempoFromAnalysis, tuneHasTempo } from '../mediaAnalysisClient';
import { finishMediaImportWizard } from '../mediaImportWizardFinish';
import { getLyricLines } from '../wLinesUtils';
import { buildSectionsFromLines } from '../timedLyricsModel';
import { buildAlignedLyricRows } from '../lyricsAlignmentUtils';
import { mergeLyricsFromChoices } from '../lyricsMergeUtils';
import MediaImportAnalyzeToolbar from './mediaImportWizard/AnalyzeToolbar';
import { useMediaImportWebSearch } from './mediaImportWizard/useMediaImportWebSearch';
import MediaImportMetadataStep from './mediaImportWizard/MetadataStep';
import MediaImportLyricsStep from './mediaImportWizard/LyricsStep';
import MediaImportChordsStep from './mediaImportWizard/ChordsStep';
import MediaImportNotationStep from './mediaImportWizard/NotationStep';
import './MediaImportWizard.css';
import {
  suggestTuningFromMetadata,
  tuningSuggestionTunerUrl
} from '../tuningSuggestionHeuristics';
import { TUNER_INSTRUMENT_LABELS, getPreset } from '../instrumentTuningPresets';

const STEPS = [
  { key: 'metadata', title: 'Metadata' },
  { key: 'lyrics', title: 'Lyrics' },
  { key: 'chords', title: 'Chords' },
  { key: 'notation', title: 'Notation' },
];

export default function MediaImportWizard(props) {
  const show = !!props.show;
  const [activeStep, setActiveStep] = useState('metadata');
  const [draft, setDraft] = useState(null);
  const [dismissedTuningHint, setDismissedTuningHint] = useState(false);
  const abcjsParser = useAbcjsParser({ tunebook: props.tunebook });
  const { available: resolverAvailable, features } = useMediaResolverHealth();
  const canAnalyzeMedia = resolverAvailable && features.whisper;
  const { analysis } = useTuneMediaAnalysis({ tune: props.tune });

  const metadata = draft && draft.metadata ? draft.metadata : {};
  const webSearch = useMediaImportWebSearch({
    title: metadata.name || (props.tune && props.tune.name) || '',
    artist: metadata.composer || (props.tune && props.tune.composer) || '',
    token: props.token,
    onResults: function(results) {
      setDraft(function(current) {
        if (!current) return current;
        return Object.assign({}, current, {
          chordGridText: results.chordGridText || current.chordGridText || '',
          lookupLyricLines: results.lookupLyricLines || [],
          chordsFromNotation: false,
        });
      });
    },
  });

  function close() {
    if (typeof props.onClose === 'function') props.onClose();
  }

  const propsTuneId = props.tune && props.tune.id
  useEffect(function() {
    if (!show || !props.tune) return;
    const existingWLines = getLyricLines(props.tune);
    const nextDraft = createWizardDraft(props.tune);
    nextDraft.existingWLines = existingWLines;
    nextDraft.lyricLines = existingWLines.slice();
    nextDraft.mergedLyricLines = existingWLines.slice();
    nextDraft.baseTuneAbc = props.abc || props.tunebook.abcTools.json2abc(props.tune);
    setDraft(nextDraft);
    setActiveStep('metadata');
    setDismissedTuningHint(false);
  }, [show, props.tune, propsTuneId, props.abc, props.tunebook.abcTools]);

  useEffect(function() {
    if (!analysis || !draft || draft.analysisVersion === analysis.version) return;
    setDraft(function(current) {
      if (!current) return current;
      const next = applyAnalysisToDraft(current, analysis, props.tunebook);
      next.existingWLines = current.existingWLines || getLyricLines(props.tune);

      const detectedKey = next.timedMelody && next.timedMelody.detectedKey
        ? next.timedMelody.detectedKey
        : '';
      const detectedMeter = (next.timedMelody && next.timedMelody.detectedMeter)
        || (analysis.raw && analysis.raw.timing && analysis.raw.timing.meter)
        || '';
      next.metadata = Object.assign({}, current.metadata || {});
      if (detectedKey) next.metadata.key = detectedKey;
      if (detectedMeter && !next.metadata.meter) next.metadata.meter = detectedMeter;
      const detectedTempo = getDetectedTempoFromAnalysis(analysis.raw);
      if (detectedTempo > 0 && !tuneHasTempo({ tempo: next.metadata.tempo })) {
        next.metadata.tempo = detectedTempo;
      }

      if (!current.lyricLines || current.lyricLines.length === 0) {
        next.lyricLines = next.existingWLines.slice();
      } else {
        next.lyricLines = current.lyricLines.slice();
      }

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
  }, [analysis, draft, props.tune, props.tunebook]);

  const stepIndex = useMemo(function() {
    return STEPS.findIndex(function(step) { return step.key === activeStep; });
  }, [activeStep]);

  const canFinish = draftHasFinishableContent(draft);

  const tuningSuggestion = useMemo(function() {
    if (!draft || !draft.metadata) return null;
    const meta = Object.assign({}, draft.metadata, {
      name: draft.metadata.name || (props.tune && props.tune.name) || '',
      tags: (props.tune && props.tune.tags) || draft.metadata.tags || []
    });
    return suggestTuningFromMetadata(meta);
  }, [draft, props.tune, analysis && analysis.version]);

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

  const staging = typeof props.onStage === 'function';

  function handleFinish() {
    if (!draft || !props.tune || !canFinish) return;
    const result = finishMediaImportWizard({
      tune: staging ? JSON.parse(JSON.stringify(props.tune)) : props.tune,
      tunebook: props.tunebook,
      abcjsParser: abcjsParser,
      draft: draft,
      skipSave: staging,
    });
    if (staging) {
      props.onStage(result);
    } else if (typeof props.forceRefresh === 'function') {
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
          {draft && (
            <>
              <MediaImportAnalyzeToolbar
                tune={props.tune}
                processingSettings={draft.processingSettings}
                melodyNoteSettings={draft.melodyNoteSettings}
                existingLyrics={draft.existingWLines}
                autoAnalyze={!!props.autoAnalyze}
                canAnalyzeMedia={canAnalyzeMedia}
                resolverAvailable={resolverAvailable}
                onProcessingChange={function(settings) {
                  updateDraft({ processingSettings: settings });
                }}
                onSearch={webSearch.runSearch}
                searchBusy={webSearch.busy}
                searchError={webSearch.error}
                searchSource={webSearch.source}
                searchProgressMessage={webSearch.progressMessage}
                searchProgressPercent={webSearch.progressPercent}
                stepIndex={stepIndex}
                stepCount={STEPS.length}
                canFinish={canFinish}
                finishLabel={staging ? 'Use these results' : 'Finish'}
                onPrevious={goPrevious}
                onNext={goNext}
                onFinish={handleFinish}
              />
              {tuningSuggestion && !dismissedTuningHint && analysis && (
                <Alert variant="info" dismissible onClose={function() { setDismissedTuningHint(true); }}>
                  {tuningSuggestion.reason}
                  {' '}
                  <Link
                    to={tuningSuggestionTunerUrl(
                      tuningSuggestion,
                      props.tune && props.tune.id ? props.tune.id : null
                    )}
                  >
                    Open tuner
                  </Link>
                  {tuningSuggestion.presetId && getPreset(tuningSuggestion.instrument, tuningSuggestion.presetId) ? (
                    <span className="text-muted">
                      {' '}({TUNER_INSTRUMENT_LABELS[tuningSuggestion.instrument]}
                      {' — '}
                      {getPreset(tuningSuggestion.instrument, tuningSuggestion.presetId).label})
                    </span>
                  ) : null}
                </Alert>
              )}
              <div className="media-import-wizard-tabs">
                <Tabs
                  activeKey={activeStep}
                  onSelect={function(key) { if (key) setActiveStep(key); }}
                  className="mb-3"
                >
                  {STEPS.map(function(step) {
                    return (
                      <Tab key={step.key} eventKey={step.key} title={step.title}>
                        <div className="media-import-wizard-step-body">
                          {step.key === 'metadata' && (
                            <MediaImportMetadataStep
                              draft={draft}
                              tunebook={props.tunebook}
                              onChange={function(nextMetadata) { updateDraft({ metadata: nextMetadata }); }}
                            />
                          )}
                          {step.key === 'lyrics' && (
                            <MediaImportLyricsStep
                              draft={draft}
                              resolverAvailable={resolverAvailable}
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
                              tune={props.tune}
                              tunebook={props.tunebook}
                              searchIndex={props.searchIndex}
                              loadTuneTexts={props.loadTuneTexts}
                              resolverAvailable={canAnalyzeMedia}
                              token={props.token}
                              onChange={function(patch) { updateDraft(patch); }}
                            />
                          )}
                        </div>
                      </Tab>
                    );
                  })}
                </Tabs>
              </div>
            </>
          )}
        </Modal.Body>
      </Modal>
    </>
  );
}
