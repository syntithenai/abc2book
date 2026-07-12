import {
  applyImportSuggestion,
  applyInlineImportToForm,
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
    expect(canApplyImportInline('musicxml')).toBe(false);
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

  test('applyInlineImportToForm fills empty ABC voices and notes', function() {
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
    expect(result.formValues.voices['1'].notes).toEqual(['GAB c2|']);
    expect(result.formValues.notes).toContain('GAB c2|');
    expect(result.autoAppliedKeys).toContain('voices');
    expect(result.suggestions.notes).toBeUndefined();
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
