import React from 'react';
import { Button, ButtonGroup, Dropdown } from 'react-bootstrap';
import { hasClipboardContent } from '../notation/notationClipboard';

export default function NotationClipboardToolbar(props) {
  const {
    hasSelection,
    clipboardEpoch,
    onCopy,
    onCut,
    onPaste,
    onDelete,
  } = props;

  // clipboardEpoch forces re-read of module clipboard after copy/cut.
  const canPaste = clipboardEpoch >= 0 && hasClipboardContent();
  const canEditSelection = !!hasSelection;

  return (
    <ButtonGroup className="notation-clipboard-toolbar" data-testid="notation-clipboard-toolbar" aria-label="Clipboard">
      <Button
        size="lg"
        variant="outline-secondary"
        disabled={!canEditSelection}
        title="Copy selection (Ctrl+C)"
        aria-label="Copy"
        data-testid="notation-clipboard-copy"
        onClick={onCopy}
      >Copy</Button>
      <Button
        size="lg"
        variant="outline-secondary"
        disabled={!canEditSelection}
        title="Cut selection (Ctrl+X)"
        aria-label="Cut"
        data-testid="notation-clipboard-cut"
        onClick={onCut}
      >Cut</Button>
      <Button
        size="lg"
        variant="outline-secondary"
        disabled={!canPaste}
        title="Paste at caret (Ctrl+V)"
        aria-label="Paste"
        data-testid="notation-clipboard-paste"
        onClick={onPaste}
      >Paste</Button>
      <Button
        size="lg"
        variant="outline-secondary"
        disabled={!canEditSelection}
        title="Delete selection to rests (Delete)"
        aria-label="Delete"
        data-testid="notation-clipboard-delete"
        onClick={onDelete}
      >Del</Button>
      <Dropdown as={ButtonGroup}>
        <Dropdown.Toggle
          split
          size="lg"
          variant="outline-secondary"
          title="More clipboard actions"
          aria-label="More clipboard actions"
          data-testid="notation-clipboard-more"
        />
        <Dropdown.Menu>
          <Dropdown.Item
            disabled={!canEditSelection}
            onClick={props.onSwap}
            data-testid="notation-clipboard-swap"
          >
            Swap with clipboard (Ctrl+Shift+X)
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>
    </ButtonGroup>
  );
}
