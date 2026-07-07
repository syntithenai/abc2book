import {
  clearLinkCheckSession,
  getLinkCheckSession,
  saveLinkCheckSession,
} from './linkCheckSessionStore'

describe('linkCheckSessionStore', function() {
  beforeEach(function() {
    clearLinkCheckSession()
  })

  test('stores and retrieves session by selection key', function() {
    saveLinkCheckSession({
      selectionKey: 'a,b',
      phase: 'done',
      failures: [{ tuneId: 'a', error: 'bad' }],
      progressMessage: 'Finished',
      checkedCount: 3,
      totalCount: 3,
      progressPercent: 100,
    })

    const loaded = getLinkCheckSession('a,b')
    expect(loaded).not.toBeNull()
    expect(loaded.phase).toBe('done')
    expect(loaded.failures).toHaveLength(1)
    expect(getLinkCheckSession('x,y')).toBeNull()
  })
})
