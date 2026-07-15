import { resolveNotationAction } from './notationShortcuts';

describe('notationShortcuts', function() {
  test('maps N to note input toggle', function() {
    expect(resolveNotationAction({ key: 'N', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }, {}).action)
      .toBe('toggleNoteInput');
    expect(resolveNotationAction({ key: 'n', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }, {}).action)
      .toBe('toggleNoteInput');
  });

  test('maps lowercase pitch letters to insert', function() {
    const action = resolveNotationAction({ key: 'c', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }, {});
    expect(action.action).toBe('insertPitch');
    expect(action.letter).toBe('C');
  });

  test('maps Ctrl+C to copy', function() {
    const action = resolveNotationAction({ key: 'c', metaKey: false, ctrlKey: true, shiftKey: false, altKey: false }, {});
    expect(action.action).toBe('copy');
  });

  test('maps Shift+G to chord tone', function() {
    const action = resolveNotationAction({ key: 'G', metaKey: false, ctrlKey: false, shiftKey: true, altKey: false }, {});
    expect(action.action).toBe('addChordTone');
    expect(action.letter).toBe('G');
  });

  test('maps Shift+Arrow to extendSelection', function() {
    expect(resolveNotationAction({ key: 'ArrowRight', metaKey: false, ctrlKey: false, shiftKey: true, altKey: false }, {}))
      .toEqual({ action: 'extendSelection', delta: 1 });
    expect(resolveNotationAction({ key: 'ArrowLeft', metaKey: false, ctrlKey: false, shiftKey: true, altKey: false }, {}))
      .toEqual({ action: 'extendSelection', delta: -1 });
  });

  test('maps Insert and Ctrl+B to insertMeasure', function() {
    expect(resolveNotationAction({ key: 'Insert', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }, {}).action)
      .toBe('insertMeasure');
    expect(resolveNotationAction({ key: 'b', metaKey: false, ctrlKey: true, shiftKey: false, altKey: false }, {}).action)
      .toBe('insertMeasure');
  });

  test('maps J to respellEnharmonic', function() {
    expect(resolveNotationAction({ key: 'j', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }, {}).action)
      .toBe('respellEnharmonic');
  });
});
