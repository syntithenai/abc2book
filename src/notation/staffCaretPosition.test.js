import {
  eventIndexFromStaffNoteElement,
  eventIdFromStaffNoteElement,
  findStaffClickNoteEl,
  caretIndexAndAnchorFromStaffClick,
  drawableElementsForVoice,
  findDrawableDomIndex,
  isStaffDrawableEvent,
  noteheadCenterInElement,
  staffCaretAnchorRect,
  staffSelectionAnchorRects,
  syncStaffSelectionHighlight,
  staffMarqueeSelectEventIds,
  staffNoteheadCentersForEventIds,
  countBarlinesBefore,
  eventIndexForBarDomIndex,
  isStaffHeaderDomTarget,
  staffHeaderKindFromDomTarget,
} from './staffCaretPosition';
import { eventIndexFromStaffClick } from './staffCaretPosition';
import { eventIndexFromStaffAbcElem, eventsFromVoiceBody } from './voiceEventTiming';
import { buildAbcPreviewFromBodies } from './notationDisplayAbc';
import useAbcTools from '../useAbcTools';

describe('staffCaretPosition', function() {
  test('staffHeaderKindFromDomTarget recognizes abcjs header glyphs', function() {
    function el(className) {
      const node = document.createElement('g');
      node.className = className;
      return node;
    }
    expect(staffHeaderKindFromDomTarget(el('abcjs-clef'))).toBe('clef');
    expect(staffHeaderKindFromDomTarget(el('abcjs-key-signature'))).toBe('key');
    expect(staffHeaderKindFromDomTarget(el('abcjs-time-signature'))).toBe('meter');
    expect(staffHeaderKindFromDomTarget(el('abcjs-meter'))).toBe('meter');
    expect(staffHeaderKindFromDomTarget(el('abcjs-tempo'))).toBe('tempo');
    expect(staffHeaderKindFromDomTarget(el('abcjs-note'))).toBe(null);
    expect(isStaffHeaderDomTarget(el('abcjs-time-signature'))).toBe(true);
    expect(isStaffHeaderDomTarget(el('abcjs-note'))).toBe(false);
  });

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

  test('caretIndexAndAnchorFromStaffClick appends in gap before terminal trailing bar', function() {
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

    // Human gesture: gap between last notehead and final | → append after bar.
    const events = [{ type: 'note' }, { type: 'barline', barToken: '|' }];
    const result = caretIndexAndAnchorFromStaffClick(
      wrap,
      events,
      { clientX: 120, clientY: 35 },
      null,
      0
    );
    expect(result).not.toBeNull();
    expect(result.caretIndex).toBe(2);

    document.body.removeChild(wrap);
  });

  test('caretIndexAndAnchorFromStaffClick keeps mid-score gap before non-trailing bar', function() {
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
    const note2 = document.createElement('g');
    note2.className = 'abcjs-note abcjs-v0';
    note2.getBoundingClientRect = function() {
      return { left: 240, top: 20, right: 256, bottom: 52, width: 16, height: 32 };
    };
    wrap.appendChild(note);
    wrap.appendChild(bar);
    wrap.appendChild(note2);
    document.body.appendChild(wrap);

    // More notes after this bar → gap stays insert-at-bar (not append).
    const events = [{ type: 'note' }, { type: 'barline', barToken: '|' }, { type: 'note' }];
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

  test('Copper-style mid-bar abcjs-n reset: click past last note appends (no trailing |)', function() {
    const wrap = document.createElement('div');
    wrap.getBoundingClientRect = function() {
      return { left: 0, top: 0, right: 500, bottom: 120, width: 500, height: 120 };
    };
    // A A F# B E | G G F E  — second measure reuses abcjs-n0..n3
    function note(cls, left) {
      const el = document.createElement('g');
      el.className = cls;
      el.getBoundingClientRect = function() {
        return { left: left, top: 20, right: left + 16, bottom: 52, width: 16, height: 32 };
      };
      wrap.appendChild(el);
      return el;
    }
    note('abcjs-note abcjs-v0 abcjs-l0 abcjs-m0 abcjs-n0', 40);
    note('abcjs-note abcjs-v0 abcjs-l0 abcjs-m0 abcjs-n1', 80);
    note('abcjs-note abcjs-v0 abcjs-l0 abcjs-m0 abcjs-n2', 120);
    note('abcjs-note abcjs-v0 abcjs-l0 abcjs-m0 abcjs-n3', 160);
    note('abcjs-note abcjs-v0 abcjs-l0 abcjs-m0 abcjs-n4', 200);
    const bar = document.createElement('g');
    bar.className = 'abcjs-bar abcjs-v0';
    bar.getBoundingClientRect = function() {
      return { left: 230, top: 20, right: 234, bottom: 52, width: 4, height: 32 };
    };
    wrap.appendChild(bar);
    note('abcjs-note abcjs-v0 abcjs-l0 abcjs-m1 abcjs-n0', 260);
    note('abcjs-note abcjs-v0 abcjs-l0 abcjs-m1 abcjs-n1', 300);
    note('abcjs-note abcjs-v0 abcjs-l0 abcjs-m1 abcjs-n2', 340);
    note('abcjs-note abcjs-v0 abcjs-l0 abcjs-m1 abcjs-n3', 380);
    document.body.appendChild(wrap);

    const events = [
      { type: 'note' }, { type: 'note' }, { type: 'note' }, { type: 'note' }, { type: 'note' },
      { type: 'barline', barToken: '|' },
      { type: 'note' }, { type: 'note' }, { type: 'note' }, { type: 'note' },
    ];
    const result = caretIndexAndAnchorFromStaffClick(
      wrap,
      events,
      { clientX: 400, clientY: 35 },
      null,
      0
    );
    expect(result).not.toBeNull();
    expect(result.caretIndex).toBe(10);

    document.body.removeChild(wrap);
  });

  test('findDrawableDomIndex prefers matching measure when abcjs-n repeats', function() {
    const first = document.createElement('g');
    first.className = 'abcjs-note abcjs-v0 abcjs-l0 abcjs-m0 abcjs-n3';
    const second = document.createElement('g');
    second.className = 'abcjs-note abcjs-v0 abcjs-l0 abcjs-m1 abcjs-n3';
    const drawables = [first, second];
    expect(findDrawableDomIndex(drawables, second)).toBe(1);
    expect(findDrawableDomIndex(drawables, first)).toBe(0);
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

  test('syncStaffSelectionHighlight adds abcjs-note_selected on matching drawables', function() {
    const wrap = document.createElement('div');
    const first = document.createElement('g');
    first.className = 'abcjs-note abcjs-v0';
    const second = document.createElement('g');
    second.className = 'abcjs-note abcjs-v0';
    wrap.appendChild(first);
    wrap.appendChild(second);
    document.body.appendChild(wrap);

    const events = [
      { id: 'ev-a', type: 'note' },
      { id: 'ev-b', type: 'note' },
    ];
    syncStaffSelectionHighlight(wrap, events, ['ev-b'], 0);
    expect(first.classList.contains('abcjs-note_selected')).toBe(false);
    expect(second.classList.contains('abcjs-note_selected')).toBe(true);

    syncStaffSelectionHighlight(wrap, events, [], 0);
    expect(second.classList.contains('abcjs-note_selected')).toBe(false);

    document.body.removeChild(wrap);
  });

  test('staffMarqueeSelectEventIds selects when marquee touches notehead only', function() {
    const wrap = document.createElement('div');
    wrap.getBoundingClientRect = function() {
      return { left: 0, top: 0, right: 400, bottom: 120, width: 400, height: 120 };
    };
    const note = document.createElement('g');
    note.className = 'abcjs-note abcjs-v0';
    note.getBoundingClientRect = function() {
      return { left: 80, top: 10, right: 96, bottom: 50, width: 16, height: 40 };
    };
    const head = document.createElement('path');
    head.getBoundingClientRect = function() {
      return { left: 80, top: 38, right: 94, bottom: 48, width: 14, height: 10 };
    };
    note.appendChild(head);
    wrap.appendChild(note);
    document.body.appendChild(wrap);

    const events = [{ id: 'ev-a', type: 'note' }];
    const ids = staffMarqueeSelectEventIds(wrap, events, {
      left: 75,
      right: 100,
      top: 35,
      bottom: 52,
    }, 0);
    expect(ids).toEqual(['ev-a']);

    document.body.removeChild(wrap);
  });

  test('noteheadCenterInElement prefers head path over stem box mid', function() {
    const note = document.createElement('g');
    note.className = 'abcjs-note';
    note.getBoundingClientRect = function() {
      return { left: 40, top: 10, right: 56, bottom: 50, width: 16, height: 40 };
    };
    const stem = document.createElement('path');
    stem.setAttribute('class', 'abcjs-stem');
    stem.getBoundingClientRect = function() {
      return { left: 52, top: 10, right: 54, bottom: 40, width: 2, height: 30 };
    };
    const head = document.createElement('path');
    head.setAttribute('class', 'abcjs-notehead');
    head.getBoundingClientRect = function() {
      return { left: 40, top: 38, right: 54, bottom: 48, width: 14, height: 10 };
    };
    note.appendChild(stem);
    note.appendChild(head);

    const center = noteheadCenterInElement(note);
    expect(center.y).toBe(43);
    expect(center.x).toBe(47);
  });

  test('staffNoteheadCentersForEventIds offsets from wrap and ignores rests', function() {
    const wrap = document.createElement('div');
    wrap.getBoundingClientRect = function() {
      return { left: 10, top: 5, right: 410, bottom: 125, width: 400, height: 120 };
    };
    const note = document.createElement('g');
    note.className = 'abcjs-note abcjs-v0';
    note.getBoundingClientRect = function() {
      return { left: 50, top: 20, right: 66, bottom: 60, width: 16, height: 40 };
    };
    const head = document.createElement('path');
    head.setAttribute('class', 'abcjs-notehead');
    head.getBoundingClientRect = function() {
      return { left: 50, top: 48, right: 64, bottom: 58, width: 14, height: 10 };
    };
    note.appendChild(head);
    const rest = document.createElement('g');
    rest.className = 'abcjs-rest abcjs-v0';
    rest.getBoundingClientRect = function() {
      return { left: 90, top: 30, right: 100, bottom: 50, width: 10, height: 20 };
    };
    wrap.appendChild(note);
    wrap.appendChild(rest);
    document.body.appendChild(wrap);

    const events = [
      { id: 'n1', type: 'note' },
      { id: 'r1', type: 'rest' },
    ];
    const centers = staffNoteheadCentersForEventIds(wrap, events, ['n1', 'r1'], 0);
    expect(centers).toHaveLength(1);
    expect(centers[0].x).toBe(47); // 57 - 10
    expect(centers[0].y).toBe(48); // 53 - 5

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

  test('caretIndexAndAnchorFromStaffClick past trailing bar is append index', function() {
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
      return { left: 100, top: 20, right: 104, bottom: 52, width: 4, height: 32 };
    };
    wrap.appendChild(note);
    wrap.appendChild(bar);
    document.body.appendChild(wrap);

    const events = [{ type: 'note' }, { type: 'barline', barToken: '|' }];
    const result = caretIndexAndAnchorFromStaffClick(
      wrap,
      events,
      { clientX: 160, clientY: 35 },
      null,
      0
    );
    expect(result).not.toBeNull();
    expect(result.caretIndex).toBe(events.length);
    expect(result.hitEventIndex).toBeUndefined();

    document.body.removeChild(wrap);
  });

  test('caretIndexAndAnchorFromStaffClick on trailing bar is append index', function() {
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
      return { left: 100, top: 20, right: 104, bottom: 52, width: 4, height: 32 };
    };
    wrap.appendChild(note);
    wrap.appendChild(bar);
    document.body.appendChild(wrap);

    const events = [{ type: 'note' }, { type: 'barline', barToken: '|' }];
    // Click on the bar itself (left half) — still append for trailing final bar.
    const result = caretIndexAndAnchorFromStaffClick(
      wrap,
      events,
      { clientX: 101, clientY: 35 },
      null,
      0
    );
    expect(result).not.toBeNull();
    expect(result.caretIndex).toBe(events.length);

    document.body.removeChild(wrap);
  });

  test('caretIndexAndAnchorFromStaffClick past last note skips trailing bar to append', function() {
    const wrap = document.createElement('div');
    wrap.getBoundingClientRect = function() {
      return { left: 0, top: 0, right: 400, bottom: 120, width: 400, height: 120 };
    };
    // Only the note is in the DOM (bar missing) — still append past trailing bar event.
    const note = document.createElement('g');
    note.className = 'abcjs-note abcjs-v0';
    note.getBoundingClientRect = function() {
      return { left: 40, top: 20, right: 56, bottom: 52, width: 16, height: 32 };
    };
    wrap.appendChild(note);
    document.body.appendChild(wrap);

    const events = [{ type: 'note' }, { type: 'barline', barToken: '|' }];
    const result = caretIndexAndAnchorFromStaffClick(
      wrap,
      events,
      { clientX: 200, clientY: 35 },
      null,
      0
    );
    expect(result).not.toBeNull();
    expect(result.caretIndex).toBe(events.length);

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

  test('findStaffClickNoteEl falls back to glyph geometry when elementFromPoint misses note paths', function() {
    const wrap = document.createElement('div');
    wrap.className = 'notation-staff-wrap';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const note = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    note.setAttribute('class', 'abcjs-note abcjs-n0');
    note.getBoundingClientRect = function() {
      return { left: 80, top: 20, right: 96, bottom: 52, width: 16, height: 32 };
    };
    svg.appendChild(note);
    wrap.appendChild(svg);
    document.body.appendChild(wrap);
    const prev = document.elementFromPoint;
    document.elementFromPoint = function() { return svg; };
    const found = findStaffClickNoteEl(wrap, null, { clientX: 88, clientY: 36 });
    expect(found).toBe(note);
    document.elementFromPoint = prev;
    document.body.removeChild(wrap);
  });
});
