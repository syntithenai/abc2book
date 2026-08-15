import { displaySectionHeader, capitalizeSectionHeader, lyricBodyWithOptionalBeatMarkers } from './LyricsDisplayLines';

describe('LyricsDisplayLines helpers', function() {
  test('displaySectionHeader strips brackets and markdown hashes', function() {
    expect(displaySectionHeader('[Verse 1]')).toBe('Verse 1');
    expect(displaySectionHeader('# Chorus')).toBe('Chorus');
    expect(displaySectionHeader('## Bridge')).toBe('Bridge');
    expect(displaySectionHeader('(Outro)')).toBe('Outro');
    expect(displaySectionHeader('(spoken bridge)')).toBe('Spoken Bridge');
    expect(displaySectionHeader('# chorus @1')).toBe('Chorus');
    expect(displaySectionHeader('# instrumental @1 @2')).toBe('Instrumental');
    expect(displaySectionHeader('# instrumental verse and chorus @1 @2')).toBe(
      'Instrumental Verse And Chorus'
    );
  });

  test('displaySectionHeader capitalises section labels', function() {
    expect(displaySectionHeader('[verse 2]')).toBe('Verse 2');
    expect(displaySectionHeader('# chorus')).toBe('Chorus');
    expect(displaySectionHeader('pre-chorus')).toBe('Pre-Chorus');
    expect(displaySectionHeader('PRE-CHORUS 2')).toBe('Pre-Chorus 2');
  });

  test('capitalizeSectionHeader title-cases words and hyphenated parts', function() {
    expect(capitalizeSectionHeader('verse 1')).toBe('Verse 1');
    expect(capitalizeSectionHeader('pre-chorus')).toBe('Pre-Chorus');
  });

  test('displaySectionHeader returns null for empty input', function() {
    expect(displaySectionHeader('')).toBe(null);
    expect(displaySectionHeader('[]')).toBe(null);
    expect(displaySectionHeader(null)).toBe(null);
  });

  test('lyricBodyWithOptionalBeatMarkers keeps and highlights slash markers', function() {
    expect(lyricBodyWithOptionalBeatMarkers('a/mazing /grace', false)).toBe('amazing grace');
    expect(lyricBodyWithOptionalBeatMarkers('plain', true)).toBe('plain');
    const marked = lyricBodyWithOptionalBeatMarkers('a/mazing', true);
    expect(Array.isArray(marked)).toBe(true);
    const marker = marked.find(function(part) {
      return part && part.props && part.props.className === 'lyric-beat-marker';
    });
    expect(marker).toBeTruthy();
    expect(marker.props.children).toBe('/');
  });
});
