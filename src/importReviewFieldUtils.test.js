import {
  applyImportSuggestion,
  applyInlineImportToForm,
  applyCoalescedFieldChoicesToSuggestions,
  attachCurrentValueChoice,
  buildReviewFormState,
  canApplyImportInline,
  emptyFormValues,
  formValuesToTune,
  importSuggestionDiffersFromForm,
  mergeImportedLinks,
  tuneToFormValues,
} from './importReviewFieldUtils';

describe('importReviewFieldUtils', function() {
  test('canApplyImportInline recognizes local parse kinds', function() {
    expect(canApplyImportInline('abc')).toBe(true);
    expect(canApplyImportInline('chordsheet')).toBe(true);
    expect(canApplyImportInline('bulk-text')).toBe(true);
    expect(canApplyImportInline('musicxml')).toBe(false);
    expect(canApplyImportInline('mscz')).toBe(false);
    expect(canApplyImportInline('onsong')).toBe(false);
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
    expect(result.formValues.genre).toBe('Irish');
    expect(result.suggestions.rhythm).toBeTruthy();
  });

  test('applyInlineImportToForm keeps empty notation and offers Use choices', function() {
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
    expect(String(result.formValues.notes || '').trim()).toBe('');
    expect(result.autoAppliedKeys).not.toContain('voices');
    expect(result.suggestions.notes).toBeTruthy();
    expect(result.suggestions.notes.choices.map(function(c) { return c.id; })).toEqual(['current', 'imported']);
    expect(result.suggestions.notes.choices[0].preview).toBe('(empty)');
    expect(result.suggestions.notes.choices[1].preview).toContain('GAB c2|');
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
    expect(result.suggestions.lyrics.choices[0].id).toBe('current');
    expect(result.suggestions.lyrics.choices[0].preview).toContain('Old line');
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
      wLines: ['line one'],
    });
    const tune = formValuesToTune(values, { id: 'x' });
    expect(tune.name).toBe('Test');
    expect(tune.composer).toBe('Artist');
    expect(tune.tempo).toBe(120);
    expect(tune.noteLength).toBe('1/8');
    expect(tune.voices['1'].notes).toEqual(['C2']);
    expect(tune.wLines).toEqual(['line one']);
  });
});
