import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Button, Modal, Form, Alert, Spinner } from 'react-bootstrap';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal, flushSync } from 'react-dom';
import TunePrintSheet from '../components/TunePrintSheet';
import useAbcjsParser from '../useAbcjsParser';
import { resolvePrintViewMode } from '../printTuneViewMode';
import { generateTunesPdf } from '../generateTunesPdf';
import { useDocumentTitle } from '../pageTitle';
import SearchProgressBar from '../components/SearchProgressBar';
import { buildBulkProgressEvent } from '../bulkOperationProgress';

function sanitizeFilename(name) {
  const base = String(name || 'tunes').trim() || 'tunes';
  return base.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
}

function buildPdfFilename(tunes, tuneBook) {
  if (tunes && tunes.length === 1 && tunes[0] && tunes[0].name) {
    return sanitizeFilename(tunes[0].name) + '.pdf';
  }
  if (tuneBook) {
    return sanitizeFilename(tuneBook) + '.pdf';
  }
  return 'tunes.pdf';
}

export default function PrintPage(props) {
  useDocumentTitle('Print');
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const abcjsParser = useAbcjsParser({ tunebook: props.tunebook });
  const renderHostRef = useRef(null);

  const [useTunes, setUseTunes] = useState(null);
  const [useQR, setUseQR] = useState(true);
  const [hideBackgroundInfo, setHideBackgroundInfo] = useState(true);
  const [show, setShow] = useState(false);
  const [selectedCount, setSelectedCount] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [renderForPdf, setRenderForPdf] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [pdfProgress, setPdfProgress] = useState(buildBulkProgressEvent(0, 0, ''));

  const goBack = useCallback(function() {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/tunes');
    }
  }, [navigate]);

  const handleClose = useCallback(function() {
    setShow(false);
    goBack();
  }, [goBack]);

  useEffect(function() {
    if (params.tuneBook) {
      const tmp = props.tunebook.fromBook(params.tuneBook).map(function(tune) {
        return tune;
      });
      setUseTunes(tmp);
      setSelectedCount(tmp.length);
      setShow(true);
    } else if (location.state && Array.isArray(location.state.tuneIds) && location.state.tuneIds.length > 0) {
      const fromState = location.state.tuneIds.map(function(tuneId) {
        return props.tunes[tuneId];
      }).filter(function(tune) { return tune && tune.id; });
      setUseTunes(fromState);
      setSelectedCount(fromState.length);
      setShow(true);
    } else {
      const selectedIds = Object.keys(props.selected || {});
      if (selectedIds.length > 0) {
        const tmp = [];
        selectedIds.forEach(function(tuneId) {
          if (props.selected[tuneId] && props.tunes[tuneId]) {
            tmp.push(props.tunes[tuneId]);
          }
        });
        setUseTunes(tmp);
        setSelectedCount(tmp.length);
        setShow(true);
      } else {
        setUseTunes([]);
        setSelectedCount(0);
        setShow(true);
      }
    }
  }, [params.tuneBook, props.tunes, props.selected, props.tunebook, location.state]);

  const tuneViewModes = useMemo(function() {
    if (!useTunes || useTunes.length === 0) return {};
    const map = {};
    useTunes.forEach(function(tune) {
      map[tune.id] = resolvePrintViewMode(
        tune,
        props.viewMode,
        props.tunebook,
        abcjsParser
      );
    });
    return map;
  }, [useTunes, props.viewMode, props.tunebook, abcjsParser]);

  const pdfFilename = useMemo(function() {
    return buildPdfFilename(useTunes, params.tuneBook);
  }, [useTunes, params.tuneBook]);

  async function createPdf() {
    if (!useTunes || useTunes.length === 0) {
      setErrorMessage('No tunes selected to print.');
      return;
    }
    setErrorMessage('');
    setGenerating(true);
    flushSync(function() {
      setRenderForPdf(true);
    });
    try {
      await new Promise(function(resolve) {
        requestAnimationFrame(function() {
          requestAnimationFrame(resolve);
        });
      });
      const host = renderHostRef.current;
      if (!host) {
        throw new Error('Print layout failed to render.');
      }
      await generateTunesPdf(host, pdfFilename, {
        onProgress: function(event) {
          setPdfProgress(event)
        },
      });
      setShow(false);
      goBack();
    } catch (err) {
      setErrorMessage(err && err.message ? err.message : 'PDF generation failed.');
    } finally {
      setGenerating(false);
      setRenderForPdf(false);
    }
  }

  return (
    <div className="App-print">
      <Modal show={show} onHide={handleClose} backdrop={generating ? 'static' : true} keyboard={!generating}>
        <Modal.Header closeButton={!generating}>
          <Modal.Title>Print {selectedCount} selected tune{selectedCount === 1 ? '' : 's'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {useTunes !== null && useTunes.length === 0 ? (
            <Alert variant="warning">No tunes selected to print.</Alert>
          ) : (
            <Form>
              <Form.Check type="checkbox" id="print-use-qr" checked={!!useQR} onChange={function() { setUseQR(!useQR); }}>
                <Form.Check.Input type="checkbox" checked={!!useQR} onChange={function() { setUseQR(!useQR); }} disabled={generating} />
                <Form.Check.Label>&nbsp;&nbsp;&nbsp;Add QR code for playable links</Form.Check.Label>
              </Form.Check>
              <Form.Check type="checkbox" id="print-hide-background-info" checked={!!hideBackgroundInfo} onChange={function() { setHideBackgroundInfo(!hideBackgroundInfo); }} className="mt-2">
                <Form.Check.Input type="checkbox" checked={!!hideBackgroundInfo} onChange={function() { setHideBackgroundInfo(!hideBackgroundInfo); }} disabled={generating} />
                <Form.Check.Label>&nbsp;&nbsp;&nbsp;Hide Background Information</Form.Check.Label>
              </Form.Check>
            </Form>
          )}
          {errorMessage ? <Alert variant="danger" className="mt-3 mb-0">{errorMessage}</Alert> : null}
          {generating && pdfProgress.total > 0 ? (
            <div className="mt-3">
              <SearchProgressBar
                visible={true}
                percent={pdfProgress.percent}
                message={pdfProgress.message}
                defaultMessage="Preparing print…"
              />
            </div>
          ) : null}
          <div style={{ marginTop: '2em', paddingBottom: '1em' }}>
            <Button
              key="create-pdf"
              variant="success"
              onClick={createPdf}
              disabled={generating || !useTunes || useTunes.length === 0}
            >
              {generating ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" role="status" aria-hidden="true" />
                  Preparing print…
                </>
              ) : 'Print'}
            </Button>
            <Button style={{ float: 'right' }} key="cancel" variant="danger" onClick={handleClose} disabled={generating}>
              Cancel
            </Button>
          </div>
        </Modal.Body>
      </Modal>

      {(renderForPdf && useTunes && useTunes.length > 0) ? createPortal(
        <div id="print-pdf-render-host" className="print-pdf-render-host" ref={renderHostRef} aria-hidden="true">
          {useTunes.map(function(tune, index) {
            return (
              <TunePrintSheet
                key={tune.id}
                tune={tune}
                tunebook={props.tunebook}
                viewMode={tuneViewModes[tune.id] || 'music'}
                useQR={useQR}
                hideBackgroundInfo={hideBackgroundInfo}
                pageNumber={index + 1}
                pageCount={useTunes.length}
              />
            );
          })}
        </div>,
        document.body
      ) : null}
    </div>
  );
}
