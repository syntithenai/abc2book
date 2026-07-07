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

  test('maps Delete forward and Backspace backward', function() {
    expect(resolveNotationAction({ key: 'Delete', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }, {}))
      .toEqual({ action: 'deleteToRest', backward: false });
    expect(resolveNotationAction({ key: 'Backspace', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }, {}))
      .toEqual({ action: 'deleteToRest', backward: true });
  });
});
