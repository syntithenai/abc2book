import {
  getAvailableViewModes,
  resolveViewModeForTune,
  viewModeToDisplayFlags,
  displayFlagsToViewMode,
  applyDisplayFlagToggle,
  applyDisplayGroupAction,
  getDisplayFlagsLabel,
  cycleNotationMode,
  normalizeViewMode,
  defaultViewModeForTune,
  hasAnyViewModeEnabled,
  enableInfoInViewMode,
  applyGeneratedBackgroundInfo,
  isEditorNotationPath,
  isNotationEditorView,
  normalizeEditorViewMode,
  notationViewToEditorViewMode,
  getEditorViewModeLabel,
} from './viewModeUtils';
import { resolveTuneDisplayLayout } from './tuneDisplayLayout';

describe('viewModeUtils availability', function() {
  const tunebook = {
    hasLyrics: function(tune) {
      return !!(tune && Array.isArray(tune.wLines) && tune.wLines.some(function(line) {
        return line && String(line).trim().length > 0;
      }));
    },
    hasNotes: function(tune) {
      if (!tune || !tune.voices) return false;
      return Object.values(tune.voices).some(function(voice) {
        return Array.isArray(voice.notes) && voice.notes.some(function(line) {
          return String(line || '').replace(/\|/g, '').replace(/z/g, '').trim().length > 0;
        });
      });
    },
  };

  it('hides lyrics modes when tune has no lyrics', function() {
    const tune = {
      voices: { '1': { notes: ['CDEF|'] } },
      wLines: [],
    };
    const modes = getAvailableViewModes(tune, tunebook).map(function(mode) { return mode.id; });
    expect(modes).toEqual(['music', 'info']);
  });

  it('hides notation modes when tune has no abc notes', function() {
    const tune = {
      voices: { '1': { notes: ['|'] } },
      wLines: ['Hello world'],
    };
    const modes = getAvailableViewModes(tune, tunebook).map(function(mode) { return mode.id; });
    expect(modes).toEqual(['chordsInline', 'chordsBlock', 'lyricsOnly', 'info']);
  });

  it('resolves invalid stored view modes to the first available option', function() {
    const tune = {
      voices: { '1': { notes: ['CDEF|'] } },
      wLines: [],
    };
    expect(resolveViewModeForTune('lyricsOnly', tune, tunebook)).toBe('off');
  });
});

describe('viewModeUtils display flags', function() {
  it('round-trips legacy modes through display flags', function() {
    ['music', 'musicAndLyrics', 'chordsInline', 'chordsBlock', 'lyricsOnly', 'info'].forEach(function(mode) {
      expect(displayFlagsToViewMode(viewModeToDisplayFlags(mode))).toBe(mode);
    });
  });

  it('encodes structure + chords as separate tokens', function() {
    const mode = displayFlagsToViewMode({
      notation: 'lines',
      lyrics: true,
      structure: true,
      chords: true,
      info: true,
    });
    expect(mode).toBe('notation,lyrics,structure,chords,info');
    expect(normalizeViewMode(mode)).toBe(mode);
    expect(viewModeToDisplayFlags(mode)).toEqual({
      notation: 'lines',
      lyrics: true,
      structure: true,
      chords: true,
      info: true,
    });
  });

  it('maps legacy chordsInline to chords on, structure off', function() {
    expect(viewModeToDisplayFlags('chordsInline')).toEqual({
      notation: 'off',
      lyrics: true,
      structure: false,
      chords: true,
      info: false,
    });
  });

  it('maps legacy chordsBlock to structure on, chords off', function() {
    expect(viewModeToDisplayFlags('chordsBlock')).toEqual({
      notation: 'off',
      lyrics: true,
      structure: true,
      chords: false,
      info: false,
    });
  });

  it('maps legacy composite chordsBlock token to structure', function() {
    expect(viewModeToDisplayFlags('notation,lyrics,chordsBlock')).toEqual({
      notation: 'lines',
      lyrics: true,
      structure: true,
      chords: false,
      info: false,
    });
  });

  it('allows all toggles off', function() {
    expect(viewModeToDisplayFlags('off')).toEqual({
      notation: 'off',
      lyrics: false,
      structure: false,
      chords: false,
      info: false,
    });
    expect(displayFlagsToViewMode({
      notation: 'off',
      lyrics: false,
      structure: false,
      chords: false,
      info: false,
    })).toBe('off');
    expect(hasAnyViewModeEnabled(viewModeToDisplayFlags('off'))).toBe(false);
  });

  it('parses plus-separated and space-separated composites from older urls', function() {
    expect(viewModeToDisplayFlags('notation+info')).toEqual({
      notation: 'lines',
      lyrics: false,
      structure: false,
      chords: false,
      info: true,
    });
  });

  it('applies group visibility for structure and chords independently', function() {
    const available = {
      notation: true, lyrics: true, structure: true, chords: true, info: true,
    };
    const start = {
      notation: 'lines', lyrics: true, structure: true, chords: false, info: true,
    };
    expect(applyDisplayGroupAction(start, 'structure', 'toggle', available).structure).toBe(false);
    expect(applyDisplayGroupAction(start, 'chords', 'visibility', available).chords).toBe(true);
    expect(applyDisplayGroupAction(start, 'notation', 'visibility', available).notation).toBe('off');
    const allOff = applyDisplayGroupAction(
      { notation: 'off', lyrics: false, structure: false, chords: false, info: true },
      'info',
      'toggle',
      available
    );
    expect(allOff.info).toBe(false);
    expect(displayFlagsToViewMode(allOff)).toBe('off');
  });

  it('cycles notation off → lines → off', function() {
    expect(cycleNotationMode('off')).toBe('lines');
    expect(cycleNotationMode('lines')).toBe('off');
    expect(cycleNotationMode('flow')).toBe('off');
  });

  it('allows turning off the last content panel', function() {
    const available = {
      notation: true, lyrics: true, structure: true, chords: true, info: true,
    };
    const onlyNotation = {
      notation: 'lines', lyrics: false, structure: false, chords: false, info: false,
    };
    expect(applyDisplayFlagToggle(onlyNotation, 'notation', available)).toEqual({
      notation: 'off',
      lyrics: false,
      structure: false,
      chords: false,
      info: false,
    });
  });

  it('builds a readable label for active panels', function() {
    expect(getDisplayFlagsLabel({
      notation: 'lines',
      lyrics: true,
      structure: true,
      chords: false,
      info: true,
    })).toBe('Structure + Notation + Lyrics + Info');
    expect(getDisplayFlagsLabel({
      notation: 'off',
      lyrics: false,
      structure: false,
      chords: false,
      info: false,
    })).toBe('No view modes enabled');
  });

  it('defaults view mode from tune content', function() {
    const tunebook = {
      hasLyrics: function(t) { return !!(t.wLines && t.wLines.length); },
      hasNotes: function(t) {
        return !!(t.voices && Object.values(t.voices).some(function(v) {
          return v.notes && v.notes.some(function(n) { return /[A-Ga-g]/.test(n); });
        }));
      },
    };
    expect(defaultViewModeForTune(
      { voices: { '1': { notes: ['CDEF|'] } }, wLines: [] },
      tunebook,
      { hasChords: false }
    )).toBe('music');
    expect(defaultViewModeForTune(
      { voices: {}, wLines: ['Hello'] },
      tunebook,
      { hasChords: true }
    )).toBe('lyrics,structure,chords,noinfo');
    expect(defaultViewModeForTune(
      { voices: { '1': { notes: ['| "D" z2 |'] } }, wLines: [] },
      tunebook,
      { hasChords: true }
    )).toBe('notation,chords,noinfo');
    // Notation + lyrics: structure block stays off by default.
    expect(defaultViewModeForTune(
      { voices: { '1': { notes: ['CDEF|'] } }, wLines: ['Hello'] },
      tunebook,
      { hasChords: true }
    )).toBe('notation,lyrics,chords,noinfo');
    expect(defaultViewModeForTune(
      { voices: { '1': { notes: ['CDEF|'] } }, wLines: ['Hello'] },
      tunebook,
      { hasChords: false }
    )).toBe('notation,lyrics,noinfo');
  });
});

describe('tuneDisplayLayout', function() {
  it('places a single block full width', function() {
    expect(resolveTuneDisplayLayout({
      notation: 'lines', lyrics: false, structure: false,
    })).toMatchObject({
      layoutClass: 'tune-layout-notation-only',
      main: 'notation',
      side: null,
      below: null,
    });
  });

  it('syncs lyrics and structure scroll when notation is off', function() {
    expect(resolveTuneDisplayLayout({
      notation: 'off', lyrics: true, structure: true,
    })).toMatchObject({
      layoutClass: 'tune-layout-lyrics-structure tune-layout-lyrics-structure--sync',
      main: 'lyrics',
      side: 'structure',
      syncLyricsStructure: true,
    });
  });

  it('places two blocks as primary left and secondary right when notation is on', function() {
    expect(resolveTuneDisplayLayout({
      notation: 'lines', lyrics: true, structure: false,
    })).toMatchObject({
      layoutClass: 'tune-layout-notation-lyrics',
      main: 'notation',
      side: 'lyrics',
    });
  });

  it('places three blocks with lyrics below and structure top-right', function() {
    expect(resolveTuneDisplayLayout({
      notation: 'lines', lyrics: true, structure: true,
    })).toMatchObject({
      layoutClass: 'tune-layout-notation-lyrics-structure',
      main: 'notation',
      side: 'structure',
      below: 'lyrics',
      wrapLyricsAroundStructure: true,
    });
  });

  it('marks empty layout when no blocks are on', function() {
    expect(resolveTuneDisplayLayout({
      notation: 'off', lyrics: false, structure: false, chords: true, info: true,
    }).empty).toBe(true);
  });
});

describe('enableInfoInViewMode / applyGeneratedBackgroundInfo', function() {
  it('enables info while preserving other view flags', function() {
    expect(enableInfoInViewMode('music')).toBe('notation,info');
    expect(enableInfoInViewMode('musicAndLyrics')).toBe('notation,lyrics,structure,info');
    expect(enableInfoInViewMode('notation,lyrics,noinfo')).toBe('notation,lyrics,info');
    expect(enableInfoInViewMode('off')).toBe('info');
    expect(enableInfoInViewMode('info')).toBe('info');
  });

  it('applies background text and enables info on the tune', function() {
    const tune = { viewMode: 'music', backgroundInfo: '' };
    applyGeneratedBackgroundInfo(tune, '  History of the tune.  ');
    expect(tune.backgroundInfo).toBe('History of the tune.');
    expect(tune.viewMode).toBe('notation,info');
  });

  it('does not change the tune when text is empty', function() {
    const tune = { viewMode: 'music', backgroundInfo: '' };
    applyGeneratedBackgroundInfo(tune, '   ');
    expect(tune.backgroundInfo).toBe('');
    expect(tune.viewMode).toBe('music');
  });
});

describe('isEditorNotationPath', function() {
  it('detects music / pianoRoll / notationAbc editor tabs', function() {
    expect(isEditorNotationPath('/editor/abc123/music')).toBe(true);
    expect(isEditorNotationPath('/editor/abc123/pianoRoll')).toBe(true);
    expect(isEditorNotationPath('/editor/abc123/notationAbc')).toBe(true);
    expect(isEditorNotationPath('/editor/abc123/chords')).toBe(true);
    expect(isNotationEditorView('music')).toBe(true);
    expect(isNotationEditorView('chords')).toBe(true);
  });

  it('leaves info/lyrics and non-editor routes for tune-skip arrows', function() {
    expect(isEditorNotationPath('/editor/abc123')).toBe(false);
    expect(isEditorNotationPath('/editor/abc123/info')).toBe(false);
    expect(isEditorNotationPath('/editor/abc123/lyrics')).toBe(false);
    expect(isEditorNotationPath('/editor/abc123/sourceAbc')).toBe(false);
    expect(isEditorNotationPath('/editor/abc123/abc')).toBe(false);
    expect(isEditorNotationPath('/tunes/abc123')).toBe(false);
    expect(isEditorNotationPath('/settings')).toBe(false);
  });
});

describe('normalizeEditorViewMode and helpers', function() {
  it('normalizes legacy ABC to info', function() {
    expect(normalizeEditorViewMode('sourceAbc')).toBe('info');
    expect(normalizeEditorViewMode('abc')).toBe('info');
  });

  it('accepts music/pianoRoll/notationAbc/chords subviews', function() {
    expect(normalizeEditorViewMode('pianoRoll')).toBe('pianoRoll');
    expect(normalizeEditorViewMode('notationAbc')).toBe('notationAbc');
    expect(normalizeEditorViewMode('chords')).toBe('chords');
  });

  it('maps notation view to editor mode', function() {
    expect(notationViewToEditorViewMode('staff')).toBe('music');
    expect(notationViewToEditorViewMode('pianoRoll')).toBe('pianoRoll');
    expect(notationViewToEditorViewMode('abc')).toBe('notationAbc');
    expect(notationViewToEditorViewMode('chords')).toBe('chords');
  });

  it('gets editor view mode label', function() {
    expect(getEditorViewModeLabel('music')).toBe('Music');
    expect(getEditorViewModeLabel('lyrics')).toBe('Lyrics');
    expect(getEditorViewModeLabel('pianoRoll')).toBe('Piano roll');
    expect(getEditorViewModeLabel('notationAbc')).toBe('ABC Notes');
    expect(getEditorViewModeLabel('chords')).toBe('Chords');
    expect(getEditorViewModeLabel('sourceAbc')).toBe('Info');
  });

  it('defaults to Info for unknown modes', function() {
    expect(normalizeEditorViewMode('unknown')).toBe('info');
    expect(getEditorViewModeLabel('unknown')).toBe('Info');
  });
});
