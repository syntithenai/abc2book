import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, ButtonGroup, Form, ListGroup } from 'react-bootstrap';
import useTuneMediaAnalysis from '../../useTuneMediaAnalysis';
import MelodyProcessingPanel, {
  ANALYSIS_HELP_FIELDS,
  MUSIC_TYPE_OPTIONS,
} from '../MelodyProcessingPanel';
import { FieldHelpModal } from '../FormFieldHelp';
import { icons } from '../../Icons';
import SearchProgressBar from '../SearchProgressBar';
import { buildAnalysisProcessingPayload } from '../../melodyProcessingSettings';
import { getLinkedMediaSourceByIndex } from '../../mediaTranscriptionSources';
import { useAutoLinkPlaybackRegionScan } from '../../useAutoLinkPlaybackRegionScan';
import { linkHasConfiguredPlayRange } from '../../linkPlaybackRegionScanUtils';

function applyPlayRangeResultToTune(tune, linkIndex, result) {
  if (!tune || !Array.isArray(tune.links) || !result || linkIndex == null) return tune;
  const links = tune.links.map(function(link, idx) {
    if (idx !== linkIndex) return Object.assign({}, link);
    const next = Object.assign({}, link);
    if (result.startAt > 0) next.startAt = String(result.startAt);
    if (result.endAt > 0) next.endAt = String(result.endAt);
    return next;
  });
  return Object.assign({}, tune, { links: links });
}

export default function MediaImportAnalyzeToolbar(props) {
  const tune = props.tune;
  const processingSettings = props.processingSettings;
  const melodyNoteSettings = props.melodyNoteSettings;
  const onProcessingChange = props.onProcessingChange;
  const resolverAvailable = props.resolverAvailable !== false;
  const canAnalyzeMedia = props.canAnalyzeMedia !== false && resolverAvailable;
  const canSearch = props.canSearch !== false;
  const { maybeAutoScan } = useAutoLinkPlaybackRegionScan();
  const {
    mediaSources,
    isAnalyzing,
    status,
    progress,
    error,
    analysis,
    showSourceDialog,
    requestAnalysis,
    runAnalysis,
  } = useTuneMediaAnalysis({ tune: tune });

  const existingLyrics = props.existingLyrics;
  const preferredLinkIndex = props.preferredLinkIndex;

  const preferredSource = useMemo(function() {
    return getLinkedMediaSourceByIndex(tune, props.tunebook, preferredLinkIndex);
  }, [tune, props.tunebook, preferredLinkIndex]);

  const ensurePlayRange = useCallback(async function(source, currentTune) {
    if (!source || source.linkIndex == null || !currentTune || !currentTune.id) {
      return currentTune;
    }
    const link = Array.isArray(currentTune.links) ? currentTune.links[source.linkIndex] : null;
    if (!link || linkHasConfiguredPlayRange(link)) {
      return currentTune;
    }
    const result = await maybeAutoScan(currentTune.id, source.linkIndex, link, {
      force: true,
      currentLinks: currentTune.links,
      onLinksUpdated: typeof props.onLinksUpdated === 'function' ? props.onLinksUpdated : undefined,
    });
    if (!result) return currentTune;
    return applyPlayRangeResultToTune(currentTune, source.linkIndex, result);
  }, [maybeAutoScan, props.onLinksUpdated]);

  const getAnalysisOptions = useCallback(function(overrides) {
    return Object.assign({
      // Keep results on the wizard draft while the modal stays open.
      skipPersist: true,
      force: true,
      ensurePlayRange: ensurePlayRange,
      processing: buildAnalysisProcessingPayload(
        processingSettings,
        melodyNoteSettings,
        {
          name: tune && tune.name,
          composer: tune && tune.composer,
          existingLyrics: existingLyrics,
        }
      ),
    }, overrides || {});
  }, [
    processingSettings,
    melodyNoteSettings,
    tune,
    existingLyrics,
    ensurePlayRange,
  ]);

  const canStartAnalysis = canAnalyzeMedia
    && (preferredSource || mediaSources.length > 0)
    && !(preferredLinkIndex !== null && preferredLinkIndex !== undefined && !preferredSource);

  const startAnalysis = useCallback(function(overrides) {
    const options = getAnalysisOptions(overrides);
    if (preferredSource) {
      runAnalysis(preferredSource, options);
      return;
    }
    requestAnalysis(options);
  }, [preferredSource, runAnalysis, requestAnalysis, getAnalysisOptions]);

  // Closing the wizard abandons the draft, so persist field suggestions like Bulk Search.
  const startAnalysisInBackground = useCallback(function() {
    startAnalysis({ skipPersist: false });
    if (typeof props.onBackgroundStart === 'function') {
      props.onBackgroundStart();
    }
  }, [startAnalysis, props.onBackgroundStart]);

  const autoStartRequestedRef = useRef(false);
  useEffect(function() {
    if (!props.autoStartAnalysis) {
      autoStartRequestedRef.current = false;
      return;
    }
    if (autoStartRequestedRef.current || isAnalyzing || !canStartAnalysis) return;
    autoStartRequestedRef.current = true;
    startAnalysisInBackground();
  }, [props.autoStartAnalysis, isAnalyzing, canStartAnalysis, startAnalysisInBackground]);

  const searchBusy = !!props.searchBusy;
  const isBusy = isAnalyzing || searchBusy;
  const [showAnalysisHelp, setShowAnalysisHelp] = useState(false);

  const handleCancel = useCallback(function() {
    if (isAnalyzing) {
      requestAnalysis(getAnalysisOptions());
    }
    if (searchBusy && typeof props.onCancelSearch === 'function') {
      props.onCancelSearch();
    }
  }, [
    isAnalyzing,
    searchBusy,
    props.onCancelSearch,
    requestAnalysis,
    getAnalysisOptions,
  ]);

  function startFullScrape() {
    // onFullLookup closes the wizard, so persist analysis suggestions.
    if (canStartAnalysis) {
      startAnalysis({ skipPersist: false });
    }
    if (typeof props.onFullLookup === 'function') {
      props.onFullLookup();
    }
  }

  const canFullScrape = resolverAvailable
    && canSearch
    && typeof props.onFullLookup === 'function'
    && (canStartAnalysis || typeof props.onSearch === 'function');

  function updateProcessingField(field, value) {
    const next = Object.assign({}, processingSettings, { [field]: value });
    if (typeof onProcessingChange === 'function') {
      onProcessingChange(next);
    }
  }

  return (
    <div className="media-import-analyze-toolbar">
      <div className="media-import-analyze-header">
        <div className="media-import-wizard-nav-actions">
          {isBusy ? (
            <Button variant="warning" onClick={handleCancel}>
              Cancel
            </Button>
          ) : (
            <>
              {typeof props.onSearch === 'function' && (
                <Button
                  variant="outline-primary"
                  disabled={!canSearch}
                  onClick={props.onSearch}
                >
                  Search
                </Button>
              )}
              {canAnalyzeMedia && (
                <>
                  <ButtonGroup className="media-import-analyze-btn-group">
                    <Button
                      variant="outline-secondary"
                      className="media-import-analyze-help-btn"
                      onClick={function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowAnalysisHelp(true);
                      }}
                      title="Explain analysis settings"
                      aria-label="Explain analysis settings"
                    >
                      {icons.question}
                    </Button>
                    <Form.Select
                      value={(processingSettings && processingSettings.musicType) || 'vocal'}
                      onChange={function(e) { updateProcessingField('musicType', e.target.value); }}
                      aria-label="Music type"
                      className="media-import-analyze-music-type-select"
                    >
                      {MUSIC_TYPE_OPTIONS.map(function(option) {
                        return (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        );
                      })}
                    </Form.Select>
                    <div className="media-import-analyze-meter-segment">
                      <Form.Check
                        type="checkbox"
                        id="media-import-enable-meter-changes"
                        label="Time sig. changes"
                        checked={!!(processingSettings && processingSettings.enableMeterChanges)}
                        onChange={function(e) { updateProcessingField('enableMeterChanges', e.target.checked); }}
                        title="Enable time signature changes in chord and melody output"
                      />
                    </div>
                    <Button
                      variant="primary"
                      disabled={!canStartAnalysis}
                      onClick={startAnalysisInBackground}
                    >
                      Analyse Audio
                    </Button>
                  </ButtonGroup>
                  <FieldHelpModal
                    show={showAnalysisHelp}
                    title="Analysis settings"
                    fields={ANALYSIS_HELP_FIELDS}
                    onHide={function() { setShowAnalysisHelp(false); }}
                  />
                </>
              )}
              {canFullScrape && (
                <Button
                  variant="outline-success"
                  disabled={!canSearch}
                  onClick={startFullScrape}
                >
                  Full Scrape
                </Button>
              )}
            </>
          )}
          <Button
            variant="success"
            disabled={isBusy}
            onClick={props.onFinish}
          >
            {props.finishLabel || 'Finish'}
          </Button>
        </div>
      </div>
      {canAnalyzeMedia && (
        <MelodyProcessingPanel
          variant="analysis"
          showTitle={false}
          hideAnalysisControls={true}
          settings={processingSettings}
          persist={false}
          onChange={onProcessingChange}
        />
      )}
      {resolverAvailable && !canAnalyzeMedia && (
        <Alert variant="info" className="media-import-analyze-alert">
          Automatic media analysis is not available on this resolver.
        </Alert>
      )}
      {canAnalyzeMedia && mediaSources.length === 0 && (
        <Alert variant="warning" className="media-import-analyze-alert">
          No linked media is available for this tune.
        </Alert>
      )}
      {canAnalyzeMedia && preferredLinkIndex !== null && preferredLinkIndex !== undefined && !preferredSource && (
        <Alert variant="warning" className="media-import-analyze-alert">
          The selected link does not have media to analyze.
        </Alert>
      )}
      {isAnalyzing && (
        <div className="media-import-analyze-progress">
          <SearchProgressBar
            visible={true}
            percent={progress || 0}
            message={status || 'Analyzing...'}
            defaultMessage="Analyzing..."
          />
        </div>
      )}
      {props.searchBusy && (
        <SearchProgressBar
          visible={true}
          percent={props.searchProgressPercent || 0}
          message={props.searchProgressMessage}
          defaultMessage="Searching..."
        />
      )}
      {props.searchError && (
        <Alert variant="danger" className="media-import-analyze-alert">{props.searchError}</Alert>
      )}
      {props.searchSource && !props.searchError && (
        <Alert variant="success" className="media-import-analyze-alert">
          Imported from {props.searchSource}
        </Alert>
      )}
      {error && <Alert variant="danger" className="media-import-analyze-alert">{error}</Alert>}
      {analysis && analysis.formatted && (
        <Alert variant="success" className="media-import-analyze-alert">
          Analysis complete.
        </Alert>
      )}
      {showSourceDialog && canAnalyzeMedia && (
        <ListGroup className="media-import-analyze-source-list">
          {mediaSources.map(function(source) {
            return (
              <ListGroup.Item key={source.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1em', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>{source.label}</div>
                    <div style={{ fontSize: '0.9em', wordBreak: 'break-word' }}>{source.detail}</div>
                  </div>
                  <Button
                    disabled={isAnalyzing}
                    onClick={function() {
                      runAnalysis(source, getAnalysisOptions({ skipPersist: false }));
                      if (typeof props.onBackgroundStart === 'function') {
                        props.onBackgroundStart();
                      }
                    }}
                  >
                    Use this
                  </Button>
                </div>
              </ListGroup.Item>
            );
          })}
        </ListGroup>
      )}
    </div>
  );
}
