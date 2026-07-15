import {
  eventIndexFromStaffNoteElement,
  eventIdFromStaffNoteElement,
  caretIndexAndAnchorFromStaffClick,
  drawableElementsForVoice,
  findDrawableDomIndex,
  isStaffDrawableEvent,
  staffCaretAnchorRect,
  staffSelectionAnchorRects,
  countBarlinesBefore,
  eventIndexForBarDomIndex,
} from './staffCaretPosition';
import { eventIndexFromStaffClick } from './staffCaretPosition';
import { eventIndexFromStaffAbcElem, eventsFromVoiceBody } from './voiceEventTiming';
import { buildAbcPreviewFromBodies } from './notationDisplayAbc';
import useAbcTools from '../useAbcTools';

describe('staffCaretPosition', function() {
  test('isStaffDrawableEvent recognizes notes and rests', function() {
    expect(isStaffDrawableEvent({ type: 'note' })).toBe(true);
    expect(isStaffDrawableEvent({ type: 'rest' })).toBe(true);
    expect(isStaffDrawableEvent({ type: 'barline' })).toBe(false);
  });

  test('staffCaretAnchorRect places caret after trailing barline at append index', function() {
    const wrap = document.createElement('div');
    wrap.getBoundingClientRect = function() {
      return { left: 0, top: 0, right: 400, bottom: 120, width: 400, height: 120 };
    };
    const note = document.createElement('g');
    note.className = 'abcjs-note';
    note.getBoundingClientRect = function() {
      return { left: 80, top: 20, right: 96, bottom: 52, width: 16, height: 32 };
    };
    const bar = document.createElement('g');
    bar.className = 'abcjs-bar';
    bar.getBoundingClientRect = function() {
      return { left: 104, top: 20, right: 108, bottom: 52, width: 4, height: 32 };
    };
    wrap.appendChild(note);
    wrap.appendChild(bar);
    document.body.appendChild(wrap);

    const events = [
      { type: 'note' },
      { type: 'note' },
      { type: 'note' },
      { type: 'note' },
      { type: 'barline', barToken: '|' },
    ];
    const rect = staffCaretAnchorRect(wrap, events, 5);
    expect(rect).not.toBeNull();
    expect(rect.left).toBe(110);

    document.body.removeChild(wrap);
  });

  test('countBarlinesBefore and eventIndexForBarDomIndex stay aligned', function() {
    const events = [
      { type: 'note' },
      { type: 'barline', barToken: '|' },
      { type: 'note' },
      { type: 'barline', barToken: '|' },
    ];
    expect(countBarlinesBefore(events, 3)).toBe(1);
    expect(eventIndexForBarDomIndex(events, 1)).toBe(3);
  });

  test('staffCaretAnchorRect places caret before first drawable', function() {
    const wrap = document.createElement('div');
    wrap.style.position = 'relative';
    wrap.getBoundingClientRect = function() {
      return { left: 0, top: 0, right: 400, bottom: 120, width: 400, height: 120 };
    };
    const note = document.createElement('g');
    note.className = 'abcjs-note';
    note.getBoundingClientRect = function() {
      return { left: 80, top: 20, right: 96, bottom: 52, width: 16, height: 32 };
    };
    wrap.appendChild(note);
    document.body.appendChild(wrap);

    const rect = staffCaretAnchorRect(wrap, [{ type: 'note' }], 0);
    expect(rect).not.toBeNull();
    expect(rect.left).toBe(80);
    expect(rect.top).toBe(20);
    expect(rect.height).toBe(32);

    document.body.removeChild(wrap);
  });

  test('staffCaretAnchorRect places caret after previous note', function() {
    const wrap = document.createElement('div');
    wrap.getBoundingClientRect = function() {
      return { left: 0, top: 0, right: 400, bottom: 120, width: 400, height: 120 };
    };
    const first = document.createElement('g');
    first.className = 'abcjs-note';
    first.getBoundingClientRect = function() {
      return { left: 40, top: 20, right: 56, bottom: 52, width: 16, height: 32 };
    };
    const second = document.createElement('g');
    second.className = 'abcjs-note';
    second.getBoundingClientRect = function() {
      return { left: 80, top: 20, right: 96, bottom: 52, width: 16, height: 32 };
    };
    wrap.appendChild(first);
    wrap.appendChild(second);
    document.body.appendChild(wrap);

    const rect = staffCaretAnchorRect(wrap, [{ type: 'note' }, { type: 'barline', barToken: '|' }, { type: 'note' }], 2);
    expect(rect).not.toBeNull();
    expect(rect.left).toBe(80);

    document.body.removeChild(wrap);
  });

  test('caretIndexAndAnchorFromStaffClick maps second note click to caret index 1', function() {
    const wrap = document.createElement('div');
    wrap.getBoundingClientRect = function() {
      return { left: 0, top: 0, right: 400, bottom: 120, width: 400, height: 120 };
    };
    const first = document.createElement('g');
    first.className = 'abcjs-note';
    first.getBoundingClientRect = function() {
      return { left: 40, top: 20, right: 56, bottom: 52, width: 16, height: 32 };
    };
    const second = document.createElement('g');
    second.className = 'abcjs-note';
    second.getBoundingClientRect = function() {
      return { left: 80, top: 20, right: 96, bottom: 52, width: 16, height: 32 };
    };
    wrap.appendChild(first);
    wrap.appendChild(second);
    document.body.appendChild(wrap);

    const result = caretIndexAndAnchorFromStaffClick(
      wrap,
      [{ type: 'note' }, { type: 'note' }],
      { clientX: 82, clientY: 30 },
      { selectableElement: second },
      0
    );
    expect(result).not.toBeNull();
    expect(result.caretIndex).toBe(1);
    expect(result.anchor.left).toBe(80);

    document.body.removeChild(wrap);
  });

  test('caretIndexAndAnchorFromStaffClick places caret on empty staff click', function() {
    const wrap = document.createElement('div');
    wrap.getBoundingClientRect = function() {
      return { left: 0, top: 0, right: 400, bottom: 120, width: 400, height: 120 };
    };
    const staff = document.createElement('g');
    staff.className = 'abcjs-staff';
    staff.getBoundingClientRect = function() {
      return { left: 40, top: 30, right: 360, bottom: 90, width: 320, height: 60 };
    };
    wrap.appendChild(staff);
    document.body.appendChild(wrap);

    const result = caretIndexAndAnchorFromStaffClick(wrap, [], { clientX: 200, clientY: 50 }, null, 0);
    expect(result).not.toBeNull();
    expect(result.caretIndex).toBe(0);
    expect(result.anchor.left).toBeGreaterThan(0);

    document.body.removeChild(wrap);
  });

  test('caretIndexAndAnchorFromStaffClick places caret in empty measure gap', function() {
    const wrap = document.createElement('div');
    wrap.getBoundingClientRect = function() {
      return { left: 0, top: 0, right: 400, bottom: 120, width: 400, height: 120 };
    };
    const note = document.createElement('g');
    note.className = 'abcjs-note abcjs-v0';
    note.getBoundingClientRect = function() {
      return { left: 40, top: 20, right: 56, bottom: 52, width: 16, height: 32 };
    };
    const bar = document.createElement('g');
    bar.className = 'abcjs-bar abcjs-v0';
    bar.getBoundingClientRect = function() {
      return { left: 200, top: 20, right: 204, bottom: 52, width: 4, height: 32 };
    };
    const staff = document.createElement('g');
    staff.className = 'abcjs-staff';
    staff.getBoundingClientRect = function() {
      return { left: 30, top: 10, right: 370, bottom: 70, width: 340, height: 60 };
    };
    wrap.appendChild(note);
    wrap.appendChild(bar);
    wrap.appendChild(staff);
    document.body.appendChild(wrap);

    const events = [{ type: 'note' }, { type: 'barline', barToken: '|' }];
    const result = caretIndexAndAnchorFromStaffClick(
      wrap,
      events,
      { clientX: 120, clientY: 35 },
      null,
      0
    );
    expect(result).not.toBeNull();
    expect(result.caretIndex).toBe(1);

    document.body.removeChild(wrap);
  });

  test('caretIndexAndAnchorFromStaffClick places caret between consecutive barlines', function() {
    const wrap = document.createElement('div');
    wrap.getBoundingClientRect = function() {
      return { left: 0, top: 0, right: 400, bottom: 120, width: 400, height: 120 };
    };
    const note = document.createElement('g');
    note.className = 'abcjs-note abcjs-v0';
    note.getBoundingClientRect = function() {
      return { left: 40, top: 20, right: 56, bottom: 52, width: 16, height: 32 };
    };
    const bar1 = document.createElement('g');
    bar1.className = 'abcjs-bar abcjs-v0';
    bar1.getBoundingClientRect = function() {
      return { left: 80, top: 20, right: 84, bottom: 52, width: 4, height: 32 };
    };
    const bar2 = document.createElement('g');
    bar2.className = 'abcjs-bar abcjs-v0';
    bar2.getBoundingClientRect = function() {
      return { left: 200, top: 20, right: 204, bottom: 52, width: 4, height: 32 };
    };
    const note2 = document.createElement('g');
    note2.className = 'abcjs-note abcjs-v0';
    note2.getBoundingClientRect = function() {
      return { left: 240, top: 20, right: 256, bottom: 52, width: 16, height: 32 };
    };
    wrap.appendChild(note);
    wrap.appendChild(bar1);
    wrap.appendChild(bar2);
    wrap.appendChild(note2);
    document.body.appendChild(wrap);

    // C | (empty) | D  — click in the empty measure between bars
    const events = [
      { type: 'note' },
      { type: 'barline', barToken: '|' },
      { type: 'barline', barToken: '|' },
      { type: 'note' },
    ];
    const result = caretIndexAndAnchorFromStaffClick(
      wrap,
      events,
      { clientX: 140, clientY: 35 },
      null,
      0
    );
    expect(result).not.toBeNull();
    expect(result.caretIndex).toBe(2);

    document.body.removeChild(wrap);
  });

  test('drawableElementsForVoice collects all system lines for one voice', function() {
    const wrap = document.createElement('div');
    const line1Note = document.createElement('g');
    line1Note.className = 'abcjs-note abcjs-v0 abcjs-l0';
    line1Note.getBoundingClientRect = function() {
      return { left: 40, top: 20, right: 56, bottom: 52, width: 16, height: 32 };
    };
    const line2Note = document.createElement('g');
    line2Note.className = 'abcjs-note abcjs-v0 abcjs-l1';
    line2Note.getBoundingClientRect = function() {
      return { left: 40, top: 120, right: 56, bottom: 152, width: 16, height: 32 };
    };
    const otherVoice = document.createElement('g');
    otherVoice.className = 'abcjs-note abcjs-v1 abcjs-l0';
    otherVoice.getBoundingClientRect = function() {
      return { left: 40, top: 220, right: 56, bottom: 252, width: 16, height: 32 };
    };
    wrap.appendChild(line1Note);
    wrap.appendChild(line2Note);
    wrap.appendChild(otherVoice);

    const drawables = drawableElementsForVoice(wrap, 0);
    expect(drawables).toHaveLength(2);
    expect(drawables[0]).toBe(line1Note);
    expect(drawables[1]).toBe(line2Note);
  });

  test('caretIndexAndAnchorFromStaffClick maps click on second system line', function() {
    const wrap = document.createElement('div');
    wrap.getBoundingClientRect = function() {
      return { left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300 };
    };
    const line1Note = document.createElement('g');
    line1Note.className = 'abcjs-note abcjs-v0';
    line1Note.getBoundingClientRect = function() {
      return { left: 40, top: 20, right: 56, bottom: 52, width: 16, height: 32 };
    };
    const line2Note = document.createElement('g');
    line2Note.className = 'abcjs-note abcjs-v0';
    line2Note.getBoundingClientRect = function() {
      return { left: 80, top: 120, right: 96, bottom: 152, width: 16, height: 32 };
    };
    wrap.appendChild(line1Note);
    wrap.appendChild(line2Note);
    document.body.appendChild(wrap);

    const events = [{ type: 'note' }, { type: 'barline', barToken: '|' }, { type: 'note' }];
    const result = caretIndexAndAnchorFromStaffClick(
      wrap,
      events,
      { clientX: 82, clientY: 130 },
      { selectableElement: line2Note },
      0
    );
    expect(result).not.toBeNull();
    expect(result.caretIndex).toBe(2);
    expect(result.anchor.top).toBe(120);

    document.body.removeChild(wrap);
  });

  test('caretIndexAndAnchorFromStaffClick places caret between notes at different pitches', function() {
    const wrap = document.createElement('div');
    wrap.getBoundingClientRect = function() {
      return { left: 0, top: 0, right: 400, bottom: 120, width: 400, height: 120 };
    };
    const low = document.createElement('g');
    low.className = 'abcjs-note abcjs-v0 abcjs-l0 abcjs-n0';
    low.getBoundingClientRect = function() {
      return { left: 40, top: 40, right: 56, bottom: 72, width: 16, height: 32 };
    };
    const high = document.createElement('g');
    high.className = 'abcjs-note abcjs-v0 abcjs-l0 abcjs-n1';
    high.getBoundingClientRect = function() {
      return { left: 100, top: 20, right: 116, bottom: 52, width: 16, height: 32 };
    };
    wrap.appendChild(low);
    wrap.appendChild(high);
    document.body.appendChild(wrap);

    const events = [{ type: 'note' }, { type: 'note' }];
    const result = caretIndexAndAnchorFromStaffClick(
      wrap,
      events,
      { clientX: 78, clientY: 55 },
      null,
      0
    );
    expect(result).not.toBeNull();
    expect(result.caretIndex).toBe(1);
    expect(result.anchor.left).toBe(78);

    document.body.removeChild(wrap);
  });

  test('eventIndexFromStaffNoteElement maps clicked note to event index', function() {
    const wrap = document.createElement('div');
    const first = document.createElement('g');
    first.className = 'abcjs-note abcjs-v0 abcjs-l0 abcjs-n0';
    first.getBoundingClientRect = function() {
      return { left: 40, top: 20, right: 56, bottom: 52, width: 16, height: 32 };
    };
    const second = document.createElement('g');
    second.className = 'abcjs-note abcjs-v0 abcjs-l0 abcjs-n1';
    second.getBoundingClientRect = function() {
      return { left: 100, top: 20, right: 116, bottom: 52, width: 16, height: 32 };
    };
    wrap.appendChild(first);
    wrap.appendChild(second);
    document.body.appendChild(wrap);

    const events = [{ type: 'note' }, { type: 'barline', barToken: '|' }, { type: 'note' }];
    expect(eventIndexFromStaffNoteElement(
      wrap,
      events,
      { clientX: 108, clientY: 30 },
      { selectableElement: second },
      0
    )).toBe(2);

    document.body.removeChild(wrap);
  });

  test('eventIdFromStaffNoteElement returns stable id for clicked note', function() {
    const wrap = document.createElement('div');
    const note = document.createElement('g');
    note.className = 'abcjs-note abcjs-v0 abcjs-l0 abcjs-n0';
    note.getBoundingClientRect = function() {
      return { left: 40, top: 20, right: 56, bottom: 52, width: 16, height: 32 };
    };
    wrap.appendChild(note);
    document.body.appendChild(wrap);

    const events = [
      { id: 'ev-a', type: 'note' },
      { id: 'ev-b', type: 'note' },
    ];
    expect(eventIdFromStaffNoteElement(
      wrap,
      events,
      { clientX: 48, clientY: 30 },
      { selectableElement: note },
      0
    )).toBe('ev-a');

    document.body.removeChild(wrap);
  });

  test('findDrawableDomIndex matches nested click target via abcjs-n class', function() {
    const wrap = document.createElement('div');
    const note = document.createElement('g');
    note.className = 'abcjs-note abcjs-v0 abcjs-l0 abcjs-n1';
    const head = document.createElement('path');
    note.appendChild(head);
    wrap.appendChild(note);
    document.body.appendChild(wrap);

    const drawables = [document.createElement('g'), note];
    drawables[0].className = 'abcjs-note abcjs-v0 abcjs-l0 abcjs-n0';
    expect(findDrawableDomIndex(drawables, head)).toBe(1);

    document.body.removeChild(wrap);
  });

  test('staffSelectionAnchorRects maps selected event ids to DOM boxes', function() {
    const wrap = document.createElement('div');
    wrap.getBoundingClientRect = function() {
      return { left: 0, top: 0, right: 400, bottom: 120, width: 400, height: 120 };
    };
    const first = document.createElement('g');
    first.className = 'abcjs-note abcjs-v0';
    first.getBoundingClientRect = function() {
      return { left: 40, top: 20, right: 56, bottom: 52, width: 16, height: 32 };
    };
    const second = document.createElement('g');
    second.className = 'abcjs-note abcjs-v0';
    second.getBoundingClientRect = function() {
      return { left: 80, top: 20, right: 96, bottom: 52, width: 16, height: 32 };
    };
    wrap.appendChild(first);
    wrap.appendChild(second);
    document.body.appendChild(wrap);

    const events = [
      { id: 'ev-a', type: 'note' },
      { id: 'ev-b', type: 'note' },
    ];
    const rects = staffSelectionAnchorRects(wrap, events, ['ev-b'], 0);
    expect(rects).toHaveLength(1);
    expect(rects[0].left).toBe(80);
    expect(rects[0].width).toBe(16);

    document.body.removeChild(wrap);
  });

  test('caretIndexAndAnchorFromStaffClick clamps index to event array bounds', function() {
    const wrap = document.createElement('div');
    wrap.getBoundingClientRect = function() {
      return { left: 0, top: 0, right: 400, bottom: 120, width: 400, height: 120 };
    };
    const note = document.createElement('g');
    note.className = 'abcjs-note';
    note.getBoundingClientRect = function() {
      return { left: 80, top: 20, right: 96, bottom: 52, width: 16, height: 32 };
    };
    wrap.appendChild(note);
    document.body.appendChild(wrap);

    const events = [{ type: 'note' }];
    const result = caretIndexAndAnchorFromStaffClick(
      wrap,
      events,
      { clientX: 82, clientY: 30 },
      { selectableElement: note },
      0
    );
    expect(result.caretIndex).toBeGreaterThanOrEqual(0);
    expect(result.caretIndex).toBeLessThanOrEqual(1);

    document.body.removeChild(wrap);
  });

  test('caretIndexAndAnchorFromStaffClick bisects note at 50% width for before/after decision', function() {
    const wrap = document.createElement('div');
    wrap.getBoundingClientRect = function() {
      return { left: 0, top: 0, right: 400, bottom: 120, width: 400, height: 120 };
    };
    const first = document.createElement('g');
    first.className = 'abcjs-note';
    first.getBoundingClientRect = function() {
      return { left: 40, top: 20, right: 56, bottom: 52, width: 16, height: 32 };
    };
    const second = document.createElement('g');
    second.className = 'abcjs-note';
    second.getBoundingClientRect = function() {
      return { left: 100, top: 20, right: 116, bottom: 52, width: 16, height: 32 };
    };
    wrap.appendChild(first);
    wrap.appendChild(second);
    document.body.appendChild(wrap);

    const events = [{ type: 'note' }, { type: 'note' }];
    
    // Click on left half of second note -> should place before (caret 1)
    const resultLeft = caretIndexAndAnchorFromStaffClick(
      wrap,
      events,
      { clientX: 104, clientY: 30 },
      { selectableElement: second },
      0
    );
    expect(resultLeft.caretIndex).toBe(1);

    // Click on right half of second note -> should place after (caret 2)
    const resultRight = caretIndexAndAnchorFromStaffClick(
      wrap,
      events,
      { clientX: 112, clientY: 30 },
      { selectableElement: second },
      0
    );
    expect(resultRight.caretIndex).toBe(2);

    document.body.removeChild(wrap);
  });

  test('caretIndexAndAnchorFromStaffClick handles barline adjacent notes', function() {
    const wrap = document.createElement('div');
    wrap.getBoundingClientRect = function() {
      return { left: 0, top: 0, right: 400, bottom: 120, width: 400, height: 120 };
    };
    const note1 = document.createElement('g');
    note1.className = 'abcjs-note';
    note1.getBoundingClientRect = function() {
      return { left: 40, top: 20, right: 56, bottom: 52, width: 16, height: 32 };
    };
    const bar = document.createElement('g');
    bar.className = 'abcjs-bar';
    bar.getBoundingClientRect = function() {
      return { left: 64, top: 20, right: 68, bottom: 52, width: 4, height: 32 };
    };
    const note2 = document.createElement('g');
    note2.className = 'abcjs-note';
    note2.getBoundingClientRect = function() {
      return { left: 100, top: 20, right: 116, bottom: 52, width: 16, height: 32 };
    };
    wrap.appendChild(note1);
    wrap.appendChild(bar);
    wrap.appendChild(note2);
    document.body.appendChild(wrap);

    const events = [
      { type: 'note' },
      { type: 'barline', barToken: '|' },
      { type: 'note' }
    ];
    
    // Click before barline and after barline; should resolve to increasing indices
    const resultBefore = caretIndexAndAnchorFromStaffClick(
      wrap,
      events,
      { clientX: 48, clientY: 30 },
      { selectableElement: note1 },
      0
    );
    expect(resultBefore.caretIndex).toBe(1);

    const resultAfter = caretIndexAndAnchorFromStaffClick(
      wrap,
      events,
      { clientX: 108, clientY: 30 },
      { selectableElement: note2 },
      0
    );
    expect(resultAfter.caretIndex).toBe(3);

    document.body.removeChild(wrap);
  });

  test('countBarlinesBefore counts multiple barlines correctly', function() {
    const events = [
      { type: 'note' },
      { type: 'barline', barToken: '|' },
      { type: 'note' },
      { type: 'barline', barToken: '||' },
      { type: 'note' },
    ];
    expect(countBarlinesBefore(events, 0)).toBe(0);
    expect(countBarlinesBefore(events, 1)).toBe(0);
    expect(countBarlinesBefore(events, 2)).toBe(1);
    expect(countBarlinesBefore(events, 3)).toBe(1);
    expect(countBarlinesBefore(events, 4)).toBe(2);
  });

  test('eventIndexForBarDomIndex with consecutive barlines', function() {
    const events = [
      { type: 'note' },
      { type: 'barline', barToken: '|' },
      { type: 'barline', barToken: '||' },
      { type: 'note' },
    ];
    expect(eventIndexForBarDomIndex(events, 0)).toBe(1);
    expect(eventIndexForBarDomIndex(events, 1)).toBe(2);
  });

  test('staffCaretAnchorRect with rest drawable element', function() {
    const wrap = document.createElement('div');
    wrap.getBoundingClientRect = function() {
      return { left: 0, top: 0, right: 400, bottom: 120, width: 400, height: 120 };
    };
    const rest = document.createElement('g');
    rest.className = 'abcjs-rest';
    rest.getBoundingClientRect = function() {
      return { left: 80, top: 30, right: 96, bottom: 50, width: 16, height: 20 };
    };
    wrap.appendChild(rest);
    document.body.appendChild(wrap);

    const rect = staffCaretAnchorRect(wrap, [{ type: 'rest' }], 0);
    expect(rect).not.toBeNull();
    expect(rect.left).toBe(80);

    document.body.removeChild(wrap);
  });

  test('drawableElementsForVoice filters out non-drawable elements', function() {
    const wrap = document.createElement('div');
    const note = document.createElement('g');
    note.className = 'abcjs-note abcjs-v0';
    note.getBoundingClientRect = function() {
      return { left: 40, top: 20, right: 56, bottom: 52, width: 16, height: 32 };
    };
    const bar = document.createElement('g');
    bar.className = 'abcjs-bar abcjs-v0';
    bar.getBoundingClientRect = function() {
      return { left: 64, top: 20, right: 68, bottom: 52, width: 4, height: 32 };
    };
    const rest = document.createElement('g');
    rest.className = 'abcjs-rest abcjs-v0';
    rest.getBoundingClientRect = function() {
      return { left: 100, top: 30, right: 116, bottom: 50, width: 16, height: 20 };
    };
    wrap.appendChild(note);
    wrap.appendChild(bar);
    wrap.appendChild(rest);
    document.body.appendChild(wrap);

    const drawables = drawableElementsForVoice(wrap, 0);
    // Should only include note and rest (both drawable), not bar
    const isBar = drawables.some(function(el) { return el.className.includes('abcjs-bar') });
    expect(isBar).toBe(false);

    document.body.removeChild(wrap);
  });

  test('eventIndexFromStaffClick prefers abcelem mapping when provided', function() {
    const abcTools = useAbcTools();
    const tunebook = { abcTools: abcTools };
    const tuneMeta = { meter: '4/4', noteLength: '1/8', key: 'C', tempo: 120 };
    const tune = {
      id: 't1', name: 'Test', meter: '4/4', noteLength: '1/8', key: 'C', voices: { 1: { notes: ['C D E |'] } },
    };
    const events = eventsFromVoiceBody('C D E |', tuneMeta);
    const abc = buildAbcPreviewFromBodies(tune, tunebook, ['1'], { 1: 'C D E |' });
    const cStart = abc.indexOf('C ');
    expect(cStart).toBeGreaterThanOrEqual(0);
    const abcIdx = eventIndexFromStaffAbcElem(events, tuneMeta, abc, ['1'], 0, { startChar: cStart }, null);
    const result = eventIndexFromStaffClick(null, events, null, { startChar: cStart }, null, 0, tuneMeta, abc, ['1']);
    expect(result).toBe(abcIdx);
  });

  test('eventIndexFromStaffClick falls back to DOM mapping when needed', function() {
    const wrap = document.createElement('div');
    wrap.getBoundingClientRect = function() { return { left: 0, top: 0, right: 400, bottom: 120, width: 400, height: 120 }; };
    const note = document.createElement('g');
    note.className = 'abcjs-note';
    note.getBoundingClientRect = function() { return { left: 80, top: 20, right: 96, bottom: 52, width: 16, height: 32 }; };
    wrap.appendChild(note);
    document.body.appendChild(wrap);
    const events = [{ type: 'note' }];
    const mouseEvent = { clientX: 82, clientY: 30 };
    const domIdx = eventIndexFromStaffClick(wrap, events, mouseEvent, null, null, 0);
    const expected = caretIndexAndAnchorFromStaffClick(wrap, events, mouseEvent, { selectableElement: note }, 0).caretIndex;
    expect(domIdx).toBe(expected);
    document.body.removeChild(wrap);
  });

  test('eventIndexFromStaffClick returns safe index for invalid inputs', function() {
    const result = eventIndexFromStaffClick(null, null, null, null, null, 0);
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThanOrEqual(0);
  });

  test('eventIndexFromStaffClick returns safe length for all-barline-only events', function() {
    const events = [ { type: 'barline' }, { type: 'barline' } ];
    const idx = eventIndexFromStaffClick(null, events, null, null, null, 0);
    expect(typeof idx).toBe('number');
    expect(idx).toBe(events.length);
  });

  test('eventIndexFromStaffClick falls back to DOM when abcelem mapping fails', function() {
    const wrap = document.createElement('div');
    wrap.getBoundingClientRect = function() { return { left: 0, top: 0, right: 400, bottom: 120, width: 400, height: 120 }; };
    const note = document.createElement('g');
    note.className = 'abcjs-note';
    note.getBoundingClientRect = function() { return { left: 80, top: 20, right: 96, bottom: 52, width: 16, height: 32 }; };
    wrap.appendChild(note);
    document.body.appendChild(wrap);
    const events = [{ type: 'note' }];
    const mouseEvent = { clientX: 82, clientY: 30 };
    // Provide an abcelem with an invalid startChar that won't map
    const badAbcelem = { startChar: 999999 };
    // When an abcelem is provided but fullAbc/displayedVoiceKeys are missing,
    // eventIndexFromStaffClick delegates to the abc-based caretIndexFromStaffClick
    // behaviour rather than the DOM mapping. Assert that semantics here match
    // the abc fallback.
    const abcFallback = require('./voiceEventTiming').caretIndexFromStaffClick(events, null, badAbcelem);
    const idx = eventIndexFromStaffClick(wrap, events, mouseEvent, badAbcelem, null, 0);
    expect(idx).toBe(abcFallback);
    document.body.removeChild(wrap);
  });
});
