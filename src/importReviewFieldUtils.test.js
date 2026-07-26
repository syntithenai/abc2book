import {
  applyImportSuggestion,
  applyInlineImportToForm,
  applyAddFormInlineImport,
  applyCoalescedFieldChoicesToSuggestions,
  applyForcedBookToBookList,
  applyForcedBookTuneFilter,
  primaryBookFromBookList,
  alignedLyricPreviewPairs,
  attachCurrentValueChoice,
  buildReviewFormState,
  buildTuneFormSyncSignal,
  canApplyImportInline,
  emptyFormValues,
  formValuesToTune,
  importSuggestionDiffersFromForm,
  lyricPreviewLines,
  mergeImportedLinks,
  notationPreviewLine,
  sessionTuneAheadOfForm,
  shouldPreferExistingNotation,
  tuneHasPreexistingAbcNotesOrChords,
  tuneToFormValues,
  unionStringLists,
} from './importReviewFieldUtils';

describe('importReviewFieldUtils', function() {
  test('primaryBookFromBookList returns first book', function() {
    expect(primaryBookFromBookList('folk, songs')).toBe('folk')
    expect(primaryBookFromBookList('')).toBe('')
  })

  test('applyForcedBookToBookList prepends forced book without duplicates', function() {
    expect(applyForcedBookToBookList('folk, songs', 'jazz')).toBe('jazz, folk, songs');
    expect(applyForcedBookToBookList('jazz, folk', 'jazz')).toBe('jazz, folk');
    expect(applyForcedBookToBookList('', 'songs')).toBe('songs');
    expect(applyForcedBookToBookList('folk', '')).toBe('folk');
  })

  test('applyForcedBookTuneFilter sets list book filter from session', function() {
    const setCurrentTuneBook = jest.fn()
    expect(applyForcedBookTuneFilter({ forcedBook: 'reels' }, setCurrentTuneBook)).toBe(true)
    expect(setCurrentTuneBook).toHaveBeenCalledWith('reels')
    setCurrentTuneBook.mockClear()
    expect(applyForcedBookTuneFilter({ forcedBook: '' }, setCurrentTuneBook)).toBe(false)
    expect(applyForcedBookTuneFilter(null, setCurrentTuneBook)).toBe(false)
  });

  test('canApplyImportInline recognizes local parse kinds', function() {
    expect(canApplyImportInline('abc')).toBe(true);
    expect(canApplyImportInline('chordsheet')).toBe(true);
    expect(canApplyImportInline('bulk-text')).toBe(true);
    expect(canApplyImportInline('musicxml')).toBe(false);
    expect(canApplyImportInline('mscz')).toBe(false);
    expect(canApplyImportInline('onsong')).toBe(false);
  });

  test('sessionTuneAheadOfForm detects composer and lyrics ahead of empty form', function() {
    const candidate = {
      tune: {
        name: '',
        composer: 'John Newton',
        words: ['[G]Amazing grace'],
      },
      sourceKind: 'chordsheet',
    };
    expect(sessionTuneAheadOfForm(candidate, emptyFormValues())).toBe(true);
    expect(sessionTuneAheadOfForm(candidate, { title: '', artist: 'John Newton', lyrics: '' })).toBe(true);
    expect(sessionTuneAheadOfForm(candidate, {
      title: '',
      artist: 'John Newton',
      lyrics: '[G]Amazing grace',
    })).toBe(false);
  });

  test('sessionTuneAheadOfForm detects inlineFormValues ahead of empty form', function() {
    const candidate = {
      tune: { name: '', composer: '' },
      inlineFormValues: {
        title: 'Brown Eyed Girl',
        artist: 'Van Morrison',
      },
      sourceKind: 'chordsheet',
    };
    expect(sessionTuneAheadOfForm(candidate, emptyFormValues())).toBe(true);
  });

  test('buildTuneFormSyncSignal changes when inlineFormValues changes', function() {
    const base = {
      id: 'c1',
      tune: { name: 'Grace', composer: 'Newton' },
      sourceKind: 'chordsheet',
      inlineImportRevision: 1,
    };
    const next = Object.assign({}, base, {
      inlineFormValues: { title: 'Grace', artist: 'Newton', lyrics: '[G]Hi' },
    });
    expect(buildTuneFormSyncSignal(base)).not.toBe(buildTuneFormSyncSignal(next));
  });

  test('buildTuneFormSyncSignal changes when imported tune content changes', function() {
    const base = { id: 'c1', tune: { name: '', composer: '' }, sourceKind: 'manual' };
    const imported = {
      id: 'c1',
      tune: { name: 'Grace', composer: 'Newton', words: ['[G]Hi'] },
      sourceKind: 'chordsheet',
      pendingInlineSuggestions: { lyrics: { value: ['[G]Hi'] } },
    };
    expect(buildTuneFormSyncSignal(base)).not.toBe(buildTuneFormSyncSignal(imported));
  });

  test('buildReviewFormState auto-fills empty title on merge', function() {
    const existing = { id: '1', name: '', composer: 'Old' };
    const imported = { name: 'Imported Title', composer: 'Old' };
    const result = buildReviewFormState(existing, imported, 'merge');
    expect(result.formValues.title).toBe('Imported Title');
    expect(result.autoAppliedKeys).toContain('name');
    expect(result.suggestions.title).toBeUndefined();
  });

  test('buildReviewFormState produces suggestion when rhythm differs', function() {
    const existing = { id: '1', name: 'Tune', rhythm: 'reel' };
    const imported = { name: 'Tune', rhythm: 'jig' };
    const result = buildReviewFormState(existing, imported, 'merge');
    expect(result.formValues.rhythm).toBe('reel');
    expect(result.suggestions.rhythm).toBeTruthy();
    expect(result.suggestions.rhythm.value).toBe('jig');
  });

  test('mergeImportedLinks dedupes youtube URL variants', function() {
    const existing = [{ title: 'Clip', link: 'https://youtu.be/abc12345678' }];
    const imported = [{ title: 'Clip', link: 'https://www.youtube.com/watch?v=abc12345678' }];
    const merged = mergeImportedLinks(existing, imported);
    expect(merged).toHaveLength(1);
  });

  test('mergeImportedLinks appends new links', function() {
    const existing = [{ link: 'https://example.com/a' }];
    const imported = [{ link: 'https://example.com/b' }];
    const merged = mergeImportedLinks(existing, imported);
    expect(merged).toHaveLength(2);
  });

  test('applyImportSuggestion updates form field', function() {
    const form = emptyFormValues();
    form.rhythm = 'reel';
    const next = applyImportSuggestion(form, 'rhythm', {
      key: 'rhythm',
      value: 'jig',
      displayValue: 'jig',
    });
    expect(next.rhythm).toBe('jig');
  });

  test('applyInlineImportToForm fills empty fields only', function() {
    const current = tuneToFormValues({ name: 'Mine', rhythm: 'reel' });
    const result = applyInlineImportToForm(current, { name: 'Theirs', rhythm: 'jig', genre: 'Irish' });
    expect(result.formValues.title).toBe('Mine');
    expect(result.formValues.genres).toEqual(['Irish']);
    expect(result.suggestions.rhythm).toBeTruthy();
  });

  test('applyAddFormInlineImport replaces previous add-form title on re-import', function() {
    const draft = tuneToFormValues({
      name: 'Amazing Grace',
      composer: 'John Newton',
      books: ['songs'],
      tags: ['favorite'],
      words: ['[G]Old lyrics'],
    });
    const result = applyAddFormInlineImport(formValuesToTune(draft, {}), {
      name: 'Brown Eyed Girl',
      composer: 'Van Morrison',
      words: ['[G]Hey where did we go'],
      books: ['irish'],
    });
    expect(result.formValues.title).toBe('Brown Eyed Girl');
    expect(result.formValues.artist).toBe('Van Morrison');
    expect(result.formValues.lyrics).toContain('Hey where did we go');
    expect(result.formValues.bookList).toBe('irish, songs');
    expect(result.formValues.tagList).toBe('favorite');
  });

  test('applyInlineImportToForm auto-applies empty notation', function() {
    const current = emptyFormValues();
    current.title = '';
    const imported = {
      name: 'Pastoral',
      books: ['session'],
      voices: { '1': { meta: '', notes: ['GAB c2|'] } },
    };
    const result = applyInlineImportToForm(current, imported);
    expect(result.formValues.title).toBe('Pastoral');
    expect(result.formValues.bookList).toBe('session');
    expect(String(result.formValues.notes || '').trim()).toContain('GAB c2|');
    expect(result.autoAppliedKeys).toContain('voices');
    expect(result.suggestions.notes).toBeFalsy();
  });

  test('applyImportSuggestion current value restores pre-import notation', function() {
    const form = emptyFormValues();
    form.notes = 'OLD';
    form.voices = { '1': { meta: '', notes: ['OLD'] } };
    const next = applyImportSuggestion(form, 'notes', {
      key: 'voices',
      value: { '1': { meta: '', notes: [] } },
      source: 'current',
    });
    expect(next.notes).toBe('');
    expect(next.voices['1'].notes).toEqual([]);
  });

  test('conflict suggestions include a Current value choice', function() {
    const current = tuneToFormValues({ name: 'Mine', rhythm: 'reel' });
    const result = applyInlineImportToForm(current, { name: 'Theirs', rhythm: 'jig', genre: 'Irish' });
    expect(result.suggestions.rhythm).toBeTruthy();
    expect(result.suggestions.rhythm.choices[0].id).toBe('current');
    expect(result.suggestions.rhythm.choices[0].preview).toBe('reel');
    expect(result.suggestions.rhythm.choices[1].id).toBe('imported');
    expect(result.suggestions.rhythm.choices[1].preview).toBe('jig');
  });

  test('lyrics conflict suggestions put Current value first', function() {
    const current = tuneToFormValues({ name: 'Mine', words: ['Old line'] });
    const result = applyInlineImportToForm(current, { name: 'Mine', words: ['New line'] });
    expect(result.suggestions.lyrics).toBeTruthy();
    expect(result.formValues.lyrics).toContain('Old line');
    expect(result.suggestions.lyrics.choices[0].id).toBe('current');
    expect(result.suggestions.lyrics.choices[0].preview).toContain('Old line');
  });

  test('ChordPro lyrics become the default merge choice', function() {
    const current = tuneToFormValues({ name: 'Mine', words: ['Old plain line'] });
    const result = buildReviewFormState(
      { name: 'Mine', words: ['Old plain line'] },
      { name: 'Mine', words: ['[G]Amazing grace how [C]sweet'] },
      'merge',
      { mergeMode: 'suggestOnly' }
    );
    expect(result.formValues.lyrics).toContain('[G]Amazing');
    expect(result.suggestions.lyrics).toBeTruthy();
    expect(result.suggestions.lyrics.choices[0].id).toBe('imported');
    expect(result.suggestions.lyrics.choices[1].id).toBe('current');
  });

  test('suggestOnly auto-fills empty listed metadata fields', function() {
    const result = buildReviewFormState(
      { name: 'Local', composer: '', key: '', meter: '', tempo: '', genres: [] },
      {
        name: 'Remote',
        composer: 'Trad',
        artists: ['Band'],
        aliases: ['aka'],
        key: 'D',
        meter: '6/8',
        tempo: 144,
        noteLength: '1/8',
        capo: 2,
        genre: 'Irish',
      },
      'merge',
      { mergeMode: 'suggestOnly' }
    );
    expect(result.formValues.artist).toBe('Trad');
    expect(result.formValues.artists).toEqual(['Band']);
    expect(result.formValues.aliases).toEqual(['aka']);
    expect(result.formValues.keyName).toBe('D');
    expect(result.formValues.meter).toBe('6/8');
    expect(result.formValues.tempo).toBe('144');
    expect(result.formValues.noteLength).toBe('1/8');
    expect(result.formValues.capo).toBe('2');
    expect(result.formValues.genres).toEqual(['Irish']);
    expect(result.suggestions.artist).toBeFalsy();
    expect(result.formValues.title).toBe('Local');
    expect(result.suggestions.title).toBeTruthy();
  });

  test('timingScaffold takes imported true without a suggestion', function() {
    const result = buildReviewFormState(
      { name: 'Local', timingScaffold: false },
      { name: 'Local', timingScaffold: true },
      'merge',
      { mergeMode: 'suggestOnly' }
    );
    expect(result.formValues.timingScaffold).toBe('true');
    expect(result.suggestions.timingScaffold).toBeFalsy();
    expect(result.autoAppliedKeys).toContain('timingScaffold');
  });

  test('timingScaffold false import is ignored', function() {
    const result = buildReviewFormState(
      { name: 'Local', timingScaffold: true },
      { name: 'Local', timingScaffold: false },
      'merge',
      { mergeMode: 'suggestOnly' }
    );
    expect(result.formValues.timingScaffold).toBe('true');
    expect(result.suggestions.timingScaffold).toBeFalsy();
  });

  test('imported key overrides existing and offers Current as revert', function() {
    const result = buildReviewFormState(
      { name: 'Local', key: 'G' },
      { name: 'Local', key: 'D' },
      'merge',
      { mergeMode: 'suggestOnly' }
    );
    expect(result.formValues.keyName).toBe('D');
    expect(result.autoAppliedKeys).toContain('key');
    expect(result.suggestions.keyName).toBeTruthy();
    expect(result.suggestions.keyName.choices.map(function(c) { return c.id; }))
      .toEqual(['imported', 'current']);
    expect(result.suggestions.keyName.choices[1].preview).toBe('G');
  });

  test('imported tempo overrides existing and offers Current as revert', function() {
    const result = buildReviewFormState(
      { name: 'Local', tempo: 100 },
      { name: 'Local', tempo: 128 },
      'merge',
      { mergeMode: 'suggestOnly' }
    );
    expect(result.formValues.tempo).toBe('128');
    expect(result.autoAppliedKeys).toContain('tempo');
    expect(result.suggestions.tempo).toBeTruthy();
  });

  test('alignedLyricPreviewPairs skips intro fluff to shared lyric lines', function() {
    const original = { words: ['Dashing through the snow', 'in a one horse open sleigh'] };
    const imported = {
      words: [
        'Intro: C G Am',
        'C . . . |',
        'Dashing through the snow',
        'in a one horse open sleigh',
      ],
    };
    const aligned = alignedLyricPreviewPairs(original, imported, 2);
    expect(aligned.original[0]).toMatch(/Dashing/i);
    expect(aligned.imported[0]).toMatch(/Dashing/i);
  });

  test('tuneHasPreexistingAbcNotesOrChords ignores empty and rest-only', function() {
    expect(tuneHasPreexistingAbcNotesOrChords(null)).toBe(false);
    expect(tuneHasPreexistingAbcNotesOrChords({ voices: { '1': { notes: ['z z z z |'] } } })).toBe(false);
    expect(tuneHasPreexistingAbcNotesOrChords({
      voices: { '1': { notes: ['C D E F |'] } },
    })).toBe(true);
    expect(tuneHasPreexistingAbcNotesOrChords({
      voices: { '1': { notes: ['"Am" z z z |'] } },
    })).toBe(true);
  });

  test('inferred key auto-applies when base has no preexisting notes or chords', function() {
    const result = buildReviewFormState(
      { name: 'Local', key: 'C', voices: { '1': { notes: [] } } },
      {
        name: 'Local',
        key: 'C',
        words: ['[G]hello [C]world [D]there [G]end'],
      },
      'merge',
      { mergeMode: 'suggestOnly' }
    );
    expect(result.formValues.keyName).toBe('G');
    expect(result.autoAppliedKeys).toContain('key');
  });

  test('inferred key does not auto-apply when base already has melody notes', function() {
    const result = buildReviewFormState(
      {
        name: 'Local',
        key: 'C',
        voices: { '1': { notes: ['C D E F | G A B c |'] } },
      },
      {
        name: 'Local',
        key: 'C',
        words: ['[G]hello [C]world [D]there [G]end'],
      },
      'merge',
      { mergeMode: 'suggestOnly' }
    );
    expect(result.formValues.keyName).toBe('C');
  });

  test('inferred key does not auto-apply when base already has ABC chords', function() {
    const result = buildReviewFormState(
      {
        name: 'Local',
        key: 'C',
        voices: { '1': { notes: ['"C" z z z | "G" z z z |'] } },
      },
      {
        name: 'Local',
        key: 'C',
        words: ['[G]hello [C]world [D]there [G]end'],
      },
      'merge',
      { mergeMode: 'suggestOnly' }
    );
    expect(result.formValues.keyName).toBe('C');
  });

  test('create mode auto-applies inferred key from lyric chords', function() {
    const result = buildReviewFormState(
      null,
      {
        name: 'New',
        key: 'C',
        words: ['[G]hello [C]world [D]there [G]end'],
      },
      'create'
    );
    expect(result.formValues.keyName).toBe('G');
  });

  test('attachCurrentValueChoice drops rest entries matching baseline', function() {
    const suggestion = attachCurrentValueChoice({
      key: 'rhythm',
      formKey: 'rhythm',
      value: 'reel',
      displayValue: 'reel',
      choices: [
        { id: 'imported', label: 'Imported', preview: 'reel', value: 'reel', source: 'import' },
        { id: 'from-abc', label: 'From abc', preview: 'jig', value: 'jig', source: 'abc' },
        { id: 'dup', label: 'From search', preview: 'jig', value: 'jig', source: 'search' },
      ],
    }, 'reel', 'reel');
    expect(suggestion.choices[0].id).toBe('current');
    expect(suggestion.choices.map(function(c) { return c.value; })).toEqual(['reel', 'jig']);
  });

  test('applyCoalescedFieldChoicesToSuggestions dedupes by semantic equality', function() {
    const form = emptyFormValues();
    form.rhythm = 'reel';
    const suggestions = {
      rhythm: attachCurrentValueChoice({
        key: 'rhythm',
        formKey: 'rhythm',
        value: 'jig',
        displayValue: 'jig',
      }, 'reel', 'reel'),
    };
    const next = applyCoalescedFieldChoicesToSuggestions(suggestions, {
      rhythm: [
        { id: 'a', label: 'From abc', preview: 'jig', value: 'jig' },
        { id: 'b', label: 'From search', preview: 'reel', value: 'reel' },
        { id: 'c', label: 'From other', preview: 'hornpipe', value: 'hornpipe' },
      ],
    }, form);
    const values = next.rhythm.choices.map(function(c) { return c.value; });
    expect(next.rhythm.choices[0].id).toBe('current');
    expect(values).toEqual(['reel', 'jig', 'hornpipe']);
  });

  test('importSuggestionDiffersFromForm hides matching values', function() {
    const form = emptyFormValues();
    form.rhythm = 'reel';
    form.bookList = 'session, dance';
    expect(importSuggestionDiffersFromForm('rhythm', {
      key: 'rhythm',
      value: 'reel',
      displayValue: 'reel',
    }, form)).toBe(false);
    expect(importSuggestionDiffersFromForm('rhythm', {
      key: 'rhythm',
      value: 'jig',
      displayValue: 'jig',
    }, form)).toBe(true);
    expect(importSuggestionDiffersFromForm('bookList', {
      key: 'books',
      value: ['session', 'dance'],
      displayValue: 'session, dance',
    }, form)).toBe(false);
  });

  test('formValuesToTune round-trips scalar fields', function() {
    const values = tuneToFormValues({
      name: 'Test',
      composer: 'Artist',
      tempo: 120,
      noteLength: '1/8',
      voices: { '1': { meta: '', notes: ['C2'] } },
      words: ['line one'],
    });
    const tune = formValuesToTune(values, { id: 'x' });
    expect(tune.name).toBe('Test');
    expect(tune.composer).toBe('Artist');
    expect(tune.tempo).toBe(120);
    expect(tune.noteLength).toBe('1/8');
    expect(tune.voices['1'].notes).toEqual(['C2']);
    expect(tune.words).toEqual(['line one']);
  });

  test('tuneToFormValues and formValuesToTune round-trip albums', function() {
    const values = tuneToFormValues({
      name: 'Song',
      albums: ['Abbey Road (1969)', 'Let It Be (1970)'],
    });
    expect(values.albums).toEqual(['Abbey Road (1969)', 'Let It Be (1970)']);
    const tune = formValuesToTune(values, { id: 'x' });
    expect(tune.albums).toEqual(['Abbey Road (1969)', 'Let It Be (1970)']);
  });

  test('unionStringLists dedupes case-insensitively preserving order', function() {
    expect(unionStringLists(['songs', 'Irish'], ['SONGS', 'chordpro'])).toEqual([
      'songs',
      'Irish',
      'chordpro',
    ]);
  });

  test('buildReviewFormState unions books and tags by default', function() {
    const existing = {
      id: '1',
      name: 'Tune',
      books: ['session'],
      tags: ['favorite'],
    };
    const imported = {
      name: 'Tune',
      books: ['songs', 'session'],
      tags: ['chordpro'],
    };
    const result = buildReviewFormState(existing, imported, 'merge');
    expect(result.formValues.bookList).toBe('session, songs');
    expect(result.formValues.tagList).toBe('favorite, chordpro');
    expect(result.suggestions.bookList).toBeUndefined();
    expect(result.suggestions.tagList).toBeUndefined();
  });

  test('shouldPreferExistingNotation when local has melody and import is scaffold', function() {
    const existing = {
      voices: { '1': { notes: ['C D E F |'] } },
    };
    const imported = {
      timingScaffold: true,
      voices: { '1': { notes: ['|:"C"z8 |]'] } },
    };
    expect(shouldPreferExistingNotation(existing, imported)).toBe(true);
    expect(shouldPreferExistingNotation(
      { voices: { '1': { notes: ['"C" z z z |'] } } },
      imported
    )).toBe(false);
  });

  test('buildReviewFormState skips scaffold notation suggestion when existing has melody', function() {
    const existing = {
      id: '1',
      name: 'Tune',
      voices: { '1': { notes: ['C D E F |'] } },
    };
    const imported = {
      name: 'Tune',
      timingScaffold: true,
      voices: { '1': { notes: ['|:"C"z8 |]'] } },
    };
    const result = buildReviewFormState(existing, imported, 'merge');
    expect(result.suggestions.notes).toBeUndefined();
    expect(result.formValues.notes).toContain('C D E F');
  });

  test('lyricPreviewLines returns first three non-empty lines', function() {
    expect(lyricPreviewLines({
      words: ['', 'One', 'Two', 'Three', 'Four'],
    }, 3)).toEqual(['One', 'Two', 'Three']);
  });

  test('notationPreviewLine returns first non-empty note line', function() {
    expect(notationPreviewLine({
      voices: { '1': { meta: '', notes: ['', 'GAB c2|', 'def g2|'] } },
    })).toBe('GAB c2|');
    expect(notationPreviewLine({})).toBe('');
  });
});
