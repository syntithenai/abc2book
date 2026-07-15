import {
  __resetImportReviewSessionStoreForTests,
  clearImportReviewSession,
  getImportReviewSession,
  hasActiveImportReviewSession,
  isImportReviewUiVisible,
  openImportReviewFromToast,
  setImportReviewSession,
} from './importReviewSessionStore'
import { createBlankAddCandidate, createImportReviewSession, isAddTunesChrome } from './importReviewSession'

describe('importReviewSessionStore persistence', function() {
  beforeEach(function() {
    sessionStorage.clear()
    __resetImportReviewSessionStoreForTests()
  })

  afterEach(function() {
    __resetImportReviewSessionStoreForTests()
    sessionStorage.clear()
  })

  test('setImportReviewSession writes active session to sessionStorage', function() {
    const session = createImportReviewSession(
      [createBlankAddCandidate({ book: 'songs' })],
      { entryMode: 'add' }
    )
    session.candidates[0].tune.name = 'Whiskey in the Jar'

    setImportReviewSession(session)

    const raw = sessionStorage.getItem('abc2book.importReviewSession')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw)
    expect(parsed.entryMode).toBe('add')
    expect(parsed.candidates[0].tune.name).toBe('Whiskey in the Jar')
  })

  test('clearImportReviewSession removes storage', function() {
    const session = createImportReviewSession(
      [createBlankAddCandidate({ book: 'songs' })],
      { entryMode: 'add' }
    )
    setImportReviewSession(session)
    clearImportReviewSession()
    expect(sessionStorage.getItem('abc2book.importReviewSession')).toBeNull()
    expect(hasActiveImportReviewSession()).toBe(false)
  })

  test('openImportReviewFromToast switches Add tunes chrome to Import review', function() {
    const session = createImportReviewSession(
      [createBlankAddCandidate({ book: 'songs' })],
      { entryMode: 'add' }
    )
    setImportReviewSession(session)
    expect(isAddTunesChrome(getImportReviewSession())).toBe(true)

    openImportReviewFromToast()

    expect(isImportReviewUiVisible()).toBe(true)
    expect(getImportReviewSession().entryMode).toBe('import')
    expect(isAddTunesChrome(getImportReviewSession())).toBe(false)
  })
})
