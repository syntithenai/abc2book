import { generateLocalFeedItems, dedupeQuizQuestionsByArtist, tuneHasNotation } from './feedLocalGenerator'
import { extractFactsFromTune } from './feedFactExtractors'

describe('feedLocalGenerator', function() {
  const tunes = {
    t1: {
      id: 't1',
      name: 'Wild Rover',
      composer: 'The Dubliners',
      artists: ['The Dubliners'],
      aliases: ['The Wild Rover'],
      backgroundInfo: [
        '## Origin and first recording',
        'The song was popularized in 1963 by The Dubliners on an early album release.',
        '## Historical anecdotes',
        'Radio stations once hesitated to play the chorus because of its rowdy reputation.',
      ].join('\n'),
    },
    t2: {
      id: 't2',
      name: 'Foggy Dew',
      composer: 'Various',
      artists: ['The Chieftains'],
      aliases: [],
      backgroundInfo: '',
    },
    t3: {
      id: 't3',
      name: 'Other Tune',
      composer: 'Artist Three',
      artists: [],
      aliases: [],
      backgroundInfo: '',
    },
    t4: {
      id: 't4',
      name: 'Fourth',
      composer: 'Artist Four',
      artists: [],
      aliases: [],
      backgroundInfo: '',
    },
  }

  it('extracts alias and year facts', function() {
    const facts = extractFactsFromTune(tunes.t1)
    expect(facts.some(function(f) { return f.predicate === 'also_known_as' })).toBe(true)
    expect(facts.some(function(f) { return f.objectYear === 1963 })).toBe(true)
  })

  it('generates dyk and news for rich background', function() {
    const items = generateLocalFeedItems({ tunes: tunes, viewIds: ['t1'] })
    expect(items.some(function(i) { return i.type === 'dyk' })).toBe(true)
    expect(items.some(function(i) { return i.type === 'news' })).toBe(true)
    expect(items[0].headline.indexOf('Wild Rover')).toBeGreaterThan(-1)
  })

  it('skips thin quiz cards when a lone tune yields fewer than 3 questions', function() {
    const items = generateLocalFeedItems({ tunes: tunes, viewIds: ['t1'] })
    expect(items.some(function(i) { return i.type === 'quiz' })).toBe(false)
  })

  it('creates multi-question quiz when enough artist distractors', function() {
    const items = generateLocalFeedItems({
      tunes: tunes,
      viewIds: ['t1', 't2', 't3', 't4'],
      rng: function() { return 0 },
    })
    const quiz = items.find(function(i) { return i.type === 'quiz' })
    expect(quiz).toBeTruthy()
    expect(quiz.quiz.questions.length).toBeGreaterThanOrEqual(2)
  })

  it('includes lyrics on From your recent cards', function() {
    const withLyrics = Object.assign({}, tunes.t1, {
      words: ['I\'ve been a wild rover for many\'s a year', 'And I spent all my money on whiskey and beer'],
    })
    const items = generateLocalFeedItems({
      tunes: { t1: withLyrics },
      viewIds: ['t1'],
    })
    const dyk = items.find(function(i) { return i.type === 'dyk' })
    expect(dyk).toBeTruthy()
    expect(dyk.lyrics).toContain('wild rover')
    expect(dyk.body).toContain('## Lyrics')
    expect(dyk.body).toContain('whiskey and beer')
    expect(dyk.showNotation).toBe(false)
  })

  it('flags notation when recent tune has notes but no lyrics', function() {
    const withNotes = Object.assign({}, tunes.t1, {
      words: [],
      voices: { '1': { meta: '', notes: ['CDEF|GABc|'] } },
    })
    expect(tuneHasNotation(withNotes)).toBe(true)
    const items = generateLocalFeedItems({
      tunes: { t1: withNotes },
      viewIds: ['t1'],
    })
    const dyk = items.find(function(i) { return i.type === 'dyk' })
    expect(dyk.showNotation).toBe(true)
    expect(dyk.lyrics).toBe('')
  })

  it('dedupeQuizQuestionsByArtist keeps one question per artist', function() {
    const qs = dedupeQuizQuestionsByArtist([
      { id: 'a', aboutArtist: 'Brooke Marshal', prompt: 'Who wrote A?' },
      { id: 'b', aboutArtist: 'Brooke Marshal', prompt: 'Which tune by Brooke?' },
      { id: 'c', aboutArtist: 'Other Artist', prompt: 'Who wrote C?' },
      { id: 'd', prompt: 'What year?' },
    ])
    expect(qs.map(function(q) { return q.id })).toEqual(['a', 'c', 'd'])
  })

  it('adds a key-signature question for recent tunes with a key', function() {
    const withKey = Object.assign({}, tunes.t1, { key: 'G' })
    const others = {
      t1: withKey,
      t2: Object.assign({}, tunes.t2, { key: 'D' }),
      t3: Object.assign({}, tunes.t3, { key: 'Am' }),
      t4: Object.assign({}, tunes.t4, { key: 'Em' }),
    }
    const items = generateLocalFeedItems({
      tunes: others,
      viewIds: ['t1', 't2', 't3', 't4'],
      rng: function() { return 0.3 },
    })
    const quiz = items.find(function(i) { return i.type === 'quiz' && i.tuneId === 't1' })
      || items.find(function(i) { return i.type === 'quiz' })
    expect(quiz).toBeTruthy()
    const keyQ = quiz.quiz.questions.find(function(q) {
      return String(q.prompt || '').indexOf('key signature') !== -1
    })
    expect(keyQ).toBeTruthy()
    const correct = keyQ.choices.find(function(c) { return c.correct })
    expect(correct.text).toBe('G')
  })
})
