/**
 * @jest-environment jsdom
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import DuplicateMergeModal from './DuplicateMergeModal';
import { buildAbcFromTune } from './SuggestionPreviewDialog';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('./TuneSingleViewDialog', function() {
  const React = require('react');
  return {
    __esModule: true,
    default: function TuneSingleViewDialog(props) {
      if (!props.show) return null;
      return React.createElement('div', {
        'data-testid': 'tune-single-view-dialog',
        'data-tune-id': props.tune && props.tune.id ? props.tune.id : '',
      });
    },
  };
});

jest.mock('abcjs', function() {
  return { renderAbc: jest.fn() };
});

jest.mock('./SuggestionPreviewDialog', function() {
  const React = require('react');
  return {
    buildAbcFromTune: jest.fn(function(tune) {
      if (!tune || !tune.voices) return '';
      const voice = tune.voices['1'];
      const line = voice && Array.isArray(voice.notes) ? voice.notes[0] : '';
      return line ? 'ABC:' + line : '';
    }),
    NotationPreview: function NotationPreview(props) {
      return React.createElement('div', {
        'data-testid': 'notation-preview',
        'data-abc': props.abc || '',
      });
    },
  };
});

jest.mock('react-bootstrap', function() {
  const React = require('react');
  function Modal(props) {
    if (!props.show) return null;
    return React.createElement('div', { 'data-testid': 'duplicate-merge-modal' }, props.children);
  }
  Modal.Header = function Header(props) {
    return React.createElement('div', null, props.children);
  };
  Modal.Title = function Title(props) {
    return React.createElement('h2', null, props.children);
  };
  Modal.Body = function Body(props) {
    return React.createElement('div', null, props.children);
  };
  Modal.Footer = function Footer(props) {
    return React.createElement('div', null, props.children);
  };
  function Button(props) {
    return React.createElement('button', { type: 'button', onClick: props.onClick }, props.children);
  }
  function Alert(props) {
    return React.createElement('div', { 'data-testid': props['data-testid'] }, props.children);
  }
  const Form = {
    Group: function Group(props) {
      return React.createElement('div', null, props.children);
    },
    Label: function Label(props) {
      return React.createElement('label', null, props.children);
    },
    Check: function Check(props) {
      return React.createElement('input', {
        type: props.type || 'checkbox',
        checked: !!props.checked,
        onChange: props.onChange,
      });
    },
  };
  function Nav(props) {
    return React.createElement('nav', null, props.children);
  }
  Nav.Item = function Item(props) {
    return React.createElement('div', null, props.children);
  };
  Nav.Link = function Link() {
    return null;
  };
  const Tab = {
    Container: function Container(props) {
      return React.createElement('div', null, props.children);
    },
  };
  function Table(props) {
    return React.createElement('table', null, props.children);
  }
  Table.thead = 'thead';
  Table.tbody = 'tbody';
  return { Modal: Modal, Button: Button, Alert: Alert, Form: Form, Nav: Nav, Tab: Tab, Table: Table };
});

describe('DuplicateMergeModal notation preview', function() {
  let container;
  let root;

  beforeEach(function() {
    jest.useFakeTimers();
    jest.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(function() {
    act(function() { root.unmount(); });
    container.remove();
    jest.useRealTimers();
  });

  function renderModal(group, tunes, extraProps) {
    act(function() {
      root.render(
        React.createElement(DuplicateMergeModal, Object.assign({
          show: true,
          group: group,
          tunes: tunes,
          onClose: jest.fn(),
          onConfirm: jest.fn(),
          onKeepSeparate: jest.fn(),
        }, extraProps || {}))
      );
    });
    act(function() {
      jest.runAllTimers();
    });
  }

  test('shows side-by-side notation previews when voices differ', function() {
    const group = {
      id: 'similar:a,b',
      label: 'Test Song',
      tuneIds: ['a', 'b'],
      tunes: [
        { id: 'a', tune: { id: 'a', name: 'Test Song', voices: { '1': { notes: ['C D |'] } } } },
        { id: 'b', tune: { id: 'b', name: 'Test Song', voices: { '1': { notes: ['E F |'] } } } },
      ],
    };
    const tunes = {
      a: group.tunes[0].tune,
      b: group.tunes[1].tune,
    };

    renderModal(group, tunes);

    const preview = container.querySelector('[data-testid="duplicate-merge-notation-preview"]');
    expect(preview).toBeTruthy();
    expect(container.querySelectorAll('[data-testid="notation-preview"]')).toHaveLength(2);
    expect(buildAbcFromTune.mock.calls.length).toBeGreaterThanOrEqual(2);
    const noteLines = buildAbcFromTune.mock.calls.map(function(call) {
      const tune = call[0];
      const voice = tune && tune.voices && tune.voices['1'];
      return voice && Array.isArray(voice.notes) ? voice.notes[0] : '';
    });
    expect(noteLines).toContain('C D |');
    expect(noteLines).toContain('E F |');
  });

  test('hides notation preview when voices match', function() {
    const sharedVoices = { '1': { notes: ['C D |'] } };
    const group = {
      id: 'similar:a,b',
      label: 'Test Song',
      tuneIds: ['a', 'b'],
      tunes: [
        { id: 'a', tune: { id: 'a', name: 'Test Song', composer: 'Alice', voices: sharedVoices } },
        { id: 'b', tune: { id: 'b', name: 'Test Song', composer: 'Bob', voices: sharedVoices } },
      ],
    };
    const tunes = {
      a: group.tunes[0].tune,
      b: group.tunes[1].tune,
    };

    renderModal(group, tunes);

    expect(container.querySelector('[data-testid="duplicate-merge-notation-preview"]')).toBeFalsy();
    expect(container.querySelector('[data-testid="duplicate-merge-notation-identical"]')).toBeTruthy();
  });

  test('open tune button opens single view dialog', function() {
    const group = {
      id: 'similar:a,b',
      label: 'Test Song',
      tuneIds: ['a', 'b'],
      tunes: [
        { id: 'a', tune: { id: 'a', name: 'Tune A', voices: { '1': { notes: ['C D |'] } } } },
        { id: 'b', tune: { id: 'b', name: 'Tune B', voices: { '1': { notes: ['C D |'] } } } },
      ],
    };
    const tunes = {
      a: group.tunes[0].tune,
      b: group.tunes[1].tune,
    };

    renderModal(group, tunes);

    expect(container.querySelector('[data-testid="tune-single-view-dialog"]')).toBeFalsy();
    const openButtons = Array.from(container.querySelectorAll('button')).filter(function(btn) {
      return btn.textContent === 'Open tune';
    });
    expect(openButtons).toHaveLength(2);
    act(function() {
      openButtons[1].click();
    });
    const dialog = container.querySelector('[data-testid="tune-single-view-dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('data-tune-id')).toBe('b');
  });
});
