import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ImportReviewModal from './ImportReviewModal';
import { createImportReviewSession } from '../importReviewSession';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-bootstrap', function() {
  function passthrough(tagName) {
    return function Component(props) {
      const Tag = tagName;
      return <Tag {...props}>{props.children}</Tag>;
    };
  }

  function Button(props) {
    return <button type="button" {...props}>{props.children}</button>;
  }

  function FormControl(props) {
    if (props.as === 'textarea') {
      return <textarea {...props} />;
    }
    return <input {...props} />;
  }

  const Form = passthrough('form');
  Form.Group = passthrough('div');
  Form.Label = passthrough('label');
  Form.Control = FormControl;

  function Modal(props) {
    if (!props.show) return null;
    return <div data-testid="modal">{props.children}</div>;
  }
  Modal.Header = passthrough('div');
  Modal.Title = passthrough('div');
  Modal.Body = passthrough('div');
  Modal.Footer = passthrough('div');

  const ListGroup = passthrough('div');
  ListGroup.Item = passthrough('div');

  return {
    Alert: passthrough('div'),
    Badge: passthrough('span'),
    Button: Button,
    Col: passthrough('div'),
    Form: Form,
    ListGroup: ListGroup,
    Modal: Modal,
    Row: passthrough('div'),
  };
});

jest.mock('./LinksEditor', function() {
  return function LinksEditor() {
    return <div data-testid="links-editor">Links editor</div>;
  };
});

jest.mock('./YouTubeSearchModal', function() {
  return function YouTubeSearchModal(props) {
    return <span data-testid="youtube-search-trigger">{props.triggerElement || 'YouTube'}</span>;
  };
});

jest.mock('./TuneAliasesField', function() {
  return function TuneAliasesField() {
    return <div data-testid="aliases-field">Aliases</div>;
  };
});

jest.mock('./ComposerSearchButton', function() {
  return function ComposerSearchButton() {
    return <button type="button">Find artist</button>;
  };
});

jest.mock('./ComposerCandidateQuickPick', function() {
  return function ComposerCandidateQuickPick() {
    return null;
  };
});

jest.mock('./TuneRecordForm', function() {
  return function TuneRecordForm() {
    return <div data-testid="tune-record-form">Tune record form</div>;
  };
});

jest.mock('./PasteImportModal', function() {
  return function PasteImportModal() {
    return <button type="button">Paste</button>;
  };
});

jest.mock('./ImportUrlModal', function() {
  return function ImportUrlModal() {
    return <button type="button">URL</button>;
  };
});

jest.mock('./DriveFilePickerModal', function() {
  return function DriveFilePickerModal() {
    return <button type="button">Drive</button>;
  };
});

jest.mock('./SheetImageCameraModal', function() {
  return function SheetImageCameraModal() {
    return null;
  };
});

jest.mock('./SheetImageGooglePhotosModal', function() {
  return function SheetImageGooglePhotosModal() {
    return null;
  };
});

jest.mock('../useAudioUtils', function() {
  return function useAudioUtils() {
    return {
      isRecording: false,
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
    };
  };
});

jest.mock('../useAbcjsParser', function() {
  return function useAbcjsParser() {
    return {};
  };
});

jest.mock('../useGoogleDocument', function() {
  return function useGoogleDocument() {
    return {};
  };
});

jest.mock('../useMediaResolverHealth', function() {
  return function useMediaResolverHealth() {
    return { checked: true, available: true, features: {} };
  };
});

jest.mock('../tuneCollectionMatch', function() {
  return {
    findCollectionMatches: jest.fn(function() {
      return [{
        tune: { id: 'existing-1', name: 'Existing Tune', composer: 'Existing Artist' },
        confidence: 'high',
      }];
    }),
  };
});

function renderModal(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  return {
    container: container,
    root: root,
    render: async function(nextProps) {
      await act(async function() {
        root.render(<ImportReviewModal {...nextProps} />);
        await Promise.resolve();
      });
    },
    unmount: async function() {
      await act(async function() {
        root.unmount();
      });
      container.remove();
    },
  };
}

function buildProps(overrides) {
  const session = createImportReviewSession([
    { id: 'a', tune: { name: 'Alpha', composer: 'One', links: [] } },
    { id: 'b', tune: { name: 'Beta', composer: 'Two', links: [] } },
    { id: 'c', tune: { name: 'Gamma', composer: 'Three', links: [] } },
  ]);
  return Object.assign({
    embedded: true,
    show: true,
    session: session,
    tunes: {
      'existing-1': { id: 'existing-1', name: 'Existing Tune', composer: 'Existing Artist' },
    },
    tunebook: {},
    resolverAvailable: true,
    onClose: jest.fn(),
    onSessionChange: jest.fn(),
    onFinishCandidate: jest.fn(),
    onEnhanceAndAdvance: jest.fn(),
    onComplete: jest.fn(),
  }, overrides || {});
}

describe('ImportReviewModal', function() {
  test('renders shared tune form and merge choices panel', async function() {
    const view = renderModal();
    const props = buildProps();

    await view.render(props);

    expect(view.container.querySelector('[data-testid="tune-record-form"]')).toBeTruthy();

    const mergeChoicesRegion = view.container.querySelector('[aria-label="Merge choices"]');
    expect(mergeChoicesRegion).toBeTruthy();

    await view.unmount();
  });

  test('clicking Next advances the review queue through onSessionChange', async function() {
    const view = renderModal();
    const onSessionChange = jest.fn();
    const props = buildProps({ onSessionChange: onSessionChange });

    await view.render(props);

    const nextButton = Array.from(view.container.querySelectorAll('button')).find(function(button) {
      return button.textContent === 'Next';
    });
    expect(nextButton).toBeTruthy();

    await act(async function() {
      nextButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(onSessionChange).toHaveBeenCalledTimes(1);
    expect(onSessionChange.mock.calls[0][0].index).toBe(1);

    await view.unmount();
  });

  test('clicking Prev loops to the last queued candidate', async function() {
    const view = renderModal();
    const onSessionChange = jest.fn();
    const props = buildProps({ onSessionChange: onSessionChange });

    await view.render(props);

    const prevButton = Array.from(view.container.querySelectorAll('button')).find(function(button) {
      return button.textContent === 'Prev';
    });
    expect(prevButton).toBeTruthy();

    await act(async function() {
      prevButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(onSessionChange).toHaveBeenCalledTimes(1);
    expect(onSessionChange.mock.calls[0][0].index).toBe(2);

    await view.unmount();
  });

  test('import with a selected merge target saves edited tune and advances the queue', async function() {
    const view = renderModal();
    const onSessionChange = jest.fn();
    const onFinishCandidate = jest.fn(function(updatedSession, done) {
      done();
    });
    const session = createImportReviewSession([
      { id: 'a', mergeTargetId: 'existing-1', tune: { name: 'Alpha', composer: 'One', links: [] } },
      { id: 'b', tune: { name: 'Beta', composer: 'Two', links: [] } },
      { id: 'c', tune: { name: 'Gamma', composer: 'Three', links: [] } },
    ]);
    const props = buildProps({
      session: session,
      onSessionChange: onSessionChange,
      onFinishCandidate: onFinishCandidate,
    });

    await view.render(props);

    const importButton = Array.from(view.container.querySelectorAll('button')).find(function(button) {
      return button.textContent === 'Import';
    });
    expect(importButton).toBeTruthy();

    await act(async function() {
      importButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(onFinishCandidate).toHaveBeenCalledTimes(1);
    expect(onFinishCandidate.mock.calls[0][0].candidates[0].mergeTargetId).toBe('existing-1');
    expect(onFinishCandidate.mock.calls[0][0].candidates[0].tune.id).toBe('existing-1');
    expect(onSessionChange).toHaveBeenCalledTimes(1);
    expect(onSessionChange.mock.calls[0][0].index).toBe(1);

    await view.unmount();
  });
});