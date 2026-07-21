import {
  asIndependentReviewCandidate,
  coalesceImportCandidates,
  mergeDraftTune,
  mergeImportDraftTune,
} from './importReviewCandidateUtils';

describe('mergeDraftTune', function() {
  test('does not let empty draft fields wipe imported ABC content', function() {
    const imported = {
      name: 'Pastoral',
      composer: 'Trad',
      voices: { '1': { meta: '', notes: ['GAB c2|'] } },
    };
    const draft = {
      name: '',
      composer: '',
      voices: { '1': { meta: '', notes: [] } },
      books: [],
    };
    const merged = mergeDraftTune(imported, draft);
    expect(merged.name).toBe('Pastoral');
    expect(merged.composer).toBe('Trad');
    expect(merged.voices['1'].notes).toEqual(['GAB c2|']);
  });

  test('keeps non-empty draft fields over import', function() {
    const imported = { name: 'Imported', composer: 'A', rhythm: 'jig' };
    const draft = { name: 'Mine', composer: '', rhythm: 'reel' };
    const merged = mergeDraftTune(imported, draft);
    expect(merged.name).toBe('Mine');
    expect(merged.composer).toBe('A');
    expect(merged.rhythm).toBe('reel');
  });
});

describe('mergeImportDraftTune', function() {
  test('replaces song fields but keeps draft books/tags/links on re-import', function() {
    const imported = {
      name: 'Brown Eyed Girl',
      composer: 'Van Morrison',
      words: ['[G]Hey where did we go'],
      books: ['irish'],
      tags: ['chordpro'],
    };
    const draft = {
      name: 'Amazing Grace',
      composer: 'John Newton',
      words: ['[G]Old lyrics'],
      books: ['songs'],
      tags: ['favorite'],
      links: [{ title: 'YouTube', link: 'https://youtu.be/example' }],
    };
    const merged = mergeImportDraftTune(imported, draft);
    expect(merged.name).toBe('Brown Eyed Girl');
    expect(merged.composer).toBe('Van Morrison');
    expect(merged.words).toEqual(['[G]Hey where did we go']);
    expect(merged.books).toEqual(['irish', 'songs']);
    expect(merged.tags).toEqual(['chordpro', 'favorite']);
    expect(merged.links).toEqual(draft.links);
  });
});

describe('asIndependentReviewCandidate', function() {
  test('keeps each audio upload as its own tune id, links, and no draft mergeTarget', function() {
    const draft = {
      tune: {
        id: 'draft-shared',
        name: 'Draft Title',
        composer: 'Draft Artist',
        links: [{ title: 'Old audio', link: 'recording:old', recordingId: 'old', source: 'file' }],
      },
      mergeTargetId: 'existing-1',
    };

    const first = asIndependentReviewCandidate({
      tune: {
        id: 'tune-a',
        name: 'Song A',
        links: [{ title: 'Song A', link: 'recording:a', recordingId: 'a', source: 'file' }],
      },
      sourceKind: 'audio',
    }, draft);

    const second = asIndependentReviewCandidate({
      tune: {
        id: 'tune-b',
        name: 'Song B',
        links: [{ title: 'Song B', link: 'recording:b', recordingId: 'b', source: 'file' }],
      },
      sourceKind: 'audio',
    }, draft);

    expect(first.tune.id).toBe('tune-a');
    expect(second.tune.id).toBe('tune-b');
    expect(first.tune.id).not.toBe(second.tune.id);
    expect(first.mergeTargetId).toBe(null);
    expect(second.mergeTargetId).toBe(null);
    expect(first.tune.links).toEqual([
      { title: 'Song A', link: 'recording:a', recordingId: 'a', source: 'file' },
    ]);
    expect(second.tune.links).toEqual([
      { title: 'Song B', link: 'recording:b', recordingId: 'b', source: 'file' },
    ]);
    expect(first.tune.links[0].recordingId).not.toBe(second.tune.links[0].recordingId);
  });

  test('fills empty title/artist from draft without copying draft links or id', function() {
    const draft = {
      tune: {
        id: 'draft-shared',
        name: 'Hint Title',
        composer: 'Hint Artist',
        links: [{ title: 'Draft link', link: 'recording:draft', recordingId: 'draft', source: 'file' }],
      },
      mergeTargetId: 'existing-1',
    };
    const next = asIndependentReviewCandidate({
      tune: {
        id: 'tune-new',
        name: '',
        composer: '',
        links: [{ title: 'New', link: 'recording:new', recordingId: 'new', source: 'file' }],
      },
      sourceKind: 'audio',
      mergeTargetId: null,
    }, draft);

    expect(next.tune.id).toBe('tune-new');
    expect(next.tune.name).toBe('Hint Title');
    expect(next.tune.composer).toBe('Hint Artist');
    expect(next.tune.links[0].recordingId).toBe('new');
    expect(next.mergeTargetId).toBe(null);
  });

  test('preserves an explicit mergeTargetId on the candidate', function() {
    const next = asIndependentReviewCandidate({
      tune: { id: 'tune-x', name: 'X', links: [] },
      sourceKind: 'audio',
      mergeTargetId: 'keep-me',
    }, { mergeTargetId: 'draft-target' });
    expect(next.mergeTargetId).toBe('keep-me');
  });
});

describe('coalesceImportCandidates', function() {
  test('keeps distinct field values as choices and unions job ids', function() {
    const survivor = {
      id: 'c1',
      sourceKind: 'abc',
      mergeTargetId: 'tune-1',
      tune: { name: 'Song', composer: 'From ABC' },
      fieldLookupJobIds: [],
    };
    const other = {
      id: 'c2',
      sourceKind: 'search-composer',
      mergeTargetId: 'tune-1',
      tune: { name: 'Song', composer: 'From Search' },
      fieldLookupJobId: 'job-composer',
      fieldLookupKind: 'composer',
    };
    const coalesced = coalesceImportCandidates(survivor, [other]);
    expect(coalesced.tune.composer).toBe('From ABC');
    expect(coalesced.fieldLookupJobIds).toEqual(['job-composer']);
    expect(coalesced.coalescedSourceKinds).toEqual(expect.arrayContaining(['abc', 'search-composer']));
    expect(coalesced.fieldChoices.artist.length).toBeGreaterThanOrEqual(2);
    const composerValues = coalesced.fieldChoices.artist.map(function(choice) {
      return choice.value;
    });
    expect(composerValues).toEqual(expect.arrayContaining(['From ABC', 'From Search']));
  });
});
