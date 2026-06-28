import { Alert, Button, ListGroup, Modal } from 'react-bootstrap';
import useMediaResolverHealth from '../useMediaResolverHealth';
import useTuneMediaAnalysis from '../useTuneMediaAnalysis';

export default function TuneMediaAnalysisButton({
  label,
  activeLabel,
  buttonStyle,
  variant,
}) {
  const { available: resolverAvailable } = useMediaResolverHealth();
  const {
    mediaSources,
    isAnalyzing,
    error,
    showSourceDialog,
    setShowSourceDialog,
    requestAnalysis,
    runAnalysis,
    getStatusLabel,
  } = useTuneMediaAnalysis();

  if (!resolverAvailable || mediaSources.length === 0) {
    return error
      ? <Alert variant="danger" style={{ marginTop: '1em', marginBottom: '0.5em' }}>{error}</Alert>
      : null;
  }

  const buttonLabel = getStatusLabel(activeLabel || label);

  return (
    <>
      <Button
        variant={isAnalyzing ? 'warning' : (variant || 'primary')}
        style={buttonStyle || { marginLeft: '0.5em' }}
        onClick={function() { requestAnalysis(); }}
      >{buttonLabel}</Button>
      {error && <Alert variant="danger" style={{ marginTop: '1em', marginBottom: '0.5em', clear: 'both' }}>{error}</Alert>}

      <Modal show={showSourceDialog} onHide={function() { if (!isAnalyzing) setShowSourceDialog(false); }}>
        <Modal.Header closeButton={!isAnalyzing}>
          <Modal.Title>Select media to analyze</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <ListGroup>
            {mediaSources.map(function(source) {
              return <ListGroup.Item key={source.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1em', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>{source.label}</div>
                    <div style={{ fontSize: '0.9em', wordBreak: 'break-word' }}>{source.detail}</div>
                  </div>
                  <Button disabled={isAnalyzing} onClick={function() { runAnalysis(source); }}>Use this</Button>
                </div>
              </ListGroup.Item>;
            })}
          </ListGroup>
        </Modal.Body>
      </Modal>
    </>
  );
}
