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

const mockNavigate = jest.fn();

jest.mock('react-router-dom', function() {
  return {
    Link: function Link(props) {
      return (
        <a
          href={props.to}
          onClick={function(event) {
            if (typeof props.onClick === 'function') props.onClick(event);
          }}
        >
          {props.children}
        </a>
      );
    },
    useNavigate: function() {
      return mockNavigate;
    },
  };
});

jest.mock('../helpNavigation', function() {
  const actual = jest.requireActual('../helpNavigation');
  return Object.assign({}, actual, {
    scrollToHelpSection: jest.fn(function() { return true; }),
  });
});

describe('VoiceHelpAnswerModal', function() {
  beforeEach(function() {
    mockNavigate.mockClear();
  });

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
        />
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

    await act(async function() {
      root.unmount();
    });
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
    expect(container.querySelector('a[href="/help#voice-fallback"]')).toBeTruthy();
    expect(submitHelpQuery).toHaveBeenCalledTimes(1);

    await act(async function() {
      root.unmount();
    });
    container.remove();
  });

  test('replaces a vague voice answer when related links are present', async function() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    submitHelpQuery.mockRejectedValueOnce(new Error('resolver unavailable'));

    await act(async function() {
      root.render(
        <VoiceHelpAnswerModal
          show={true}
          question="How do I use a foot pedal?"
          answer="Open the help section for the closest topic."
          links={['/help#foot-pedal']}
          accessToken="token-123"
          onHide={jest.fn()}
          onRetry={jest.fn()}
        />,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain('foot pedal');
    expect(container.textContent).not.toContain('closest topic');
    expect(container.querySelector('a[href="/help#foot-pedal"]')).toBeTruthy();

    await act(async function() {
      root.unmount();
    });
    container.remove();
  });

  test('related help links close the dialog and navigate to the section', async function() {
    const onHide = jest.fn();
    const { scrollToHelpSection } = require('../helpNavigation');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    submitHelpQuery.mockRejectedValueOnce(new Error('resolver unavailable'));

    jest.useFakeTimers();
    await act(async function() {
      root.render(
        <VoiceHelpAnswerModal
          show={true}
          question="How do I edit notation?"
          answer="Open a tune, then Edit."
          links={['/help#edit-music']}
          accessToken="token-123"
          onHide={onHide}
          onRetry={jest.fn()}
        />,
      );
      await Promise.resolve();
    });

    const link = container.querySelector('a[href="/help#edit-music"]');
    expect(link).toBeTruthy();

    await act(async function() {
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(onHide).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/help#edit-music');

    await act(async function() {
      jest.advanceTimersByTime(150);
    });

    expect(scrollToHelpSection).toHaveBeenCalledWith('edit-music');

    await act(async function() {
      root.unmount();
    });
    container.remove();
    jest.useRealTimers();
  });
});
