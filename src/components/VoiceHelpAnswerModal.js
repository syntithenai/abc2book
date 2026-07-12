import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Modal, Button } from 'react-bootstrap';
import { submitHelpQuery } from '../helpQueryClient';
import {
  helpPathForSection,
  helpSectionIdFromLink,
  scrollToHelpSection,
} from '../helpNavigation';

function normalizeLinks(links) {
  return Array.isArray(links) ? links.filter(Boolean) : [];
}

function linkLabel(link) {
  const sectionId = helpSectionIdFromLink(link);
  if (sectionId) {
    return sectionId.replace(/-/g, ' ');
  }
  return String(link || 'Help link');
}

function isVagueHelpAnswer(answer) {
  const normalized = String(answer || '').trim().toLowerCase().replace(/\.+$/, '');
  if (!normalized) return true;
  return normalized === 'open the help section for the closest topic'
    || normalized.startsWith('open the help section')
    || normalized === 'open the related help topic below for step-by-step guidance on this question';
}

function resolveHelpAnswer(primary, fallback, links) {
  if (primary && !isVagueHelpAnswer(primary)) return primary;
  if (fallback && !isVagueHelpAnswer(fallback)) return fallback;
  const firstLink = normalizeLinks(links)[0];
  if (firstLink) {
    return 'Open the related help topic “' + linkLabel(firstLink) + '” below for the steps.';
  }
  return primary || fallback || '';
}

export default function VoiceHelpAnswerModal(props) {
  const navigate = useNavigate();
  const [retryNonce, setRetryNonce] = useState(0);
  const [answerState, setAnswerState] = useState(function() {
    return {
      question: props.question || '',
      answer: resolveHelpAnswer(props.answer, '', props.links),
      links: normalizeLinks(props.links),
    };
  });

  useEffect(function() {
    setAnswerState({
      question: props.question || '',
      answer: resolveHelpAnswer(props.answer, '', props.links),
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
      const nextLinks = normalizeLinks(result.links && result.links.length ? result.links : props.links);
      setAnswerState({
        question: result.question || props.question,
        answer: resolveHelpAnswer(result.answer, props.answer, nextLinks),
        links: nextLinks,
      });
    }).catch(function() {
      // Keep the voice-provided answer if the direct help query fails.
    });

    return function() {
      cancelled = true;
    };
  }, [props.show, props.question, props.answer, props.links, props.accessToken, props.onProgress, retryNonce]);

  function openHelpLink(link) {
    const sectionId = helpSectionIdFromLink(link);
    if (typeof props.onHide === 'function') {
      props.onHide();
    }
    navigate(helpPathForSection(sectionId));
    window.setTimeout(function() {
      if (sectionId) scrollToHelpSection(sectionId);
    }, 120);
  }

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
                  const sectionId = helpSectionIdFromLink(link);
                  const to = helpPathForSection(sectionId);
                  return (
                    <li key={link}>
                      <Link
                        to={to}
                        onClick={function(event) {
                          event.preventDefault();
                          openHelpLink(link);
                        }}
                      >
                        {linkLabel(link)}
                      </Link>
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
