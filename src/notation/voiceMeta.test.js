import {
  parseVoiceMeta,
  formatVoiceMeta,
  defaultVoiceMeta,
  voiceMetaToAbcString,
  isMidiProgramLine,
  parseMidiProgramFromNotes,
  setMidiProgramInNotes,
  stripMidiProgramFromNotes,
  withMidiProgramPrefix,
  instrumentNameToMidiProgram,
  midiProgramToInstrumentName,
} from './voiceMeta';

describe('voiceMeta', function() {
  test('parseVoiceMeta extracts name, clef, and extra attrs', function() {
    expect(parseVoiceMeta('Piano clef=bass stem=up')).toEqual({
      name: 'Piano',
      clef: 'bass',
      extra: 'stem=up',
    });
  });

  test('parseVoiceMeta defaults clef to treble', function() {
    expect(parseVoiceMeta('Melody')).toEqual({
      name: 'Melody',
      clef: 'treble',
      extra: '',
    });
  });

  test('parseVoiceMeta treats xml2abc bare bass token as clef', function() {
    expect(parseVoiceMeta('bass nm="Piano"')).toEqual({
      name: 'Piano',
      clef: 'bass',
      extra: '',
    });
  });

  test('parseVoiceMeta keeps Bass as a name when clef= is present', function() {
    expect(parseVoiceMeta('Bass clef=bass')).toEqual({
      name: 'Bass',
      clef: 'bass',
      extra: '',
    });
  });

  test('formatVoiceMeta always writes clef', function() {
    expect(formatVoiceMeta({ name: 'Voice 2', clef: 'alto' })).toBe('Voice 2 clef=alto');
    expect(defaultVoiceMeta('Voice 1')).toBe('Voice 1 clef=treble');
  });

  test('voiceMetaToAbcString coerces object meta', function() {
    expect(voiceMetaToAbcString({ name: 'Melody', clef: 'treble' })).toBe('Melody clef=treble');
    expect(voiceMetaToAbcString('Bass clef=bass')).toBe('Bass clef=bass');
  });

  test('round-trips name and clef', function() {
    const formatted = formatVoiceMeta({ name: 'Cello', clef: 'bass', extra: 'stem=down' });
    expect(parseVoiceMeta(formatted)).toEqual({
      name: 'Cello',
      clef: 'bass',
      extra: 'stem=down',
    });
  });

  test('MIDI program helpers peel and rewrite notes', function() {
    expect(isMidiProgramLine('%%MIDI program 0')).toBe(true);
    expect(isMidiProgramLine('C D E F |')).toBe(false);
    expect(parseMidiProgramFromNotes(['%%MIDI program 40', 'CDEF'])).toBe(40);
    expect(setMidiProgramInNotes(['%%MIDI program 0', 'C'], 73)).toEqual([
      '%%MIDI program 73',
      'C',
    ]);
    expect(stripMidiProgramFromNotes(['%%MIDI program 12', 'z4'])).toEqual(['z4']);
    expect(withMidiProgramPrefix('C D E', 0)).toBe('%%MIDI program 0\nC D E');
  });

  test('instrument name ↔ program', function() {
    expect(midiProgramToInstrumentName(40)).toBe('violin');
    expect(instrumentNameToMidiProgram('flute')).toBe(73);
  });
});
