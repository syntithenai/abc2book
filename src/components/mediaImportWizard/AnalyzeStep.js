import { Alert, Button, ListGroup, ProgressBar } from 'react-bootstrap';
import useMediaResolverHealth from '../../useMediaResolverHealth';
import useTuneMediaAnalysis from '../../useTuneMediaAnalysis';
import MelodyProcessingPanel from '../MelodyProcessingPanel';
import { buildAnalysisProcessingPayload } from '../../melodyProcessingSettings';

export default function MediaImportAnalyzeStep(props) {
  const tune = props.tune;
  const processingSettings = props.processingSettings;
  const melodyNoteSettings = props.melodyNoteSettings;
  const onProcessingChange = props.onProcessingChange;
  const { available: resolverAvailable } = useMediaResolverHealth();
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

  function analysisOptions() {
    return {
      skipPersist: true,
      force: true,
      processing: buildAnalysisProcessingPayload(
        processingSettings,
        melodyNoteSettings,
        {
          name: tune && tune.name,
          composer: tune && tune.composer,
          existingLyrics: props.existingLyrics,
        }
      ),
    };
  }

  return (
    <div>
      <p>
        Analyze linked media to transcribe lyrics, detect chords, and extract melody.
        Later wizard steps stay locked until analysis completes.
      </p>
      <MelodyProcessingPanel
        variant="analysis"
        title="Analysis settings"
        settings={processingSettings}
        persist={false}
        onChange={onProcessingChange}
      />
      {!resolverAvailable && (
        <Alert variant="warning">Media resolver is not available.</Alert>
      )}
      {resolverAvailable && mediaSources.length === 0 && (
        <Alert variant="warning">No linked media is available for this tune.</Alert>
      )}
      <Button
        variant={isAnalyzing ? 'warning' : 'primary'}
        disabled={!resolverAvailable || mediaSources.length === 0 || isAnalyzing}
        onClick={function() {
          requestAnalysis(analysisOptions());
        }}
      >
        {isAnalyzing ? (status || 'Analyzing...') : 'Analyze media'}
      </Button>
      {isAnalyzing && (
        <div style={{ marginTop: '1em', maxWidth: '32em' }}>
          <div style={{ fontSize: '0.9em', marginBottom: '0.35em' }}>{status || 'Analyzing...'}</div>
          <ProgressBar
            now={progress || 0}
            label={`${progress || 0}%`}
            animated
            striped
          />
        </div>
      )}
      {error && <Alert variant="danger" style={{ marginTop: '1em' }}>{error}</Alert>}
      {analysis && analysis.formatted && (
        <Alert variant="success" style={{ marginTop: '1em' }}>
          Analysis complete. Continue to the Metadata step.
        </Alert>
      )}
      {showSourceDialog && (
        <ListGroup style={{ marginTop: '1em' }}>
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
                      runAnalysis(source, analysisOptions());
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
