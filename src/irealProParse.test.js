import { splitIRealSongs, irealChordsToChordPro, looksLikeIRealProHtml, irealHtmlToCandidates } from './irealProParse';

describe('irealProParse', function() {
  test('looksLikeIRealProHtml', function() {
    expect(looksLikeIRealProHtml('<a href="irealb://Foo=Bar=Swing=C=n=C|F">x</a>')).toBe(true);
    expect(looksLikeIRealProHtml('<html>nope</html>')).toBe(false);
  });

  test('splitIRealSongs parses single song', function() {
    const songs = splitIRealSongs('A Walkin Thing=Carter Benny=Medium Swing=D-=n={*AT44D-}');
    expect(songs.length).toBeGreaterThanOrEqual(1);
    expect(songs[0].title).toContain('Walkin');
  });

  test('irealChordsToChordPro includes title directive', function() {
    const text = irealChordsToChordPro({
      title: 'Test Tune',
      composer: 'Anon',
      key: 'C',
      style: 'Swing',
      chords: 'C | F | G | C',
    });
    expect(text).toContain('{title: Test Tune}');
    expect(text).toContain('{artist: Anon}');
  });

  test('irealHtmlToCandidates extracts from href', function() {
    const html = '<html><body><a href="irealb://Blue%20Bossa=Dorham%20Kenny=Latin=C-=n=C-|F7">Blue Bossa</a></body></html>';
    const candidates = irealHtmlToCandidates(html, {});
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0].sourceKind).toBe('ireal');
    expect(candidates[0].skipEnrich).toBe(true);
  });
});
