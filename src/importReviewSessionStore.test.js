import {
  __resetImportReviewSessionStoreForTests,
  clearImportReviewSession,
  getImportReviewSession,
  hasActiveImportReviewSession,
  setImportReviewSession,
} from './importReviewSessionStore'
import { createBlankAddCandidate, createImportReviewSession } from './importReviewSession'

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

  test('module hydrates active session from sessionStorage', function() {
    const session = createImportReviewSession(
      [createBlankAddCandidate({ book: 'songs' })],
      { entryMode: 'add' }
    )
    session.candidates[0].tune.name = 'The Wild Rover'
    sessionStorage.setItem('abc2book.importReviewSession', JSON.stringify(session))

    jest.isolateModules(function() {
      const store = require('./importReviewSessionStore')
      expect(store.hasActiveImportReviewSession()).toBe(true)
      expect(store.getImportReviewSession().candidates[0].tune.name).toBe('The Wild Rover')
      store.__resetImportReviewSessionStoreForTests()
    })
  })
})
