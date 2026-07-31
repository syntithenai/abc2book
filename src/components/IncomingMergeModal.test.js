/**
 * @jest-environment jsdom
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import IncomingMergeModal from './IncomingMergeModal';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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
    return React.createElement('div', { 'data-testid': 'incoming-merge-modal' }, props.children);
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
  function Badge(props) {
    return React.createElement('span', null, props.children);
  }
  const Form = {
    Check: function Check() {
      return React.createElement('input', { type: 'checkbox' });
    },
  };
  function Table(props) {
    return React.createElement('table', null, props.children);
  }
  Table.displayName = 'Table';
  return { Modal, Button, Alert, Badge, Form, Table };
});

jest.mock('./SelectAllToggle', function() {
  const React = require('react');
  return {
    __esModule: true,
    default: function SelectAllToggle() {
      return React.createElement('div', { 'data-testid': 'select-all-toggle' });
    },
  };
});

jest.mock('./CheckToggleButton', function() {
  const React = require('react');
  return {
    __esModule: true,
    default: function CheckToggleButton() {
      return React.createElement('button', { type: 'button' });
    },
  };
});

function makeTune(id, name, notesLine, lastUpdated) {
  return {
    id: id,
    name: name,
    lastUpdated: lastUpdated,
    voices: {
      '1': { notes: [notesLine] },
    },
  };
}

describe('IncomingMergeModal notation preview', function() {
  let container;
  let root;

  beforeEach(function() {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(function() {
    act(function() { root.unmount(); });
    container.remove();
  });

  test('shows side-by-side notation previews when voices differ', function() {
    const batch = {
      kind: 'drive',
      sourceLabel: 'Google Drive tunebook',
      summary: '1 to update',
      records: [{
        id: 't1',
        kind: 'update',
        label: 'Copper Kettle',
        localTune: makeTune('t1', 'Copper Kettle', 'CDEF|', 1000),
        incomingTune: makeTune('t1', 'Copper Kettle', 'GABc|', 2000),
      }],
    };

    act(function() {
      root.render(React.createElement(IncomingMergeModal, {
        show: true,
        batch: batch,
        onApply: function() {},
        onReject: function() {},
        onClose: function() {},
      }));
    });

    const preview = container.querySelector('[data-testid="incoming-merge-notation-preview"]');
    expect(preview).toBeTruthy();
    expect(container.querySelectorAll('[data-testid="notation-preview"]')).toHaveLength(2);
    expect(preview.textContent).toMatch(/Incoming copy is newer/);
  });

  test('hides notation preview when voices match', function() {
    const batch = {
      kind: 'drive',
      sourceLabel: 'Google Drive tunebook',
      summary: '1 to update',
      records: [{
        id: 't1',
        kind: 'update',
        label: 'Copper Kettle',
        localTune: makeTune('t1', 'Copper Kettle', 'CDEF|', 1000),
        incomingTune: makeTune('t1', 'Copper Kettle', 'CDEF|', 2000),
      }],
    };

    act(function() {
      root.render(React.createElement(IncomingMergeModal, {
        show: true,
        batch: batch,
        onApply: function() {},
        onReject: function() {},
        onClose: function() {},
      }));
    });

    expect(container.querySelector('[data-testid="incoming-merge-notation-preview"]')).toBeFalsy();
    expect(container.querySelector('[data-testid="incoming-merge-notation-identical"]')).toBeTruthy();
  });
});
