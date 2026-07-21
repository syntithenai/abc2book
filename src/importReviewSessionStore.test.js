import {
  __resetImportReviewSessionStoreForTests,
  clearImportReviewSession,
  getImportReviewSession,
  getImportReviewSessionRevision,
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

  test('revision changes when addPanelMode changes', function() {
    const session = createImportReviewSession(
      [createBlankAddCandidate({ book: 'songs' })],
      { entryMode: 'add' }
    )
    setImportReviewSession(session)
    const before = getImportReviewSessionRevision()

    setImportReviewSession(Object.assign({}, session, { addPanelMode: 'curated' }))
    const after = getImportReviewSessionRevision()

    expect(after).not.toBe(before)
    expect(after).toContain('curated')
  })

  test('revision changes when current candidate tune is updated inline', function() {
    const session = createImportReviewSession(
      [createBlankAddCandidate({ book: 'songs', candidateId: 'add-1' })],
      { entryMode: 'add' }
    )
    setImportReviewSession(session)
    const before = getImportReviewSessionRevision()

    const candidate = Object.assign({}, session.candidates[0], {
      sourceKind: 'chordsheet',
      inlineImportRevision: 1,
      inlineFormValues: { title: 'Brown Eyed Girl', artist: 'Van Morrison', lyrics: '' },
      tune: Object.assign({}, session.candidates[0].tune, {
        name: 'Brown Eyed Girl',
        composer: 'Van Morrison',
      }),
    })
    setImportReviewSession(Object.assign({}, session, {
      candidates: [candidate],
    }))
    const after = getImportReviewSessionRevision()

    expect(after).not.toBe(before)
  })
})
