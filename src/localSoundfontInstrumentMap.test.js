import {
  LOCAL_INSTRUMENT_PROGRAMS,
  remapFlattenedMidiPrograms,
  remapGmProgramToLocal,
} from './localSoundfontInstrumentMap';

describe('localSoundfontInstrumentMap', function() {
  test('keeps local instruments on their GM programs', function() {
    expect(remapGmProgramToLocal(0)).toBe(LOCAL_INSTRUMENT_PROGRAMS.acoustic_grand_piano);
    expect(remapGmProgramToLocal(21)).toBe(LOCAL_INSTRUMENT_PROGRAMS.accordion);
    expect(remapGmProgramToLocal(25)).toBe(LOCAL_INSTRUMENT_PROGRAMS.acoustic_guitar_steel);
    expect(remapGmProgramToLocal(40)).toBe(LOCAL_INSTRUMENT_PROGRAMS.violin);
    expect(remapGmProgramToLocal(73)).toBe(LOCAL_INSTRUMENT_PROGRAMS.flute);
    expect(remapGmProgramToLocal(108)).toBe(LOCAL_INSTRUMENT_PROGRAMS.fiddle);
  });

  test('maps GM families to closest local stand-ins', function() {
    expect(remapGmProgramToLocal(1)).toBe(0); // bright piano → piano
    expect(remapGmProgramToLocal(19)).toBe(21); // church organ → accordion
    expect(remapGmProgramToLocal(27)).toBe(25); // electric guitar → steel guitar
    expect(remapGmProgramToLocal(33)).toBe(36); // finger bass → slap bass
    expect(remapGmProgramToLocal(41)).toBe(40); // viola → violin
    expect(remapGmProgramToLocal(48)).toBe(61); // string ensemble → brass section
    expect(remapGmProgramToLocal(56)).toBe(61); // trumpet → brass
    expect(remapGmProgramToLocal(66)).toBe(73); // tenor sax → flute
    expect(remapGmProgramToLocal(105)).toBe(25); // banjo → guitar
    expect(remapGmProgramToLocal(122)).toBe(0); // seashore → piano
  });

  test('remaps flattened sequence program and note events', function() {
    const sequence = {
      tracks: [
        [
          { cmd: 'program', channel: 0, instrument: 41 },
          { cmd: 'note', pitch: 60, instrument: 41, start: 0, duration: 0.25, volume: 80 },
        ],
      ],
    };
    remapFlattenedMidiPrograms(sequence);
    expect(sequence.tracks[0][0].instrument).toBe(40);
    expect(sequence.tracks[0][1].instrument).toBe(40);
  });
});
