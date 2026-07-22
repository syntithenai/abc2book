import { mergeById, mergeTombstones, applyTombstones } from './scratchpadCloudSync'

describe('scratchpadCloudSync merge helpers', function() {
  test('mergeById prefers newer updatedAt', function() {
    const merged = mergeById(
      [{ id: 'a', updatedAt: '2020-01-02T00:00:00.000Z', title: 'local' }],
      [{ id: 'a', updatedAt: '2020-01-01T00:00:00.000Z', title: 'remote' }]
    )
    expect(merged[0].title).toBe('local')
  })

  test('mergeTombstones keeps latest deletedAt', function() {
    const merged = mergeTombstones(
      [{ id: 'x', deletedAt: '2020-01-01T00:00:00.000Z' }],
      [{ id: 'x', deletedAt: '2020-01-02T00:00:00.000Z' }]
    )
    expect(merged[0].deletedAt).toBe('2020-01-02T00:00:00.000Z')
  })

  test('applyTombstones removes tombstoned items', function() {
    const items = [{ id: 'a', updatedAt: '2020-01-01T00:00:00.000Z' }]
    const tombstones = [{ id: 'a', deletedAt: '2020-01-02T00:00:00.000Z' }]
    expect(applyTombstones(items, tombstones).length).toBe(0)
  })
})
