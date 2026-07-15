import { useRef, useState } from 'react';
import { Button, Dropdown, Form, Modal } from 'react-bootstrap';
import {
  LYRICS_SECTIONS_ICON,
  PANGRAB_ICON,
} from './LyricsSectionsDropdown';
import {
  appendChordsEditorSection,
  reorderChordsEditorSections,
} from '../chordsEditorSections';

/**
 * Sections dropdown for the chords editor — jump, reorder, and add chord blocks.
 * Does not modify lyrics.
 */
export default function ChordSectionsDropdown(props) {
  const sections = Array.isArray(props.sections) ? props.sections : [];
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

  function applySections(next) {
    if (typeof props.onChange === 'function') props.onChange(next);
  }

  function jumpToSection(section) {
    if (typeof props.onJump === 'function') props.onJump(section);
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
    const next = appendChordsEditorSection(sections, name, props.defaultMeter);
    applySections(next);
    setShowAddDialog(false);
    setNewSectionName('');
    window.setTimeout(function() {
      const last = next[next.length - 1];
      if (last && typeof props.onJump === 'function') props.onJump(last);
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
        // ignore
      }
    }
  }

  function insertSlotFromPointer(index, event) {
    const row = event.currentTarget;
    if (!row || typeof row.getBoundingClientRect !== 'function') return index;
    const rect = row.getBoundingClientRect();
    const midY = rect.top + (rect.height / 2);
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
    applySections(reorderChordsEditorSections(sections, from, slot));
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
    applySections(reorderChordsEditorSections(sections, from, sections.length));
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
          if (!next && dragFrom != null) return;
          setShow(!!next);
        }}
        className="lyrics-sections-dropdown chords-sections-dropdown"
      >
        <Dropdown.Toggle
          variant="outline-secondary"
          size={size}
          id={props.id || 'chords-sections-dropdown'}
          title="Chord sections"
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
                key={section.key || ('section-' + index)}
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
                  onMouseDown={function(e) { e.stopPropagation(); }}
                >
                  {pangrabIcon}
                </button>
                <button
                  type="button"
                  className="lyrics-sections-dropdown-link dropdown-item"
                  onClick={function() { jumpToSection(section); }}
                >
                  {section.title}
                  {section.chartRevisit ? (
                    <span className="text-muted small"> (reuse)</span>
                  ) : null}
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
          <Modal.Title>New chord section</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form
            onSubmit={function(e) {
              e.preventDefault();
              confirmAddSection();
            }}
          >
            <Form.Group controlId="chords-new-section-name">
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
            <p className="text-muted small mb-0 mt-2">
              Adds a chord block only. Lyrics are not changed.
            </p>
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
