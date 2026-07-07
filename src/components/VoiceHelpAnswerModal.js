import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal, Button } from 'react-bootstrap';
import { submitHelpQuery } from '../helpQueryClient';

function normalizeLinks(links) {
  return Array.isArray(links) ? links.filter(Boolean) : [];
}

export default function VoiceHelpAnswerModal(props) {
  const [retryNonce, setRetryNonce] = useState(0);
  const [answerState, setAnswerState] = useState(function() {
    return {
      question: props.question || '',
      answer: props.answer || '',
      links: normalizeLinks(props.links),
    };
  });

  useEffect(function() {
    setAnswerState({
      question: props.question || '',
      answer: props.answer || '',
      links: normalizeLinks(props.links),
    });
  }, [props.question, props.answer, props.links, props.show]);

  useEffect(function() {
    if (!props.show || !props.question) return;
    let cancelled = false;

    submitHelpQuery({
      question: props.question,
      accessToken: props.accessToken,
      onProgress: props.onProgress,
    }).then(function(result) {
      if (cancelled) return;
      setAnswerState({
        question: result.question || props.question,
        answer: result.answer || props.answer || '',
        links: normalizeLinks(result.links && result.links.length ? result.links : props.links),
      });
    }).catch(function() {
      // Keep the voice-provided answer if the direct help query fails.
    });

    return function() {
      cancelled = true;
    };
  }, [props.show, props.question, props.answer, props.links, props.accessToken, props.onProgress, retryNonce]);

  const links = normalizeLinks(answerState.links);

  return (
    <Modal show={props.show} onHide={props.onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>Help answer</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {answerState.question ? (
          <p className="text-muted mb-2"><strong>Question:</strong> {answerState.question}</p>
        ) : null}
        <div className="voice-help-answer-body">
          {answerState.answer ? <p className="mb-3">{answerState.answer}</p> : <p className="mb-3 text-muted">No answer available.</p>}
          {links.length > 0 ? (
            <div>
              <div className="mb-2"><strong>Related help</strong></div>
              <ul className="mb-0">
                {links.map(function(link) {
                  const label = typeof link === 'string' && link.indexOf('#') !== -1
                    ? link.split('#').pop().replace(/-/g, ' ')
                    : String(link || 'Help link');
                  return (
                    <li key={link}>
                      <Link to={link}>{label}</Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={function() {
          if (typeof props.onRetry === 'function') {
            props.onRetry();
          }
          setRetryNonce(function(next) { return next + 1; });
        }}>Retry</Button>
        <Button variant="primary" onClick={props.onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  );
}
