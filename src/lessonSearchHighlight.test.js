import {
  splitTextByHighlight,
  normalizeHighlightTerm,
  highlightTermFromSearch,
  highlightTermFromLocation,
  findBestHighlightTerm,
  collectLessonSearchableText,
  resolveLessonHighlightQuery,
  writeStoredLessonSearchHighlight,
  readStoredLessonSearchHighlight,
  clearStoredLessonSearchHighlight,
} from './lessonSearchHighlight'

describe('lessonSearchHighlight', function() {
  test('splitTextByHighlight is case insensitive', function() {
    const parts = splitTextByHighlight('The Fleadh Cheoil', 'fleadh')
    expect(parts).toEqual([
      { text: 'The ', match: false },
      { text: 'Fleadh', match: true },
      { text: ' Cheoil', match: false },
    ])
  })

  test('splitTextByHighlight returns plain text when term empty', function() {
    expect(splitTextByHighlight('Hello', '')).toEqual([{ text: 'Hello', match: false }])
  })

  test('highlightTermFromSearch reads q param', function() {
    expect(highlightTermFromSearch('?q=fleadh')).toBe('fleadh')
    expect(highlightTermFromSearch('')).toBe('')
    expect(normalizeHighlightTerm('  uilleann  ')).toBe('uilleann')
  })

  test('highlightTermFromLocation reads search and state', function() {
    expect(highlightTermFromLocation({ search: '?q=session' })).toBe('session')
    expect(highlightTermFromLocation({ state: { lessonSearchHighlight: 'Gaeltacht' } })).toBe('Gaeltacht')
    expect(highlightTermFromLocation({})).toBe('')
  })

  test('findBestHighlightTerm prefers full query then longest matching word', function() {
    const lesson = {
      sections: [{
        id: 'overview',
        title: 'Overview',
        blocks: [{ type: 'markdown', text: 'The session starts in a pub.' }],
      }],
    }
    expect(findBestHighlightTerm('session', lesson)).toBe('session')
    expect(findBestHighlightTerm('pub session', lesson)).toBe('session')
    expect(findBestHighlightTerm('missing phrase session', lesson)).toBe('session')
    expect(collectLessonSearchableText(lesson)).toMatch(/session/)
  })

  test('stored highlight survives resolveLessonHighlightQuery', function() {
    const lesson = {
      id: 'lesson-a',
      sections: [{
        id: 'overview',
        title: 'Overview',
        blocks: [{ type: 'markdown', text: 'The session starts here.' }],
      }],
    }
    writeStoredLessonSearchHighlight('lesson-a', 'session')
    expect(readStoredLessonSearchHighlight('lesson-a')).toBe('session')
    expect(resolveLessonHighlightQuery({
      lesson: lesson,
      lessonId: 'lesson-a',
      pending: null,
      location: {},
      searchParams: new URLSearchParams(),
    })).toBe('session')
    clearStoredLessonSearchHighlight()
    expect(readStoredLessonSearchHighlight('lesson-a')).toBe('')
  })
})
