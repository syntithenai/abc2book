import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ImportReviewModal from './ImportReviewModal';
import { createImportReviewSession, createBlankAddCandidate } from '../importReviewSession';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-bootstrap', function() {
  const React = require('react');

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

  const ModalOnHideContext = React.createContext(null);

  function Modal(props) {
    if (!props.show) return null;
    return (
      <ModalOnHideContext.Provider value={props.onHide || null}>
        <div data-testid={props['data-testid'] || 'modal'}>{props.children}</div>
      </ModalOnHideContext.Provider>
    );
  }
  Modal.Header = function ModalHeader(props) {
    const onHide = React.useContext(ModalOnHideContext);
    const closeButton = props.closeButton;
    const rest = Object.assign({}, props);
    delete rest.closeButton;
    delete rest.children;
    return (
      <div {...rest}>
        {props.children}
        {closeButton ? (
          <button type="button" className="btn-close" aria-label="Close" onClick={onHide} />
        ) : null}
      </div>
    );
  };
  Modal.Title = passthrough('div');
  Modal.Body = passthrough('div');
  Modal.Footer = passthrough('div');

  const ListGroup = passthrough('div');
  ListGroup.Item = function ListGroupItem(props) {
    const {
      action,
      active,
      ...rest
    } = props;
    return (
      <div
        {...rest}
        data-active={active ? 'true' : undefined}
        data-action={action ? 'true' : undefined}
      >
        {props.children}
      </div>
    );
  };

  function Dropdown(props) {
    return <div className={props.className}>{props.children}</div>;
  }
  Dropdown.Toggle = function DropdownToggle(props) {
    return <button type="button" {...props}>{props.children}</button>;
  };
  Dropdown.Menu = passthrough('div');
  Dropdown.Item = function DropdownItem(props) {
    return <button type="button" {...props}>{props.children}</button>;
  };

  return {
    Alert: passthrough('div'),
    Badge: passthrough('span'),
    Button: Button,
    ButtonGroup: passthrough('div'),
    Col: passthrough('div'),
    Dropdown: Dropdown,
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
    return (
      <button
        type="button"
        data-testid="youtube-search-trigger"
        onClick={function() {
          if (typeof props.onChange === 'function') {
            props.onChange({
              title: 'Selected Clip',
              link: 'https://www.youtube.com/watch?v=abc123',
              image: 'https://example.com/thumb.jpg',
            });
          }
        }}
      >
        {props.triggerElement || 'YouTube'}
      </button>
    );
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
  return function TuneRecordForm(props) {
    const links = props.values && Array.isArray(props.values.links) ? props.values.links : [];
    return (
      <div data-testid="tune-record-form">
        {props.toolbar || null}
        {props.statusBanner || null}
        <span data-testid="form-title">{props.values && props.values.title ? props.values.title : ''}</span>
        <ul data-testid="form-links">
          {links.map(function(link, index) {
            return (
              <li key={index} data-testid="form-link">
                {link && link.link ? link.link : ''}
              </li>
            );
          })}
        </ul>
        Tune record form
      </div>
    );
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
    expect(mergeChoicesRegion.textContent).toContain('Choose an existing tune to merge into, or create a new tune.');
    expect(mergeChoicesRegion.textContent).toContain('Create new tune');
    expect(view.container.textContent).not.toContain('Routing:');
    expect(view.container.textContent).toContain('Google Photos');
    expect(view.container.textContent).toContain('Drive');

    await view.unmount();
  });

  test('Add From YouTube updates the live form without reload', async function() {
    const view = renderModal();
    const onImportYouTube = jest.fn();
    const session = createImportReviewSession(
      [createBlankAddCandidate({ book: 'songs', candidateId: 'add-1' })],
      { entryMode: 'add' }
    );
    const props = buildProps({
      session: session,
      currentTuneBook: 'songs',
      onImportYouTube: onImportYouTube,
    });

    await view.render(props);
    expect(view.container.querySelectorAll('[data-testid="form-link"]').length).toBe(0);

    const trigger = view.container.querySelector('[data-testid="youtube-search-trigger"]');
    expect(trigger).toBeTruthy();

    await act(async function() {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(onImportYouTube).toHaveBeenCalledTimes(1);
    const links = view.container.querySelectorAll('[data-testid="form-link"]');
    expect(links.length).toBe(1);
    expect(links[0].textContent).toContain('youtube.com/watch?v=abc123');
    expect(view.container.querySelector('[data-testid="form-title"]').textContent)
      .toBe('Selected Clip');

    await view.unmount();
  });

  test('blank add session uses Add tunes chrome and gated Add button', async function() {
    const view = renderModal();
    const session = createImportReviewSession(
      [createBlankAddCandidate({ book: 'songs' })],
      { entryMode: 'add' }
    );
    const props = buildProps({
      session: session,
      currentTuneBook: 'songs',
    });

    await view.render(props);

    expect(view.container.textContent).toContain('Add tunes');
    const addButton = Array.from(view.container.querySelectorAll('button')).find(function(button) {
      return button.textContent === 'Add';
    });
    expect(addButton).toBeTruthy();
    expect(addButton.disabled).toBe(true);
    expect(view.container.querySelector('[data-testid="add-tunes-reset"]')).toBeTruthy();
    expect(view.container.querySelector('[data-testid="add-tunes-cancel"]')).toBeTruthy();
    const enhanceButton = view.container.querySelector('[data-testid="add-tunes-enhance"]');
    expect(enhanceButton).toBeTruthy();
    expect(enhanceButton.disabled).toBe(true);
    expect(view.container.textContent.match(/Enhance/g) || []).toHaveLength(1);
    // Enhance sits in the header actions, not the status banner (banner has Reset only).
    const banner = view.container.querySelector('.border.rounded.p-2');
    expect(banner && banner.textContent).not.toContain('Enhance');

    await view.unmount();
  });

  test('Add tunes Add enables when title and composer are filled', async function() {
    const view = renderModal();
    const session = createImportReviewSession(
      [createBlankAddCandidate({ book: 'songs', candidateId: 'add-1' })],
      { entryMode: 'add' }
    );
    const filled = Object.assign({}, session.candidates[0], {
      tune: Object.assign({}, session.candidates[0].tune, {
        name: 'Summer of 69',
        composer: 'Bryan Adams',
      }),
    });
    const filledSession = Object.assign({}, session, {
      candidates: [filled],
    });
    const props = buildProps({
      session: filledSession,
      currentTuneBook: 'songs',
    });

    await view.render(props);

    const addButton = Array.from(view.container.querySelectorAll('button')).find(function(button) {
      return button.textContent === 'Add';
    });
    expect(addButton).toBeTruthy();
    expect(addButton.disabled).toBe(false);
    const enhanceButton = view.container.querySelector('[data-testid="add-tunes-enhance"]');
    expect(enhanceButton).toBeTruthy();
    expect(enhanceButton.disabled).toBe(false);

    await view.unmount();
  });

  test('Add tunes Reset clears form fields and collection match', async function() {
    const view = renderModal();
    const onSessionChange = jest.fn();
    const filled = createBlankAddCandidate({
      book: 'songs',
      candidateId: 'add-1',
    });
    filled.tune = Object.assign({}, filled.tune, {
      name: 'Bicycle Race',
      composer: 'Queen',
      links: [{ link: 'https://youtu.be/abc', title: 'clip' }],
      words: ['lyrics line'],
    });
    filled.mergeTargetId = 'existing-1';
    filled.draftFormOverrides = { title: 'Bicycle Race' };
    filled.fieldChoices = { title: { choiceId: 'x' } };
    filled.pendingInlineSuggestions = { notes: { value: 'C' } };
    const session = createImportReviewSession([filled], { entryMode: 'add' });
    const props = buildProps({
      session: session,
      currentTuneBook: 'songs',
      onSessionChange: onSessionChange,
    });

    await view.render(props);

    expect(view.container.textContent).toContain('Merging into Existing Tune');
    const resetButton = view.container.querySelector('[data-testid="add-tunes-reset"]');
    expect(resetButton).toBeTruthy();

    await act(async function() {
      resetButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(onSessionChange).toHaveBeenCalled();
    const nextSession = onSessionChange.mock.calls[onSessionChange.mock.calls.length - 1][0];
    const nextCandidate = nextSession.candidates[nextSession.index];
    expect(nextCandidate.id).toBe('add-1');
    expect(nextCandidate.mergeTargetId).toBe(null);
    expect(nextCandidate.tune.name).toBe('');
    expect(nextCandidate.tune.composer).toBe('');
    expect(nextCandidate.tune.books).toEqual(['songs']);
    expect(nextCandidate.draftFormOverrides).toBeUndefined();
    expect(nextCandidate.fieldChoices).toBeUndefined();
    expect(nextCandidate.pendingInlineSuggestions).toBeUndefined();

    await view.render(Object.assign({}, props, { session: nextSession }));
    expect(view.container.textContent).toContain('Adding Untitled');
    expect(view.container.textContent).not.toContain('Merging into Existing Tune');
    expect(view.container.textContent).not.toContain('Bicycle Race');

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

  test('Cancel shows a warning modal and only discards after confirm', async function() {
    const view = renderModal();
    const onSessionChange = jest.fn();
    const props = buildProps({ onSessionChange: onSessionChange });

    await view.render(props);

    const cancelButton = Array.from(view.container.querySelectorAll('button')).find(function(button) {
      return button.textContent === 'Cancel';
    });
    expect(cancelButton).toBeTruthy();

    await act(async function() {
      cancelButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(onSessionChange).not.toHaveBeenCalled();
    const warning = view.container.querySelector('[data-testid="import-review-cancel-warning"]');
    expect(warning).toBeTruthy();
    expect(warning.textContent).toContain('3');
    expect(warning.textContent).toContain('import request');

    const confirmButton = view.container.querySelector('[data-testid="import-review-cancel-confirm"]');
    expect(confirmButton).toBeTruthy();

    await act(async function() {
      confirmButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(onSessionChange).toHaveBeenCalledTimes(1);
    expect(onSessionChange.mock.calls[0][0].candidates.length).toBe(2);

    await view.unmount();
  });

  test('Cancel warning lists attached audio links that will be discarded', async function() {
    const view = renderModal();
    const session = createImportReviewSession([
      {
        id: 'audio-1',
        sourceKind: 'audio',
        tune: {
          name: 'Uploaded Song',
          composer: 'Artist',
          links: [{
            title: 'Uploaded Song',
            link: 'recording:abc123',
            recordingId: 'abc123',
            source: 'file',
          }],
        },
      },
    ]);
    const props = buildProps({ session: session });

    await view.render(props);

    const cancelButton = Array.from(view.container.querySelectorAll('button')).find(function(button) {
      return button.textContent === 'Cancel';
    });

    await act(async function() {
      cancelButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    const warning = view.container.querySelector('[data-testid="import-review-cancel-warning"]');
    expect(warning).toBeTruthy();
    expect(warning.textContent).toContain('Media and links that will be discarded');
    expect(warning.textContent).toContain('Attached audio: Uploaded Song');

    await view.unmount();
  });

  test('hides Cancel all and Import all when the review list has one item', async function() {
    const view = renderModal();
    const session = createImportReviewSession([
      { id: 'solo', tune: { name: 'Solo', composer: 'One', links: [] } },
    ]);
    const props = buildProps({
      session: session,
      onImportAll: jest.fn(),
    });

    await view.render(props);

    const buttons = Array.from(view.container.querySelectorAll('button')).map(function(button) {
      return button.textContent;
    });
    expect(buttons).toContain('Cancel');
    expect(buttons).toContain('Import');
    expect(buttons).not.toContain('Cancel all');
    expect(buttons).not.toContain('Import all');

    await view.unmount();
  });

  test('Cancel all shows a warning modal and only closes after confirm', async function() {
    const view = renderModal();
    const onClose = jest.fn();
    const props = buildProps({ onClose: onClose });

    await view.render(props);

    const cancelAllButton = Array.from(view.container.querySelectorAll('button')).find(function(button) {
      return button.textContent === 'Cancel all';
    });
    expect(cancelAllButton).toBeTruthy();

    await act(async function() {
      cancelAllButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(onClose).not.toHaveBeenCalled();
    const warning = view.container.querySelector('[data-testid="import-review-cancel-warning"]');
    expect(warning).toBeTruthy();
    expect(warning.textContent).toContain('Cancel all imports?');
    expect(warning.textContent).toContain('3');

    const confirmButton = view.container.querySelector('[data-testid="import-review-cancel-confirm"]');
    await act(async function() {
      confirmButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(onClose).toHaveBeenCalledTimes(1);

    await view.unmount();
  });

  test('Add tunes Cancel clears the session via onClose', async function() {
    const view = renderModal();
    const onClose = jest.fn();
    const onContinueLater = jest.fn();
    const session = createImportReviewSession(
      [createBlankAddCandidate({ book: 'songs', candidateId: 'add-1' })],
      { entryMode: 'add' }
    );
    const props = buildProps({
      session: session,
      currentTuneBook: 'songs',
      onClose: onClose,
      onContinueLater: onContinueLater,
    });

    await view.render(props);

    const cancelButton = view.container.querySelector('[data-testid="add-tunes-cancel"]');
    expect(cancelButton).toBeTruthy();

    await act(async function() {
      cancelButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onContinueLater).not.toHaveBeenCalled();

    await view.unmount();
  });

  test('Add tunes Cancel keeps parked review items and closes via Continue later', async function() {
    const view = renderModal();
    const onClose = jest.fn();
    const onContinueLater = jest.fn();
    const onSessionChange = jest.fn();
    const parked = {
      id: 'review-1',
      tune: { name: 'Prior Tune', composer: 'Someone' },
      sourceKind: 'manual',
      mergeTargetId: null,
    };
    const session = createImportReviewSession(
      [createBlankAddCandidate({ book: 'songs', candidateId: 'add-1' }), parked],
      { entryMode: 'add' }
    );
    const props = buildProps({
      session: session,
      currentTuneBook: 'songs',
      onClose: onClose,
      onContinueLater: onContinueLater,
      onSessionChange: onSessionChange,
    });

    await view.render(props);

    const cancelButton = view.container.querySelector('[data-testid="add-tunes-cancel"]');
    await act(async function() {
      cancelButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(onContinueLater).toHaveBeenCalledTimes(1);
    expect(onSessionChange).toHaveBeenCalled();
    const next = onSessionChange.mock.calls[onSessionChange.mock.calls.length - 1][0];
    expect(next.entryMode).toBe('import');
    expect(next.candidates).toHaveLength(1);
    expect(next.candidates[0].id).toBe('review-1');

    await view.unmount();
  });

  test('dialog close uses Continue later instead of cancelling the import', async function() {
    const view = renderModal();
    const onContinueLater = jest.fn();
    const onClose = jest.fn();
    const props = buildProps({
      embedded: false,
      onContinueLater: onContinueLater,
      onClose: onClose,
    });

    await view.render(props);

    const closeButton = view.container.querySelector('.btn-close');
    expect(closeButton).toBeTruthy();

    await act(async function() {
      closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(onContinueLater).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(view.container.querySelector('[data-testid="import-review-cancel-warning"]')).toBeFalsy();

    await view.unmount();
  });

  test('Import all shows a summary modal and only saves after confirm', async function() {
    const view = renderModal();
    const onImportAll = jest.fn(function(session, done) { done(); });
    const onSessionChange = jest.fn();
    const onComplete = jest.fn();
    const props = buildProps({
      onImportAll: onImportAll,
      onSessionChange: onSessionChange,
      onComplete: onComplete,
    });

    await view.render(props);

    const importAllButton = Array.from(view.container.querySelectorAll('button')).find(function(button) {
      return button.textContent === 'Import all';
    });
    expect(importAllButton).toBeTruthy();

    await act(async function() {
      importAllButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(onImportAll).not.toHaveBeenCalled();
    const warning = view.container.querySelector('[data-testid="import-review-import-all-warning"]');
    expect(warning).toBeTruthy();
    expect(warning.textContent).toContain('Import all?');
    expect(warning.textContent).toContain('3');
    expect(warning.textContent).toContain('Alpha');

    const confirmButton = view.container.querySelector('[data-testid="import-review-import-all-confirm"]');
    await act(async function() {
      confirmButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(onImportAll).toHaveBeenCalledTimes(1);
    expect(onSessionChange).toHaveBeenCalledTimes(1);
    expect(onSessionChange.mock.calls[0][0].step).toBe('done');
    expect(onComplete).toHaveBeenCalledTimes(1);

    await view.unmount();
  });
});