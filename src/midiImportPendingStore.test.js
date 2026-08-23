import {
  beginMidiImportOpen,
  peekMidiImportOptions,
  consumeMidiImportOptions,
  hasMidiImportPending,
  completeMidiImportOpen,
  cancelMidiImportOpen,
  registerMidiImportNavigate,
} from './midiImportPendingStore';

describe('midiImportPendingStore', function() {
  beforeEach(function() {
    registerMidiImportNavigate(null);
    cancelMidiImportOpen(new Error('reset'));
  });

  test('keeps options available across multiple peeks (StrictMode remount)', function() {
    const navigated = [];
    registerMidiImportNavigate(function(path) { navigated.push(path); });
    const file = { name: 'tune.mid' };
    let resolved = null;
    beginMidiImportOpen({ file: file }, function(v) { resolved = v; }, function() {});

    expect(navigated).toEqual(['/import/midi']);
    expect(peekMidiImportOptions()).toEqual({ file: file });
    expect(consumeMidiImportOptions()).toEqual({ file: file });
    // Second read still works — consume must not clear for StrictMode remounts
    expect(peekMidiImportOptions()).toEqual({ file: file });
    expect(hasMidiImportPending()).toBe(true);

    completeMidiImportOpen({ ok: true });
    expect(peekMidiImportOptions()).toBe(null);
    expect(hasMidiImportPending()).toBe(false);
    expect(resolved).toEqual({ ok: true });
  });

  test('cancel clears pending options', function() {
    beginMidiImportOpen({ file: { name: 'a.mid' } }, function() {}, function() {});
    cancelMidiImportOpen(new Error('MIDI import cancelled'));
    expect(peekMidiImportOptions()).toBe(null);
    expect(hasMidiImportPending()).toBe(false);
  });
});
