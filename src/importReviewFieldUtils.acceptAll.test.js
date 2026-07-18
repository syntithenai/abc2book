import {
  acceptAllImportSuggestions,
  keepAllLocalImportSuggestions,
  buildReviewFormState,
} from './importReviewFieldUtils';

describe('accept all import fields', function() {
  test('suggestOnly does not auto-apply conflicting fields', function() {
    const base = { name: 'Local', composer: 'A', key: 'G' };
    const imported = { name: 'Remote', composer: 'B', key: 'D' };
    const built = buildReviewFormState(base, imported, 'merge', { mergeMode: 'suggestOnly' });
    expect(built.formValues.title).toBe('Local');
    expect(built.suggestions.title).toBeTruthy();
    expect(built.suggestions.artist).toBeTruthy();
  });

  test('acceptAllImportSuggestions applies pending imports', function() {
    const formValues = { title: 'Local', artist: 'A', lyrics: '', notes: '', links: [] };
    const suggestions = {
      title: { key: 'name', formKey: 'title', value: 'Remote', displayValue: 'Remote' },
      artist: { key: 'composer', formKey: 'artist', value: 'B', displayValue: 'B' },
    };
    const next = acceptAllImportSuggestions(formValues, suggestions);
    expect(next.formValues.title).toBe('Remote');
    expect(next.formValues.artist).toBe('B');
    expect(Object.keys(next.suggestions)).toHaveLength(0);
  });

  test('keepAllLocalImportSuggestions clears suggestions', function() {
    const formValues = { title: 'Local' };
    const next = keepAllLocalImportSuggestions(formValues, {
      title: { key: 'name', value: 'Remote' },
    });
    expect(next.formValues.title).toBe('Local');
    expect(Object.keys(next.suggestions)).toHaveLength(0);
  });
});
