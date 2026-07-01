import { useEffect, useRef, useCallback } from 'react';
import { Alert, Button, ListGroup } from 'react-bootstrap';
import useTuneMediaAnalysis from '../../useTuneMediaAnalysis';
import MelodyProcessingPanel from '../MelodyProcessingPanel';
import SearchProgressBar from '../SearchProgressBar';
import { buildAnalysisProcessingPayload } from '../../melodyProcessingSettings';

export default function MediaImportAnalyzeToolbar(props) {
  const tune = props.tune;
  const processingSettings = props.processingSettings;
  const melodyNoteSettings = props.melodyNoteSettings;
  const onProcessingChange = props.onProcessingChange;
  const autoAnalyzeStartedRef = useRef(false);
  const resolverAvailable = props.resolverAvailable !== false;
  const canAnalyzeMedia = props.canAnalyzeMedia !== false && resolverAvailable;
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
  const autoAnalyze = props.autoAnalyze;

  const getAnalysisOptions = useCallback(function() {
    return {
      skipPersist: true,
      force: true,
      processing: buildAnalysisProcessingPayload(
        processingSettings,
        melodyNoteSettings,
        {
          name: tune && tune.name,
          composer: tune && tune.composer,
          existingLyrics: existingLyrics,
        }
      ),
    };
  }, [
    processingSettings,
    melodyNoteSettings,
    tune,
    existingLyrics,
  ]);

  const tuneId = tune ? tune.id : null;

  useEffect(function() {
    autoAnalyzeStartedRef.current = false;
  }, [tuneId, autoAnalyze]);

  useEffect(function() {
    if (!autoAnalyze || autoAnalyzeStartedRef.current) return;
    if (!canAnalyzeMedia || mediaSources.length === 0 || isAnalyzing) return;
    autoAnalyzeStartedRef.current = true;
    requestAnalysis(getAnalysisOptions());
  }, [
    autoAnalyze,
    canAnalyzeMedia,
    mediaSources.length,
    isAnalyzing,
    tuneId,
    getAnalysisOptions,
    requestAnalysis,
  ]);

  return (
    <div className="media-import-analyze-toolbar">
      <div className="media-import-analyze-header">
        {canAnalyzeMedia && (
          <div className="media-import-analyze-header-title">Analysis settings</div>
        )}
        <div className="media-import-wizard-nav-actions">
          <Button
            size="sm"
            variant="secondary"
            disabled={props.stepIndex <= 0}
            onClick={props.onPrevious}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={props.stepIndex >= props.stepCount - 1}
            onClick={props.onNext}
          >
            Next
          </Button>
          <Button
            size="sm"
            variant="success"
            disabled={!props.canFinish}
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
        settings={processingSettings}
        persist={false}
        onChange={onProcessingChange}
      />
      )}
      <div className="media-import-analyze-actions">
        {!resolverAvailable && (
          <Alert variant="warning" style={{ marginBottom: 0 }}>Media resolver is not available.</Alert>
        )}
        {resolverAvailable && !canAnalyzeMedia && (
          <Alert variant="info" style={{ marginBottom: 0 }}>Automatic media analysis is not available on this resolver.</Alert>
        )}
        {canAnalyzeMedia && mediaSources.length === 0 && (
          <Alert variant="warning" style={{ marginBottom: 0 }}>No linked media is available for this tune.</Alert>
        )}
        {canAnalyzeMedia && (
        <Button
          variant={isAnalyzing ? 'warning' : 'primary'}
          disabled={mediaSources.length === 0}
          onClick={function() {
            requestAnalysis(getAnalysisOptions());
          }}
        >
          {isAnalyzing ? 'Cancel' : 'Analyze media'}
        </Button>
        )}
        {typeof props.onSearch === 'function' && resolverAvailable && (
          <Button
            variant={props.searchBusy ? 'warning' : 'outline-primary'}
            disabled={isAnalyzing && !props.searchBusy}
            onClick={props.onSearch}
          >
            {props.searchBusy ? 'Cancel' : 'Search'}
          </Button>
        )}
      </div>
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
          defaultMessage="Searching for chords and lyrics..."
        />
      )}
      {props.searchError && (
        <Alert variant="danger" style={{ marginTop: '0.75em', marginBottom: 0 }}>{props.searchError}</Alert>
      )}
      {props.searchSource && !props.searchError && (
        <Alert variant="success" style={{ marginTop: '0.75em', marginBottom: 0 }}>
          Imported from {props.searchSource}
        </Alert>
      )}
      {error && <Alert variant="danger" style={{ marginTop: '0.75em', marginBottom: 0 }}>{error}</Alert>}
      {analysis && analysis.formatted && (
        <Alert variant="success" style={{ marginTop: '0.75em', marginBottom: 0 }}>
          Analysis complete.
        </Alert>
      )}
      {showSourceDialog && canAnalyzeMedia && (
        <ListGroup style={{ marginTop: '0.75em' }}>
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
                      runAnalysis(source, getAnalysisOptions());
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
