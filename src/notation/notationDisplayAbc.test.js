/* eslint-disable react-hooks/rules-of-hooks */
import useAbcTools from '../useAbcTools';
import {
  buildAbcPreviewFromBodies,
  mapAbcClickToVoiceCursor,
  stripBlockLyricsFromDisplayAbc,
  stripNotationDisplayMetadata,
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
});
