import {
  getAvailableViewModes,
  resolveViewModeForTune,
  viewModeToDisplayFlags,
  displayFlagsToViewMode,
  applyDisplayFlagToggle,
  getDisplayFlagsLabel,
  cycleChordsMode,
  cycleNotationMode,
  normalizeViewMode,
} from './viewModeUtils';

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
    expect(resolveViewModeForTune('lyricsOnly', tune, tunebook)).toBe('music');
  });
});

describe('viewModeUtils display flags', function() {
  it('round-trips legacy modes through display flags', function() {
    ['music', 'musicAndLyrics', 'chordsInline', 'chordsBlock', 'lyricsOnly', 'info'].forEach(function(mode) {
      expect(displayFlagsToViewMode(viewModeToDisplayFlags(mode))).toBe(mode);
    });
  });

  it('encodes and normalizes composite display flags with info after other panels', function() {
    const mode = displayFlagsToViewMode({
      notation: 'lines',
      lyrics: true,
      chords: 'inline',
      info: true,
    });
    expect(mode).toBe('notation,lyrics,chordsInline,info');
    expect(normalizeViewMode(mode)).toBe(mode);
    expect(viewModeToDisplayFlags(mode)).toEqual({
      notation: 'lines',
      lyrics: true,
      chords: 'inline',
      info: true,
    });
  });

  it('parses plus-separated and space-separated composites from older urls', function() {
    expect(viewModeToDisplayFlags('notation+info')).toEqual({
      notation: 'lines',
      lyrics: false,
      chords: 'off',
      info: true,
    });
    expect(viewModeToDisplayFlags('notation info')).toEqual({
      notation: 'lines',
      lyrics: false,
      chords: 'off',
      info: true,
    });
    // Notation + info is the default music view (info on by default).
    expect(normalizeViewMode('notation+info')).toBe('music');
    expect(normalizeViewMode('notation info')).toBe('music');
  });

  it('applies group visibility and layout buttons', function() {
    const { applyDisplayGroupAction } = require('./viewModeUtils');
    const available = { notation: true, lyrics: true, chords: true, info: true };
    const start = { notation: 'lines', lyrics: true, chords: 'block', info: true };
    expect(applyDisplayGroupAction(start, 'chords', 'layout', available).chords).toBe('inline');
    expect(applyDisplayGroupAction(start, 'chords', 'visibility', available).chords).toBe('off');
    expect(applyDisplayGroupAction(start, 'notation', 'visibility', available).notation).toBe('off');
    expect(applyDisplayGroupAction(
      { notation: 'off', lyrics: true, chords: 'off', info: true },
      'notation',
      'visibility',
      available
    ).notation).toBe('lines');
    const infoOff = applyDisplayGroupAction(start, 'info', 'toggle', available);
    expect(infoOff.info).toBe(false);
    expect(displayFlagsToViewMode(infoOff)).toContain('noinfo');
    expect(viewModeToDisplayFlags(displayFlagsToViewMode(infoOff)).info).toBe(false);
  });

  it('maps legacy notation flow tokens to lines', function() {
    expect(viewModeToDisplayFlags('notationFlow')).toEqual({
      notation: 'lines',
      lyrics: false,
      chords: 'off',
      info: true,
    });
    expect(normalizeViewMode('notationFlow')).toBe('music');
    expect(displayFlagsToViewMode({
      notation: 'flow',
      lyrics: false,
      chords: 'off',
      info: true,
    })).toBe('music');
  });

  it('enables chords as block by default, or inline when preferred', function() {
    const { applyDisplayGroupAction } = require('./viewModeUtils');
    const available = { notation: true, lyrics: true, chords: true, info: true };
    const start = { notation: 'lines', lyrics: true, chords: 'off', info: true };
    expect(applyDisplayGroupAction(start, 'chords', 'visibility', available).chords).toBe('block');
    expect(applyDisplayGroupAction(start, 'chords', 'visibility', available, {
      preferInlineChords: true,
    }).chords).toBe('inline');
  });

  it('keeps other panels when info is enabled', function() {
    const available = { notation: true, lyrics: true, chords: true, info: true };
    const start = { notation: 'lines', lyrics: true, chords: 'off', info: false };
    const withInfo = applyDisplayFlagToggle(start, 'info', available);
    expect(withInfo).toEqual({
      notation: 'lines',
      lyrics: true,
      chords: 'off',
      info: true,
    });
    expect(displayFlagsToViewMode(withInfo)).toBe('musicAndLyrics');
  });

  it('cycles chords off → inline → block → off', function() {
    expect(cycleChordsMode('off')).toBe('inline');
    expect(cycleChordsMode('inline')).toBe('block');
    expect(cycleChordsMode('block')).toBe('off');
  });

  it('cycles notation off → lines → off', function() {
    expect(cycleNotationMode('off')).toBe('lines');
    expect(cycleNotationMode('lines')).toBe('off');
    expect(cycleNotationMode('flow')).toBe('off');
  });

  it('keeps at least one of chords, lyrics, or notation visible', function() {
    const available = { notation: true, lyrics: true, chords: true, info: true };
    // Sole active notation cannot turn fully off; content panel is restored.
    const onlyNotation = { notation: 'lines', lyrics: false, chords: 'off', info: false };
    expect(applyDisplayFlagToggle(onlyNotation, 'notation', available)).toEqual({
      notation: 'lines',
      lyrics: false,
      chords: 'off',
      info: false,
    });
    // Info alone is not enough when content panels are available.
    const onlyInfo = { notation: 'off', lyrics: false, chords: 'off', info: true };
    expect(applyDisplayFlagToggle(onlyInfo, 'info', available)).toEqual({
      notation: 'lines',
      lyrics: false,
      chords: 'off',
      info: false,
    });
    expect(displayFlagsToViewMode({
      notation: 'lines',
      lyrics: false,
      chords: 'off',
      info: false,
    })).toBe('notation,noinfo');
  });

  it('disabling lyrics with no notation forces chords to block', function() {
    const available = { notation: true, lyrics: true, chords: true, info: true };
    const start = { notation: 'off', lyrics: true, chords: 'inline', info: false };
    const withoutLyrics = applyDisplayFlagToggle(start, 'lyrics', available);
    expect(withoutLyrics.lyrics).toBe(false);
    expect(withoutLyrics.chords).toBe('block');
    expect(displayFlagsToViewMode(withoutLyrics)).toBe('chordsBlock,noinfo');
  });

  it('disabling lyrics via group action keeps inline chords when notation is on', function() {
    const { applyDisplayGroupAction } = require('./viewModeUtils');
    const available = { notation: true, lyrics: true, chords: true, info: true };
    const start = { notation: 'lines', lyrics: true, chords: 'inline', info: true };
    const withoutLyrics = applyDisplayGroupAction(start, 'lyrics', 'toggle', available);
    expect(withoutLyrics.lyrics).toBe(false);
    expect(withoutLyrics.chords).toBe('inline');
  });

  it('allows chords inline without a lyrics panel when notation is on', function() {
    const { applyDisplayGroupAction } = require('./viewModeUtils');
    const available = { notation: true, lyrics: false, chords: true, info: true };
    const start = { notation: 'lines', lyrics: false, chords: 'block', info: true };
    const inline = applyDisplayGroupAction(start, 'chords', 'layout', available);
    expect(inline.chords).toBe('inline');
    const backToBlock = applyDisplayGroupAction(inline, 'chords', 'layout', available);
    expect(backToBlock.chords).toBe('block');
  });

  it('forces block when chords are enabled without notation or lyrics', function() {
    const { applyDisplayGroupAction, ensureContentDisplayFlags } = require('./viewModeUtils');
    const available = { notation: true, lyrics: true, chords: true, info: true };
    const onlyChords = ensureContentDisplayFlags({
      notation: 'off',
      lyrics: false,
      chords: 'inline',
      info: true,
    }, available);
    expect(onlyChords.chords).toBe('block');
    const start = { notation: 'off', lyrics: false, chords: 'off', info: true };
    const enabled = applyDisplayGroupAction(start, 'chords', 'visibility', available, {
      preferInlineChords: true,
    });
    expect(enabled.chords).toBe('block');
    const tryInline = applyDisplayGroupAction(enabled, 'chords', 'layout', available);
    expect(tryInline.chords).toBe('block');
  });

  it('toggles lyrics and cycles chords and notation independently', function() {
    const available = { notation: true, lyrics: true, chords: true, info: true };
    const start = { notation: 'lines', lyrics: false, chords: 'off', info: false };
    const withLyrics = applyDisplayFlagToggle(start, 'lyrics', available);
    expect(withLyrics.lyrics).toBe(true);
    expect(withLyrics.notation).toBe('lines');
    const withChords = applyDisplayFlagToggle(withLyrics, 'chords', available);
    expect(withChords.chords).toBe('inline');
    const withoutNotation = applyDisplayFlagToggle(withChords, 'notation', available);
    expect(withoutNotation.notation).toBe('off');
    expect(displayFlagsToViewMode(withoutNotation)).toBe('lyrics,chordsInline,noinfo');
  });

  it('builds a readable label for active panels', function() {
    expect(getDisplayFlagsLabel({
      notation: 'lines',
      lyrics: true,
      chords: 'block',
      info: true,
    })).toBe('Notation + Lyrics + Chords block + Info');
  });
});
