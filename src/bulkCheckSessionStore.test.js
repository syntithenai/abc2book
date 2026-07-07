import {
  buildBulkCheckSessionBase,
  clearBulkCheckSession,
  getBulkCheckSession,
  saveBulkCheckSession,
} from './bulkCheckSessionStore'

describe('bulkCheckSessionStore', function() {
  beforeEach(function() {
    clearBulkCheckSession()
  })

  test('stores and retrieves full bulk check session', function() {
    saveBulkCheckSession({
      selectionKey: 'a,b',
      phase: 'done',
      activeTab: 'completeness',
      links: {
        failures: [{ tuneId: 'a', error: 'bad' }],
        warnings: [{ tuneId: 'b', missing: ['startAt'] }],
        progressMessage: 'Finished',
        checkedCount: 2,
        totalCount: 2,
        progressPercent: 100,
      },
      completeness: { issues: [{ tuneId: 'b', issues: [] }] },
      abcCorrectness: { issues: [] },
    })

    const loaded = getBulkCheckSession('a,b')
    expect(loaded).not.toBeNull()
    expect(loaded.phase).toBe('done')
    expect(loaded.activeTab).toBe('completeness')
    expect(loaded.links.failures).toHaveLength(1)
    expect(loaded.links.warnings).toHaveLength(1)
    expect(loaded.completeness.issues).toHaveLength(1)
    expect(getBulkCheckSession('x,y')).toBeNull()
  })

  test('buildBulkCheckSessionBase creates empty sections', function() {
    const base = buildBulkCheckSessionBase('1,2', 3)
    expect(base.selectionKey).toBe('1,2')
    expect(base.links.totalCount).toBe(3)
    expect(base.completeness.issues).toEqual([])
  })
})
