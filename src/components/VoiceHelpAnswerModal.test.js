import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import VoiceHelpAnswerModal from './VoiceHelpAnswerModal';
import { submitHelpQuery } from '../helpQueryClient';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../helpQueryClient', function() {
  return {
    submitHelpQuery: jest.fn(),
  };
});

jest.mock('react-bootstrap', function() {
  function Passthrough(props) {
    return <div>{props.children}</div>;
  }

  function Button(props) {
    return <button type="button" onClick={props.onClick}>{props.children}</button>;
  }

  function Modal(props) {
    if (!props.show) return null;
    return <div data-testid="modal">{props.children}</div>;
  }

  Modal.Header = Passthrough;
  Modal.Body = Passthrough;
  Modal.Footer = Passthrough;
  Modal.Title = Passthrough;

  return {
    Modal: Modal,
    Button: Button,
  };
});

jest.mock('react-router-dom', function() {
  return {
    Link: function Link(props) {
      return <a href={props.to}>{props.children}</a>;
    },
  };
});

describe('VoiceHelpAnswerModal', function() {
  test('fetches help answers on open and refreshes on retry', async function() {
    const onRetry = jest.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    submitHelpQuery
      .mockResolvedValueOnce({
        question: 'how do I import from media?',
        answer: 'Open the import wizard.',
        links: ['/help#import-from-media'],
        confidence: 0.9,
        parseMethod: 'llm',
      })
      .mockResolvedValueOnce({
        question: 'how do I import from media?',
        answer: 'Use Add > Import from media.',
        links: ['/help#import-from-media', '/help#search-help'],
        confidence: 0.95,
        parseMethod: 'llm',
      });

    await act(async function() {
      root.render(
        <VoiceHelpAnswerModal
          show={true}
          question="how do I import from media?"
          answer="Voice fallback answer"
          links={['/help#voice-fallback']}
          accessToken="token-123"
          onHide={jest.fn()}
          onRetry={onRetry}
        />,
        container
      );
      await Promise.resolve();
    });

    expect(submitHelpQuery).toHaveBeenCalledWith(expect.objectContaining({
      question: 'how do I import from media?',
      accessToken: 'token-123',
    }));

    await act(async function() {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Open the import wizard.');
    expect(container.textContent).toContain('Related help');
    expect(container.querySelector('a[href="/help#import-from-media"]')).toBeTruthy();

    const retryButton = Array.from(container.querySelectorAll('button')).find(function(button) {
      return button.textContent === 'Retry';
    });
    expect(retryButton).toBeTruthy();

    await act(async function() {
      retryButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(onRetry).toHaveBeenCalledTimes(1);

    await act(async function() {
      await Promise.resolve();
    });

    expect(submitHelpQuery).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('Use Add > Import from media.');
    expect(container.querySelector('a[href="/help#search-help"]')).toBeTruthy();
    expect(container.querySelector('a[href="/help#import-from-media"]')).toBeTruthy();
    expect(container.textContent).not.toContain('Voice fallback answer');

    root.unmount();
    container.remove();
  });

  test('keeps the initial voice answer when the direct help query fails', async function() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    submitHelpQuery.mockRejectedValueOnce(new Error('resolver unavailable'));

    await act(async function() {
      root.render(
        <VoiceHelpAnswerModal
          show={true}
          question="how do I import from media?"
          answer="Voice fallback answer"
          links={['/help#voice-fallback']}
          accessToken="token-123"
          onHide={jest.fn()}
          onRetry={jest.fn()}
        />,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Voice fallback answer');

    root.unmount();
    container.remove();
  });
});
