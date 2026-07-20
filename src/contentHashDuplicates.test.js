import { detectContentHashDuplicates } from './contentHashDuplicates'

describe('detectContentHashDuplicates title gate', function() {
  const tunebook = {
    abcTools: {
      getTuneImportHash: function(tune) {
        return 'shared-hash'
      },
    },
  }
  const tunesHash = {
    importhashes: { 'shared-hash': 'local-1' },
  }

  test('rejects hash duplicate when titles differ', function() {
    const split = detectContentHashDuplicates(
      [{ tune: { name: 'A Flag Of Our Own' } }],
      tunebook,
      tunesHash,
      { 'local-1': { id: 'local-1', name: "Maggie Brown's Favourite" } }
    )
    expect(split.duplicates).toHaveLength(0)
    expect(split.nonDuplicates).toHaveLength(1)
  })

  test('keeps hash duplicate when titles match', function() {
    const split = detectContentHashDuplicates(
      [{ tune: { name: 'Same Song' } }],
      tunebook,
      tunesHash,
      { 'local-1': { id: 'local-1', name: 'Same Song' } }
    )
    expect(split.duplicates).toHaveLength(1)
    expect(split.duplicates[0].mergeTargetId).toBe('local-1')
  })
})
