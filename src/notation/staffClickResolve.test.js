import {
  globalMeasureFromAnalysis,
  isClickResolverV2,
  resolveStaffClick,
  rectForEventIndex,
} from './staffClickResolve';

describe('globalMeasureFromAnalysis', function() {
  test('returns abcjs-mmN class when present', function() {
    const el = { classList: ['abcjs-note', 'abcjs-mm3', 'abcjs-l1'] };
    expect(globalMeasureFromAnalysis({ selectableElement: el, measure: 0 })).toBe(3);
  });

  test('combines line and line-local measure when no mm class', function() {
    const el = { classList: ['abcjs-note', 'abcjs-l2'] };
    expect(globalMeasureFromAnalysis({ selectableElement: el, measure: 1 })).toBe(2001);
  });

  test('returns null when measure missing', function() {
    expect(globalMeasureFromAnalysis({})).toBeNull();
  });
});

describe('resolveStaffClick', function() {
  test('returns safe fallback for empty events', function() {
    const result = resolveStaffClick({
      wrapEl: null,
      events: [],
      mouseEvent: null,
      abcelem: null,
      analysis: null,
      voiceStaffIndex: 0,
      tuneMeta: { meter: '4/4', noteLength: '1/8', key: 'C' },
      fullAbc: '',
      displayedVoiceKeys: ['1'],
    });
    expect(result.caretIndex).toBe(0);
    expect(result.eventIndex).toBe(0);
    expect(result.source).toBe('fallback');
  });

  test('isClickResolverV2 defaults to true', function() {
    const prev = localStorage.getItem('notationClickResolverV2');
    localStorage.removeItem('notationClickResolverV2');
    expect(isClickResolverV2()).toBe(true);
    if (prev != null) localStorage.setItem('notationClickResolverV2', prev);
  });

  test('rectForEventIndex returns null without wrap', function() {
    expect(rectForEventIndex(null, [{ type: 'note' }], 0, 0)).toBeNull();
  });

  test('DOM note hit wins over conflicting startChar for selection', function() {
    const wrap = document.createElement('div');
    wrap.getBoundingClientRect = function() {
      return { left: 0, top: 0, right: 400, bottom: 120, width: 400, height: 120 };
    };
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

    const events = [
      { id: 'a', type: 'note', pitch: { step: 'C', octave: 5 } },
      { id: 'b', type: 'note', pitch: { step: 'D', octave: 5 } },
    ];
    // No startChar on abcelem → DOM hit should select second note.
    const result = resolveStaffClick({
      wrapEl: wrap,
      events: events,
      mouseEvent: { clientX: 108, clientY: 30 },
      abcelem: null,
      analysis: { selectableElement: second },
      voiceStaffIndex: 0,
      tuneMeta: { meter: '4/4', noteLength: '1/4', key: 'C' },
      fullAbc: 'X:1\nK:C\nV:1\nC D |\n',
      displayedVoiceKeys: ['1'],
    });
    expect(result.source).toBe('dom');
    expect(result.eventIndex).toBe(1);
    expect(result.selectedFromNoteHit).toBe(true);

    document.body.removeChild(wrap);
  });

  test('DOM hit overrides startChar when both disagree', function() {
    const wrap = document.createElement('div');
    wrap.getBoundingClientRect = function() {
      return { left: 0, top: 0, right: 400, bottom: 120, width: 400, height: 120 };
    };
    const first = document.createElement('g');
    first.className = 'abcjs-note abcjs-v0 abcjs-l0 abcjs-m0 abcjs-n0';
    first.getBoundingClientRect = function() {
      return { left: 40, top: 20, right: 56, bottom: 52, width: 16, height: 32 };
    };
    const second = document.createElement('g');
    second.className = 'abcjs-note abcjs-v0 abcjs-l0 abcjs-m1 abcjs-n0';
    second.getBoundingClientRect = function() {
      return { left: 100, top: 20, right: 116, bottom: 52, width: 16, height: 32 };
    };
    wrap.appendChild(first);
    wrap.appendChild(second);
    document.body.appendChild(wrap);

    const events = [
      { id: 'a', type: 'note', pitch: { step: 'C', octave: 5 } },
      { id: 'b', type: 'note', pitch: { step: 'D', octave: 5 } },
    ];
    const result = resolveStaffClick({
      wrapEl: wrap,
      events: events,
      mouseEvent: { clientX: 108, clientY: 30 },
      abcelem: { startChar: 10, type: 'note' },
      analysis: { selectableElement: second },
      voiceStaffIndex: 0,
      tuneMeta: { meter: '4/4', noteLength: '1/4', key: 'C' },
      fullAbc: 'X:1\nK:C\nV:1\nC D |\n',
      displayedVoiceKeys: ['1'],
    });
    expect(result.source).toBe('dom');
    expect(result.eventIndex).toBe(1);

    document.body.removeChild(wrap);
  });
});
