import { useEffect, useMemo, useState } from 'react';
import { Modal, Tab, Tabs, Alert } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import useAbcjsParser from '../useAbcjsParser';
import useMediaResolverHealth from '../useMediaResolverHealth';
import useTuneMediaAnalysis from '../useTuneMediaAnalysis';
import {
  createWizardDraft,
  applyAnalysisToDraft,
  persistMediaImportLookupResults,
} from '../mediaImportWizardState';
import { getDetectedTempoFromAnalysis, tuneHasTempo } from '../mediaAnalysisClient';
import { finishMediaImportWizard } from '../mediaImportWizardFinish';
import { showBackgroundProcessingNotice } from '../backgroundReviewToast';
import { needsComposerDiscovery } from '../composerDiscoveryUtils';
import { getLyricLines } from '../wLinesUtils';
import { buildSectionsFromLines } from '../timedLyricsModel';
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
  const canResearchBackground = resolverAvailable && features.llm;
  const { analysis } = useTuneMediaAnalysis({ tune: props.tune });

  const metadata = draft && draft.metadata ? draft.metadata : {};
  const propsTuneId = props.tune && props.tune.id;

  const webSearch = useMediaImportWebSearch({
    title: metadata.name || (props.tune && props.tune.name) || '',
    artist: metadata.composer || (props.tune && props.tune.composer) || '',
    backgroundInfo: metadata.backgroundInfo || '',
    token: props.token,
    canResearchBackground: canResearchBackground,
    resolverAvailable: resolverAvailable,
    abcTools: props.tunebook && props.tunebook.abcTools ? props.tunebook.abcTools : null,
    renderChords: function(abc) { return abcjsParser.renderChords(abc, true) },
    background: true,
    onBackgroundResults: function(results) {
      if (!propsTuneId) return;
      persistMediaImportLookupResults(propsTuneId, results, props.tune, props.tunebook);
    },
    onResults: function(results) {
      if (!results || typeof results !== 'object') return;
      setDraft(function(current) {
        if (!current) return current;
        const nextMetadata = Object.assign({}, current.metadata || {});
        if (Array.isArray(results.lookupComposerCandidates) && results.lookupComposerCandidates.length > 0) {
          // Composer choices are reviewed via the metadata dropdown.
        } else if (results.lookupArtist && needsComposerDiscovery(nextMetadata.composer)) {
          nextMetadata.composer = results.lookupArtist;
        }
        if (results.lookupBackgroundInfo && results.lookupBackgroundInfo.trim() && !nextMetadata.backgroundInfo) {
          nextMetadata.backgroundInfo = results.lookupBackgroundInfo.trim();
        }
        if (results.capitalizedTitle) {
          nextMetadata.name = results.capitalizedTitle;
        }
        const next = Object.assign({}, current, { metadata: nextMetadata });
        if (results.lookupChordGridText !== undefined) {
          next.lookupChordGridText = results.lookupChordGridText || current.lookupChordGridText || '';
        }
        if (results.lookupLyricLines !== undefined) {
          next.lookupLyricLines = results.lookupLyricLines || [];
        }
        if (results.lookupLyricSource !== undefined) {
          next.lookupLyricSource = results.lookupLyricSource || current.lookupLyricSource || '';
        }
        if (results.lookupBackgroundInfo !== undefined) {
          next.lookupBackgroundInfo = results.lookupBackgroundInfo || current.lookupBackgroundInfo || '';
        }
        if (results.lookupBackgroundSource !== undefined) {
          next.lookupBackgroundSource = results.lookupBackgroundSource || current.lookupBackgroundSource || '';
        }
        if (results.lookupComposerCandidates !== undefined) {
          next.lookupComposerCandidates = results.lookupComposerCandidates;
        }
        return next;
      });
    },
  });

  function close() {
    if (typeof props.onClose === 'function') props.onClose();
  }

  function notifyBackgroundStart() {
    close();
    if (typeof props.onBackgroundStart === 'function') {
      props.onBackgroundStart();
    }
    showBackgroundProcessingNotice();
  }

  function runInBackground(startTask) {
    if (typeof startTask === 'function') startTask();
    notifyBackgroundStart();
  }

  useEffect(function() {
    if (!show || !props.tune) return;
    const existingWLines = getLyricLines(props.tune);
    const nextDraft = createWizardDraft(props.tune);
    nextDraft.existingWLines = existingWLines;
    nextDraft.lyricLines = existingWLines.slice();
    nextDraft.mergedLyricLines = existingWLines.slice();
    nextDraft.baseTuneAbc = props.abc || props.tunebook.abcTools.json2abc(props.tune);
    try {
      const existingChords = abcjsParser.renderChords(nextDraft.baseTuneAbc, true) || '';
      nextDraft.existingChordGridText = existingChords;
      nextDraft.chordGridText = existingChords;
      const existingNotes = props.tunebook.abcTools.justNotes(nextDraft.baseTuneAbc) || '';
      nextDraft.existingMelodyNotesText = existingNotes;
      nextDraft.melodyNotesText = existingNotes;
    } catch (e) {
      nextDraft.existingChordGridText = '';
      nextDraft.chordGridText = '';
      nextDraft.existingMelodyNotesText = '';
      nextDraft.melodyNotesText = '';
    }
    setDraft(nextDraft);
    setActiveStep('metadata');
    setDismissedTuningHint(false);
  }, [show, propsTuneId, props.abc]);

  const analysisVersion = analysis ? analysis.version : 0;

  useEffect(function() {
    if (!analysis || analysisVersion <= 0) return;
    setDraft(function(current) {
      if (!current || current.analysisVersion === analysisVersion) return current;
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
        next.metadata.tempo = String(detectedTempo);
      }

      if (next.timedLyrics) {
        next.sections = buildSectionsFromLines(next.timedLyrics);
      }
      return next;
    });
  }, [analysis, analysisVersion, props.tune, props.tunebook]);

  const searchTitle = (metadata.name || (props.tune && props.tune.name) || '').trim();
  const canSearch = !!searchTitle;

  const tuningSuggestion = useMemo(function() {
    if (!draft || !draft.metadata) return null;
    const meta = Object.assign({}, draft.metadata, {
      name: draft.metadata.name || (props.tune && props.tune.name) || '',
      tags: (props.tune && props.tune.tags) || draft.metadata.tags || []
    });
    return suggestTuningFromMetadata(meta);
  }, [draft, props.tune, analysis && analysis.version]);

  const staging = typeof props.onStage === 'function';

  function handleFinish() {
    if (!draft || !props.tune) return;

    const finishActionLabel = staging ? 'using these results' : 'finishing';
    const title = String(
      (draft.metadata && draft.metadata.name)
      || (props.tune && props.tune.name)
      || ''
    ).trim();
    if (!title) {
      toast.warn('Title is required before ' + finishActionLabel + '.');
      setActiveStep('metadata');
      return;
    }

    const composer = String(
      (draft.metadata && draft.metadata.composer)
      || (props.tune && props.tune.composer)
      || ''
    ).trim();
    if (!composer) {
      toast.warn('Artist is required before ' + finishActionLabel + '.');
      setActiveStep('metadata');
      return;
    }

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
                tunebook={props.tunebook}
                preferredLinkIndex={props.linkIndex}
                autoStartAnalysis={props.autoStartAnalysis}
                processingSettings={draft.processingSettings}
                melodyNoteSettings={draft.melodyNoteSettings}
                existingLyrics={draft.existingWLines}
                canAnalyzeMedia={canAnalyzeMedia}
                canSearch={canSearch}
                resolverAvailable={resolverAvailable}
                onProcessingChange={function(settings) {
                  updateDraft({ processingSettings: settings });
                }}
                onSearch={function() { runInBackground(webSearch.runSearch); }}
                onFullLookup={function() { runInBackground(webSearch.runFullLookup); }}
                onCancelSearch={webSearch.cancelSearch}
                searchBusy={webSearch.busy}
                searchError={webSearch.error}
                searchSource={webSearch.source}
                searchProgressMessage={webSearch.progressMessage}
                searchProgressPercent={webSearch.progressPercent}
                finishLabel={staging ? 'Use these results' : 'Finish'}
                onFinish={handleFinish}
                onBackgroundStart={notifyBackgroundStart}
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
                              token={props.token}
                              resolverAvailable={resolverAvailable}
                              onChange={function(nextMetadata) { updateDraft({ metadata: nextMetadata }); }}
                              onDraftChange={function(patch) { updateDraft(patch); }}
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
