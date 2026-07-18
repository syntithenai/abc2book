import { resolvePrintViewMode } from './printTuneViewMode';

describe('printTuneViewMode', function() {
  const tunebook = {
    abcTools: {
      emptyABC: function(name) { return 'T:' + (name || '') + '\n'; },
    },
    hasNotesOrChords: function(tune) {
      return !!(tune && tune.voices && Object.keys(tune.voices).length > 0);
    },
    hasLyrics: function(tune) {
      if (!tune) return false;
      const lines = tune.wLines || tune.words || [];
      return Array.isArray(lines) && lines.some(function(line) {
        return line && String(line).trim().length > 0;
      });
    },
    hasNotes: function(tune) {
      if (!tune || !tune.voices) return false;
      return Object.keys(tune.voices).some(function(key) {
        const voice = tune.voices[key];
        if (!voice || !Array.isArray(voice.notes)) return false;
        return voice.notes.some(function(line) {
          const stripped = String(line || '').replace(/"[^"]*"/g, '');
          return /[a-gA-G]/.test(stripped);
        });
      });
    },
  };

  const abcjsParser = {
    renderChords: function() { return 'D G A'; },
  };

  it('uses saved tune.viewMode when present', function() {
    const tune = {
      viewMode: 'lyricsOnly',
      voices: { v: { notes: ['CDEF|'] } },
      wLines: ['Hello'],
    };
    expect(resolvePrintViewMode(tune, 'music', tunebook, abcjsParser)).toBe('lyricsOnly');
  });

  it('defaults lyric-only sheets with chords to lyrics, structure, and chords', function() {
    const tune = {
      wLines: ['Am   G', 'Lyrics here'],
    };
    expect(resolvePrintViewMode(tune, 'music', tunebook, abcjsParser)).toBe('lyrics,structure,chords,noinfo');
  });

  it('defaults chord-symbol-only abc with rests to lyrics, structure, and chords', function() {
    const tune = {
      voices: { v: { notes: ['| "D" z2 "G" z "A" z |', '|z4 z4 z4 z4|'] } },
      wLines: ['Well I have been free as a bird'],
    };
    expect(resolvePrintViewMode(tune, 'music', tunebook, abcjsParser)).toBe('lyrics,structure,chords,noinfo');
  });

  it('defaults notation+lyrics without chords to notation+lyrics composite', function() {
    const tune = {
      voices: { v: { notes: ['CDEF|'] } },
      wLines: ['Plain lyrics line'],
    };
    // No chord content → structure stays off; not the legacy musicAndLyrics id
    expect(resolvePrintViewMode(tune, 'music', tunebook, {
      renderChords: function() { return ''; },
    })).toBe('notation,lyrics,noinfo');
  });

  it('defaults notation+lyrics with chords to notation, lyrics, and chords (no structure)', function() {
    const tune = {
      voices: { v: { notes: ['CDEF|'] } },
      wLines: ['Plain lyrics line'],
    };
    expect(resolvePrintViewMode(tune, 'music', tunebook, abcjsParser)).toBe('notation,lyrics,chords,noinfo');
  });

  it('defaults notation-only tunes without chords to music', function() {
    const tune = {
      voices: { v: { notes: ['CDEF|'] } },
      wLines: [],
    };
    expect(resolvePrintViewMode(tune, 'chordsBlock', tunebook, {
      renderChords: function() { return ''; },
    })).toBe('music');
  });
});
