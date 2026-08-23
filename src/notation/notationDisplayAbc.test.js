/* eslint-disable react-hooks/rules-of-hooks */
import useAbcTools from '../useAbcTools';
import {
  applyStaffChordDisplayPolicy,
  buildAbcPreviewFromBodies,
  mapAbcClickToVoiceCursor,
  prepareGigStaffDisplayAbc,
  prepareTuneViewNotationAbc,
  stripAbcMidiTransposeDirectives,
  stripBlockLyricsFromDisplayAbc,
  stripNotationDisplayMetadata,
  stripStaffNotationHeaders,
} from './notationDisplayAbc';

describe('stripNotationDisplayMetadata', function() {
  test('removes background info H: lines from rendered ABC', function() {
    const abc = [
      'X:1',
      'T:Test',
      'H:Some history line',
      'h:lowercase history',
      'K:C',
      'CDEF |',
    ].join('\n');
    const stripped = stripNotationDisplayMetadata(abc);
    expect(stripped).not.toMatch(/^H:/m);
    expect(stripped).not.toMatch(/^h:/m);
    expect(stripped).toMatch(/CDEF/);
  });

  test('keeps only the first C: composer line for notation display', function() {
    const abc = [
      'X:1',
      'T:Test',
      'C:Composer One',
      'C:Performer Two',
      'C:Another Artist',
      'K:C',
      'CDEF |',
    ].join('\n');
    const stripped = stripNotationDisplayMetadata(abc);
    expect(stripped).toContain('C:Composer One');
    expect(stripped).not.toContain('C:Performer Two');
    expect(stripped).not.toContain('C:Another Artist');
    expect(stripped).toMatch(/CDEF/);
  });

  test('strips playalong take comments so saving a take does not reprime notation', function() {
    const abc = [
      'X:1',
      'T:Test',
      'K:C',
      'CDEF |',
      '% abcbook-playalong-take-0 {"recordingId":"abc"}',
    ].join('\n');
    const stripped = stripNotationDisplayMetadata(abc);
    expect(stripped).toMatch(/CDEF/);
    expect(stripped).not.toContain('abcbook-playalong-take');
  });
});

describe('stripBlockLyricsFromDisplayAbc', function() {
  test('keeps note-aligned w: and drops block W:', function() {
    const abc = [
      'X:1',
      'T:Test',
      'K:C',
      'C D E |',
      'w: Hel- lo world',
      'W: Block lyrics here',
    ].join('\n');
    const stripped = stripBlockLyricsFromDisplayAbc(abc);
    expect(stripped).toMatch(/^w: Hel- lo world$/m);
    expect(stripped).not.toMatch(/^W:/m);
  });
});

describe('buildAbcPreviewFromBodies', function() {
  const abcTools = useAbcTools();
  const tunebook = { abcTools: abcTools };
  const tune = {
    id: 't1',
    name: 'Test',
    meter: '4/4',
    noteLength: '1/8',
    key: 'C',
    voices: {
      1: { meta: 'Melody', notes: ['CDEF |'] },
      2: { meta: 'Bass', notes: ['C,2 E,2 |'] },
    },
  };

  test('remaps a non-first voice so abcjs can render after K:', function() {
    const abc = buildAbcPreviewFromBodies(tune, tunebook, ['2'], { 2: 'G,2 B,2 |' });
    expect(abc).toMatch(/K:C/);
    expect(abc).toMatch(/V:1/);
    expect(abc).not.toMatch(/V:2/);
    expect(abc).toMatch(/G,2 B,2/);
  });

  test('keeps multiple selected voices in order as V:1, V:2', function() {
    const abc = buildAbcPreviewFromBodies(tune, tunebook, ['1', '2'], {
      1: 'CDEF |',
      2: 'C,2 E,2 |',
    });
    expect(abc).toMatch(/V:1.*Melody/s);
    expect(abc).toMatch(/V:2.*Bass/s);
    expect(abc).toMatch(/CDEF/);
    expect(abc).toMatch(/C,2 E,2/);
  });

  test('preserves caller voice key order instead of sorting keys', function() {
    const scratchTune = Object.assign({}, tune, {
      voices: {
        V: { meta: 'Lead', notes: ['CDEF |'] },
        2: { meta: 'Bass', notes: ['C,2 E,2 |'] },
      },
    });
    const abc = buildAbcPreviewFromBodies(scratchTune, tunebook, ['V', '2'], {
      V: 'CDEF |',
      2: 'C,2 E,2 |',
    });
    const v1 = abc.indexOf('V:1');
    const v2 = abc.indexOf('V:2');
    const lead = abc.indexOf('CDEF');
    const bass = abc.indexOf('C,2 E,2');
    expect(v1).toBeGreaterThan(-1);
    expect(v2).toBeGreaterThan(v1);
    expect(lead).toBeGreaterThan(v1);
    expect(bass).toBeGreaterThan(v2);
  });

  test('mapAbcClickToVoiceCursor maps into the correct voice body', function() {
    const abc = buildAbcPreviewFromBodies(tune, tunebook, ['1', '2'], {
      1: 'CDEF |',
      2: 'C,2 E,2 |',
    });
    const melodyStart = abc.indexOf('CDEF |');
    const bassStart = abc.indexOf('C,2 E,2 |');
    expect(mapAbcClickToVoiceCursor(abc, ['1', '2'], 0, melodyStart)).toEqual({
      voiceKey: '1',
      offset: 0,
    });
    expect(mapAbcClickToVoiceCursor(abc, ['1', '2'], 1, bassStart)).toEqual({
      voiceKey: '2',
      offset: 0,
    });
    expect(mapAbcClickToVoiceCursor(abc, ['1', '2'], 0, melodyStart + 2).offset).toBe(2);
  });

  test('mapAbcClickToVoiceCursor uses display order when only voice 2 is shown', function() {
    const abc = buildAbcPreviewFromBodies(tune, tunebook, ['2'], { 2: 'G,2 B,2 |' });
    const noteStart = abc.indexOf('G,2 B,2 |');
    expect(mapAbcClickToVoiceCursor(abc, ['2'], 0, noteStart)).toEqual({
      voiceKey: '2',
      offset: 0,
    });
  });

  test('staffPlaceholder renders empty voice with placeholder rest', function() {
    const abc = buildAbcPreviewFromBodies(tune, tunebook, ['1'], { 1: '' }, { staffPlaceholder: true });
    expect(abc).toMatch(/z4/);
  });

  test('staffPlaceholder is omitted without the option', function() {
    const abc = buildAbcPreviewFromBodies(tune, tunebook, ['1'], { 1: '' });
    expect(abc).not.toMatch(/z4/);
  });

  test('preserves note line breaks for multi-voice display', function() {
    const abc = buildAbcPreviewFromBodies(tune, tunebook, ['1', '2'], {
      1: 'CDEF | GABc |',
      2: 'C,2 E,2 |\nG,2 B,2 |',
    });
    const lines = abc.split('\n');
    const melodyLine = lines.find(function(line) { return /^CDEF/.test(line); });
    const bassLines = lines.filter(function(line) { return /^C,2/.test(line) || /^G,2/.test(line); });
    expect(melodyLine).toBe('CDEF | GABc |');
    expect(bassLines).toEqual(['C,2 E,2 |', 'G,2 B,2 |']);
  });

  test('stripSectionMarkerChords removes markers from display ABC only', function() {
    const tuneWithMarker = Object.assign({}, tune, {
      voices: {
        1: { meta: '', notes: ['"[Verse]" z8 | "C" z8 |'] },
      },
    });
    const savedAbc = tunebook.abcTools.json2abc(tuneWithMarker);
    expect(savedAbc).toMatch(/"\[Verse\]"/);
    const displayAbc = buildAbcPreviewFromBodies(tuneWithMarker, tunebook, ['1'], {
      1: '"[Verse]" z8 | "C" z8 |',
    }, { stripSectionMarkerChords: true });
    expect(displayAbc).not.toMatch(/"\[Verse\]"/);
    expect(displayAbc).toMatch(/"C"/);
  });

  test('includeLyrics false omits under-staff w: lines', function() {
    const tuneWithLyrics = Object.assign({}, tune, {
      words: ['Hel- lo'],
      wLines: ['Hel- lo'],
      voices: {
        1: { meta: 'Melody', notes: ['C D E |'] },
      },
    });
    const withLyrics = buildAbcPreviewFromBodies(tuneWithLyrics, tunebook, ['1'], {
      1: 'C D E |',
    });
    const withoutLyrics = buildAbcPreviewFromBodies(tuneWithLyrics, tunebook, ['1'], {
      1: 'C D E |',
    }, { includeLyrics: false });
    expect(withLyrics).toMatch(/^w:/im);
    expect(withoutLyrics).not.toMatch(/^w:/im);
    expect(withoutLyrics).not.toMatch(/^W:/m);
    expect(withoutLyrics).toMatch(/C D E/);
  });
});

describe('applyStaffChordDisplayPolicy', function() {
  const abcTools = useAbcTools();

  test('strips section markers when chords annotate is on', function() {
    const abc = 'X:1\nK:C\n"[Verse]" z8 | "C" z8 |';
    const result = applyStaffChordDisplayPolicy(abc, { chordsAnnotate: true });
    expect(result).not.toMatch(/"\[Verse\]"/);
    expect(result).toMatch(/"C"/);
  });

  test('strips all embedded chords when annotate off and stripEmbeddedChordsWhenOff', function() {
    const abc = 'X:1\nK:C\n"[Verse]" z8 | "C" z8 |';
    const result = applyStaffChordDisplayPolicy(abc, {
      chordsAnnotate: false,
      stripEmbeddedChordsWhenOff: true,
      abcTools: abcTools,
    });
    expect(result).not.toMatch(/"\[Verse\]"/);
    expect(result).not.toMatch(/"C"/);
  });

  test('keeps embedded chords when annotate off without stripEmbeddedChordsWhenOff', function() {
    const abc = 'X:1\nK:C\n"[Verse]" z8 | "C" z8 |';
    const result = applyStaffChordDisplayPolicy(abc, { chordsAnnotate: false });
    expect(result).toMatch(/"\[Verse\]"/);
    expect(result).toMatch(/"C"/);
  });
});

describe('prepareGigStaffDisplayAbc', function() {
  const abcTools = useAbcTools();
  const tunebook = { abcTools: abcTools };

  test('removes title and section markers for gig staff with chords annotate', function() {
    const displayAbc = [
      'X:1',
      'T:Title',
      'K:C',
      '"[Verse]" z8 | "C" z8 |',
    ].join('\n');
    const result = prepareGigStaffDisplayAbc(displayAbc, tunebook, true);
    expect(result).not.toMatch(/^T:/m);
    expect(result).not.toMatch(/"\[Verse\]"/);
    expect(result).toMatch(/"C"/);
  });

  test('strips embedded chords when chords annotate is off', function() {
    const displayAbc = 'X:1\nK:C\n"[Verse]" z8 | "C" z8 |';
    const result = prepareGigStaffDisplayAbc(displayAbc, tunebook, false);
    expect(result).not.toMatch(/"C"/);
  });
});

describe('prepareTuneViewNotationAbc', function() {
  test('keeps note-aligned lyrics and strips block lyrics', function() {
    const abc = [
      'X:1',
      'T:Test',
      'K:C',
      'C D E |',
      'w: Hel- lo',
      'W: block',
    ].join('\n');
    const result = prepareTuneViewNotationAbc(abc, false);
    expect(result).toMatch(/^w: Hel- lo$/m);
    expect(result).not.toMatch(/^W:/m);
    expect(result).toMatch(/^T:Test$/m);
  });
});

describe('stripAbcMidiTransposeDirectives', function() {
  test('removes %%MIDI transpose so visualTranspose is not double-applied', function() {
    const abc = [
      'X:1',
      '%%MIDI transpose 2',
      'K:C',
      'CDEF |',
    ].join('\n');
    const stripped = stripAbcMidiTransposeDirectives(abc);
    expect(stripped).not.toMatch(/MIDI\s+transpose/i);
    expect(stripped).toMatch(/CDEF/);
  });
});

describe('stripStaffNotationHeaders', function() {
  test('removes title after metadata strip', function() {
    const abc = ['X:1', 'T:Title', 'H:History', 'K:C', 'CDEF |'].join('\n');
    const stripped = stripStaffNotationHeaders(abc);
    expect(stripped).not.toMatch(/^T:/m);
    expect(stripped).not.toMatch(/^H:/m);
    expect(stripped).toMatch(/CDEF/);
  });
});
