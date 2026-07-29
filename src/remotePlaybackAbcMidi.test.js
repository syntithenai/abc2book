import { buildAbcMidiSessionFields, exportAbcMidiBase64 } from './remotePlaybackAbcMidi';

describe('remotePlaybackAbcMidi', function() {
  test('exportAbcMidiBase64 uses tunebook getMidiData', function() {
    const tune = { id: 't1', name: 'Test' };
    const tunebook = {
      getMidiData: function() { return new Uint8Array([0x4d, 0x54, 0x68, 0x64]); },
    };
    const encoded = exportAbcMidiBase64(tune, tunebook);
    expect(encoded).toBeTruthy();
    const fields = buildAbcMidiSessionFields(tune, tunebook);
    expect(fields.sourceType).toBe('abc-midi');
    expect(fields.midiBase64).toBe(encoded);
  });
});
