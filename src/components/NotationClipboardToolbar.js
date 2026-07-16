import React from 'react';
import { Button, ButtonGroup, Dropdown } from 'react-bootstrap';
import { hasClipboardContent } from '../notation/notationClipboard';

const ACTIONS = [
  {
    key: 'copy',
    title: 'Copy selection (Ctrl+C)',
    ariaLabel: 'Copy',
    testId: 'notation-clipboard-copy',
    needsSelection: true,
    needsClipboard: false,
    iconKey: 'filecopyline',
    fallback: '⧉',
    handler: 'onCopy',
  },
  {
    key: 'cut',
    title: 'Cut selection (Ctrl+X)',
    ariaLabel: 'Cut',
    testId: 'notation-clipboard-cut',
    needsSelection: true,
    needsClipboard: false,
    iconKey: 'scissors',
    fallback: '✂',
    handler: 'onCut',
  },
  {
    key: 'paste',
    title: 'Paste at caret (Ctrl+V)',
    ariaLabel: 'Paste',
    testId: 'notation-clipboard-paste',
    needsSelection: false,
    needsClipboard: true,
    iconKey: 'paste',
    fallback: '📋',
    handler: 'onPaste',
  },
  {
    key: 'delete',
    title: 'Delete selection to rests (Delete)',
    ariaLabel: 'Delete',
    testId: 'notation-clipboard-delete',
    needsSelection: true,
    needsClipboard: false,
    iconKey: 'deletebin',
    fallback: '🗑',
    handler: 'onDelete',
  },
  {
    key: 'swap',
    title: 'Swap with clipboard (Ctrl+Shift+X)',
    ariaLabel: 'Swap with clipboard',
    testId: 'notation-clipboard-swap',
    needsSelection: true,
    needsClipboard: false,
    iconKey: 'swap',
    fallback: '⇄',
    handler: 'onSwap',
  },
];

export default function NotationClipboardToolbar(props) {
  const {
    hasSelection,
    clipboardEpoch,
    tunebook,
    expanded,
  } = props;

  const canPaste = clipboardEpoch >= 0 && hasClipboardContent();
  const canEditSelection = !!hasSelection;
  const icons = (tunebook && tunebook.icons) || {};
  const showExpanded = expanded !== false;

  function isDisabled(action) {
    if (action.needsClipboard && !canPaste) return true;
    if (action.needsSelection && !canEditSelection) return true;
    return false;
  }

  function iconFor(action) {
    return icons[action.iconKey] || action.fallback;
  }

  function run(action) {
    const fn = props[action.handler];
    if (typeof fn === 'function') fn();
  }

  if (!showExpanded) {
    return (
      <Dropdown as={ButtonGroup} className="notation-clipboard-toolbar notation-clipboard-compact">
        <Dropdown.Toggle
          size="lg"
          variant="outline-secondary"
          title="Clipboard"
          aria-label="Clipboard"
          data-testid="notation-clipboard-menu"
        >
          {icons.filecopyline || '⧉'}
        </Dropdown.Toggle>
        <Dropdown.Menu>
          {ACTIONS.map(function(action) {
            return (
              <Dropdown.Item
                key={action.key}
                disabled={isDisabled(action)}
                title={action.title}
                data-testid={action.testId}
                onClick={function() { run(action); }}
              >
                <span className="notation-clipboard-menu-icon" aria-hidden="true">
                  {iconFor(action)}
                </span>
                {' '}{action.ariaLabel}
              </Dropdown.Item>
            );
          })}
        </Dropdown.Menu>
      </Dropdown>
    );
  }

  return (
    <ButtonGroup className="notation-clipboard-toolbar" data-testid="notation-clipboard-toolbar" aria-label="Clipboard">
      {ACTIONS.map(function(action) {
        return (
          <Button
            key={action.key}
            size="lg"
            variant="outline-secondary"
            className="notation-clipboard-icon-btn"
            disabled={isDisabled(action)}
            title={action.title}
            aria-label={action.ariaLabel}
            data-testid={action.testId}
            onClick={function() { run(action); }}
          >
            {iconFor(action)}
          </Button>
        );
      })}
    </ButtonGroup>
  );
}
