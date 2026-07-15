import { useRef, useState } from 'react';
import { Button, Dropdown, Form, Modal } from 'react-bootstrap';
import {
  appendLyricSection,
  listLyricSections,
  reorderLyricSections,
  scrollTextareaToLine,
} from '../lyricStructureUtils';

export const LYRICS_SECTIONS_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M0 0h24v24H0z" fill="none" />
    <path fill="currentColor" d="M16 21q-.825 0-1.412-.587T14 19v-4q0-.825.588-1.412T16 13h4q.825 0 1.413.588T22 15v4q0 .825-.587 1.413T20 21zM2 18v-2h9v2zm14-7q-.825 0-1.412-.587T14 9V5q0-.825.588-1.412T16 3h4q.825 0 1.413.588T22 5v4q0 .825-.587 1.413T20 11zM2 8V6h9v2z" />
  </svg>
);

export const PANGRAB_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M0 0h24v24H0z" fill="none" />
    <path fill="currentColor" d="m12 22l-4.25-4.25l1.425-1.425L11 18.15V13H5.875L7.7 14.8l-1.45 1.45L2 12l4.225-4.225L7.65 9.2L5.85 11H11V5.85L9.175 7.675L7.75 6.25L12 2l4.25 4.25l-1.425 1.425L13 5.85V11h5.125L16.3 9.2l1.45-1.45L22 12l-4.25 4.25l-1.425-1.425L18.15 13H13v5.125l1.8-1.825l1.45 1.45z" />
  </svg>
);

function resolveTextarea(textareaRef) {
  if (!textareaRef) return null;
  if (typeof textareaRef === 'function') return null;
  return textareaRef.current || null;
}

export default function LyricsSectionsDropdown(props) {
  const lyricsText = props.lyricsText == null ? '' : String(props.lyricsText);
  const sections = listLyricSections(lyricsText);
  const [show, setShow] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const nameInputRef = useRef(null);
  const icons = (props.tunebook && props.tunebook.icons) || {};
  const sectionsIcon = icons.lyricssections || LYRICS_SECTIONS_ICON;
  const pangrabIcon = icons.pangrab || PANGRAB_ICON;
  const size = props.size || undefined;

  function applyText(nextText) {
    if (typeof props.onChange === 'function') props.onChange(nextText);
  }

  function jumpToSection(section) {
    const textarea = resolveTextarea(props.textareaRef);
    if (textarea) {
      scrollTextareaToLine(textarea, section.startLine);
    }
    setShow(false);
  }

  function openAddDialog(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    setNewSectionName('');
    setShow(false);
    setShowAddDialog(true);
  }

  function confirmAddSection() {
    const name = String(newSectionName || '').trim();
    if (!name) return;
    const next = appendLyricSection(lyricsText, name);
    applyText(next);
    setShowAddDialog(false);
    setNewSectionName('');
    // Scroll to the new section after React updates the textarea value.
    window.setTimeout(function() {
      const textarea = resolveTextarea(props.textareaRef);
      if (!textarea) return;
      const nextSections = listLyricSections(next);
      const last = nextSections[nextSections.length - 1];
      if (last) scrollTextareaToLine(textarea, last.startLine);
    }, 0);
  }

  function onDragStart(index, event) {
    setDragFrom(index);
    setDragOver(index);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      try {
        event.dataTransfer.setData('text/plain', String(index));
      } catch (e) {
        // IE / some browsers are strict about setData.
      }
    }
  }

  function insertSlotFromPointer(index, event) {
    const row = event.currentTarget;
    if (!row || typeof row.getBoundingClientRect !== 'function') return index;
    const rect = row.getBoundingClientRect();
    const midY = rect.top + (rect.height / 2);
    // Top half → insert before this row; bottom half → insert after.
    return event.clientY < midY ? index : index + 1;
  }

  function onDragOverItem(index, event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const slot = insertSlotFromPointer(index, event);
    if (dragOver !== slot) setDragOver(slot);
  }

  function onDropItem(index, event) {
    event.preventDefault();
    event.stopPropagation();
    const from = dragFrom;
    const slot = insertSlotFromPointer(index, event);
    setDragFrom(null);
    setDragOver(null);
    if (from == null) return;
    applyText(reorderLyricSections(lyricsText, from, slot));
  }

  function onDragOverEndZone(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const slot = sections.length;
    if (dragOver !== slot) setDragOver(slot);
  }

  function onDropEndZone(event) {
    event.preventDefault();
    event.stopPropagation();
    const from = dragFrom;
    setDragFrom(null);
    setDragOver(null);
    if (from == null) return;
    applyText(reorderLyricSections(lyricsText, from, sections.length));
  }

  function onDragEnd() {
    setDragFrom(null);
    setDragOver(null);
  }

  return (
    <>
      <Dropdown
        show={show}
        onToggle={function(next) {
          // Keep the menu open while a section drag is in progress.
          if (!next && dragFrom != null) return;
          setShow(!!next);
        }}
        className="lyrics-sections-dropdown"
      >
        <Dropdown.Toggle
          variant="outline-secondary"
          size={size}
          id={props.id || 'lyrics-sections-dropdown'}
          title="Lyrics sections"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35em' }}
        >
          <span className="lyrics-sections-dropdown-icon" style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1 }}>
            {sectionsIcon}
          </span>
          Sections
        </Dropdown.Toggle>
        <Dropdown.Menu className="lyrics-sections-dropdown-menu" style={{ minWidth: '16rem' }}>
          <Dropdown.Item
            as="button"
            type="button"
            className="lyrics-sections-dropdown-new"
            onClick={openAddDialog}
          >
            + New section
          </Dropdown.Item>
          {sections.length > 0 ? <Dropdown.Divider /> : null}
          {sections.length === 0 ? (
            <Dropdown.ItemText className="text-muted small">No sections detected</Dropdown.ItemText>
          ) : null}
          {sections.map(function(section, index) {
            const isDragging = dragFrom === index;
            const showInsertBefore = dragFrom != null
              && dragOver === index
              && dragOver !== dragFrom
              && dragOver !== dragFrom + 1;
            return (
              <div
                key={'section-' + index + '-' + section.startLine}
                className={
                  'lyrics-sections-dropdown-item'
                  + (isDragging ? ' is-dragging' : '')
                  + (showInsertBefore ? ' is-drag-over-before' : '')
                }
                onDragOver={function(e) { onDragOverItem(index, e); }}
                onDrop={function(e) { onDropItem(index, e); }}
              >
                <button
                  type="button"
                  className="lyrics-sections-dropdown-drag"
                  title="Drag to reorder section"
                  aria-label={'Reorder ' + section.title}
                  draggable
                  onDragStart={function(e) { onDragStart(index, e); }}
                  onDragEnd={onDragEnd}
                  onClick={function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onMouseDown={function(e) {
                    // Keep the dropdown open while starting a drag.
                    e.stopPropagation();
                  }}
                >
                  {pangrabIcon}
                </button>
                <button
                  type="button"
                  className="lyrics-sections-dropdown-link dropdown-item"
                  onClick={function() { jumpToSection(section); }}
                >
                  {section.title}
                </button>
              </div>
            );
          })}
          {sections.length > 0 ? (
            <div
              className={
                'lyrics-sections-dropdown-end-zone'
                + (dragFrom != null && dragOver === sections.length ? ' is-drag-over-before' : '')
              }
              onDragOver={onDragOverEndZone}
              onDrop={onDropEndZone}
              aria-hidden="true"
            />
          ) : null}
        </Dropdown.Menu>
      </Dropdown>

      <Modal
        show={showAddDialog}
        onHide={function() { setShowAddDialog(false); }}
        centered
        onEntered={function() {
          if (nameInputRef.current) nameInputRef.current.focus();
        }}
      >
        <Modal.Header closeButton>
          <Modal.Title>New lyrics section</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form
            onSubmit={function(e) {
              e.preventDefault();
              confirmAddSection();
            }}
          >
            <Form.Group controlId="lyrics-new-section-name">
              <Form.Label>Section name</Form.Label>
              <Form.Control
                ref={nameInputRef}
                type="text"
                value={newSectionName}
                placeholder="e.g. Verse 2, Chorus, Bridge"
                onChange={function(e) { setNewSectionName(e.target.value); }}
                autoComplete="off"
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={function() { setShowAddDialog(false); }}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!String(newSectionName || '').trim()}
            onClick={confirmAddSection}
          >
            Add section
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
