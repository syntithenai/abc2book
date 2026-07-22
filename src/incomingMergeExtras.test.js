import { applyRecordFieldMerge } from './incomingMergeUtils';

function makeTune(id, extra) {
  return Object.assign({
    id: id,
    name: 'Tune',
    books: [],
    tags: [],
    links: [],
    tuneFiles: [],
    lastUpdated: 1000,
  }, extra || {});
}

describe('applyRecordFieldMerge collection extras', function() {
  test('unions tags links and snapshots even when only name is selected', function() {
    const merged = applyRecordFieldMerge({
      kind: 'update',
      localTune: makeTune('t1', {
        name: 'Local',
        tags: ['local-tag'],
        links: [{ title: 'A', link: 'https://youtu.be/abc12345678' }],
        tuneFiles: [{ id: 'f1', name: 'local.pdf', type: 'application/pdf' }],
      }),
      incomingTune: makeTune('t1', {
        name: 'Remote',
        tags: ['remote-tag'],
        links: [{ title: 'B', link: 'https://youtu.be/xyz98765432' }],
        tuneFiles: [{ id: 'f2', name: 'remote.png', type: 'image/png' }],
        lastUpdated: 2000,
      }),
    }, { name: true });

    expect(merged.name).toBe('Remote');
    expect(merged.tags).toEqual(expect.arrayContaining(['local-tag', 'remote-tag']));
    expect(merged.links).toHaveLength(2);
    expect(merged.tuneFiles).toHaveLength(2);
  });
});
