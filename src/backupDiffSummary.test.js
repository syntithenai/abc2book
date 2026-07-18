import { summarizeBackupDiff } from './backupDiffSummary'

describe('summarizeBackupDiff', function() {
  test('reports tunes only in version, only in current, and changed fields', function() {
    const current = {
      a: { id: 'a', name: 'Alpha', books: ['Session'], key: 'G' },
      b: { id: 'b', name: 'Beta', books: ['Session'], key: 'D' },
      c: { id: 'c', name: 'Current Only', books: [], key: 'C' },
    }
    const version = [
      { id: 'a', name: 'Alpha', books: ['Session'], key: 'G' },
      { id: 'b', name: 'Beta', books: ['Session'], key: 'A' },
      { id: 'd', name: 'Version Only', books: [], key: 'F' },
    ]

    const summary = summarizeBackupDiff(current, version)

    expect(summary.onlyInVersion).toEqual([{ id: 'd', name: 'Version Only' }])
    expect(summary.onlyInCurrent).toEqual([{ id: 'c', name: 'Current Only' }])
    expect(summary.changed).toHaveLength(1)
    expect(summary.changed[0].id).toBe('b')
    expect(summary.changed[0].name).toBe('Beta')
    expect(summary.changed[0].fields).toContain('Key')
    expect(summary.totalChanges).toBe(3)
  })

  test('returns empty summary when books match', function() {
    const tunes = {
      a: { id: 'a', name: 'Same', books: ['Book'], key: 'G' },
    }
    const summary = summarizeBackupDiff(tunes, [{ id: 'a', name: 'Same', books: ['Book'], key: 'G' }])
    expect(summary.totalChanges).toBe(0)
    expect(summary.onlyInVersion).toEqual([])
    expect(summary.onlyInCurrent).toEqual([])
    expect(summary.changed).toEqual([])
  })

  test('accepts version tunes as an object map', function() {
    const summary = summarizeBackupDiff(
      { a: { id: 'a', name: 'Keep' } },
      { b: { id: 'b', name: 'Extra' } }
    )
    expect(summary.onlyInVersion).toEqual([{ id: 'b', name: 'Extra' }])
    expect(summary.onlyInCurrent).toEqual([{ id: 'a', name: 'Keep' }])
  })
})
