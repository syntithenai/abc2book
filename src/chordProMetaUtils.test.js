import {
  parseSongDurationSeconds,
  parseCapoFromText,
  extractChordProDirectives,
  resolveChordProImportMeta,
  isSectionLabelComment,
  parseBraceTempoDirective,
  stripBraceTempoDirectiveLines,
} from './chordProMetaUtils';

describe('chordProMetaUtils', function() {
  test('parses m:ss duration and rejects meter-like time', function() {
    expect(parseSongDurationSeconds('4:00')).toBe(240);
    expect(parseSongDurationSeconds('2:38')).toBe(158);
    expect(parseSongDurationSeconds('1:02:03')).toBe(3723);
    expect(parseSongDurationSeconds('4/4')).toBe(0);
    expect(parseSongDurationSeconds('')).toBe(0);
    expect(parseSongDurationSeconds('180')).toBe(180);
  });

  test('parses capo from directives and ci-style comments', function() {
    expect(parseCapoFromText('3').capo).toBe(3);
    expect(parseCapoFromText('Capo at 2nd fret to play with record')).toEqual({
      capo: 2,
      consumed: true,
    });
    expect(parseCapoFromText('tune guitar to Eb').consumed).toBe(false);
  });

  test('extracts directives including short forms', function() {
    const d = extractChordProDirectives(
      '{t: Title}\n{st: Sub}\n{ci:Capo at 2nd fret}\n{c: Verse 1}\n{copyright: Foo}\n'
    );
    expect(d.title).toEqual(['Title']);
    expect(d.subtitle).toEqual(['Sub']);
    expect(d.comment_italic[0]).toMatch(/Capo/);
    expect(d.comment).toEqual(['Verse 1']);
    expect(d.copyright).toEqual(['Foo']);
  });

  test('isSectionLabelComment', function() {
    expect(isSectionLabelComment('Verse 1')).toBe(true);
    expect(isSectionLabelComment('[Chorus]')).toBe(true);
    expect(isSectionLabelComment('played softly')).toBe(false);
  });

  test('splits composer and artist; folds lyricist/arranger', function() {
    const meta = resolveChordProImportMeta({
      directives: {
        title: ['Song'],
        composer: ['Jane Composer'],
        artist: ['The Band'],
        lyricist: ['Word Smith'],
        arranger: ['Arr Person'],
      },
    });
    expect(meta.composer).toBe('Jane Composer');
    expect(meta.artists).toEqual(['The Band', 'Word Smith', 'Arr Person']);
  });

  test('uses subtitle as artist fallback when credits empty', function() {
    const meta = resolveChordProImportMeta({
      song: { title: 'Amazing Grace', subtitle: 'John Newton' },
      directives: {},
    });
    expect(meta.composer).toBe('John Newton');
    expect(meta.artists).toEqual([]);
    expect(meta.aliases).toEqual([]);
  });

  test('does not use bpm or version subtitles as composer', function() {
    const bpm = resolveChordProImportMeta({
      song: { title: 'Fast One', subtitle: '180 bpm' },
      directives: {},
    });
    expect(bpm.composer).toBe('');
    expect(bpm.aliases).toEqual([]);
    expect(bpm.tempo).toBe(180);

    const uke = resolveChordProImportMeta({
      song: { title: 'Island Tune', subtitle: 'uke version' },
      directives: {},
    });
    expect(uke.composer).toBe('');
    expect(uke.aliases).toEqual(['uke version']);
  });

  test('parses {164bpm} brace tempo into directives and meta', function() {
    expect(parseBraceTempoDirective('{164bpm}')).toBe(164);
    expect(parseBraceTempoDirective('{tempo: 120}')).toBe(120);
    const directives = extractChordProDirectives('{title: Song}\n{164bpm}\n[G]hi\n');
    expect(directives.bpm).toEqual(['164']);
    const meta = resolveChordProImportMeta({
      directives: directives,
    });
    expect(meta.tempo).toBe(164);
    expect(stripBraceTempoDirectiveLines('{164bpm}\n[G]hi\n').trim()).toBe('[G]hi');
  });

  test('subtitle becomes alias when artist present', function() {
    const meta = resolveChordProImportMeta({
      directives: {
        title: ['Dreams'],
        artist: ['Fleetwood Mac'],
        subtitle: ['From Rumours era'],
      },
    });
    expect(meta.composer).toBe('Fleetwood Mac');
    expect(meta.aliases).toEqual(['From Rumours era']);
  });

  test('copyright tag is symbol only; text goes to background', function() {
    const meta = resolveChordProImportMeta({
      directives: {
        title: ['X'],
        copyright: ['Some Publisher 1975'],
        comment: ['Verse 1', 'played softly'],
      },
    });
    expect(meta.tags).toEqual(['©']);
    expect(meta.backgroundInfo).toContain('Copyright: Some Publisher 1975');
    expect(meta.backgroundInfo).toContain('played softly');
    expect(meta.backgroundInfo).not.toMatch(/Verse 1/);
  });

  test('maps duration and capo from ci; album year to discography', function() {
    const meta = resolveChordProImportMeta({
      directives: {
        title: ['Wish You Were Here'],
        artist: ['Pink Floyd'],
        composer: ['Pink Floyd'],
        album: ['Wish You Were Here'],
        year: ['1975'],
        time: ['5:30'],
        comment_italic: ['Capo at 3rd fret'],
      },
    });
    expect(meta.composer).toBe('Pink Floyd');
    expect(meta.artists).toEqual([]);
    expect(meta.discography).toBe('Wish You Were Here (1975)');
    expect(meta.lyricsScrollDurationSec).toBe(330);
    expect(meta.capo).toBe(3);
    expect(meta.backgroundInfo).not.toMatch(/Capo/);
  });
});
