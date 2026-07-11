import {
  asIndependentReviewCandidate,
} from './importReviewCandidateUtils';

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
