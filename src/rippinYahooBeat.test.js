import { mergeChordsIntoLyricLines } from './chordSheetUtils';

describe('Rippin Yahoo beat alignment', function() {
  test('verse line 2 places mid-bar B on /bow and keeps slash markers in text', function() {
    const verseChart = 'C | C B | B A# A G# | G |';
    const lyricLines = [
      'In an /old church at Cande/lo',
      "we'd /gather to pluck and /bow",
      'and /blow the roof off with our /bright harmonies',
      'And /guzzle our guts so many /yummy treats',
    ];
    const merged = mergeChordsIntoLyricLines(lyricLines, verseChart);
    const row = merged[1];
    expect(row.map(function(t) { return t.text.trim(); })).toEqual([
      "we'd", '/gather', 'to', 'pluck', 'and', '/bow',
    ]);
    expect(row.map(function(t) { return t.chord; })).toEqual([
      '', 'C', '', '', '', 'B',
    ]);
  });
});
