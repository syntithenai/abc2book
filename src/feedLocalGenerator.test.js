import { generateLocalFeedItems } from './feedLocalGenerator'
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

  it('skips quiz when not enough distractors', function() {
    const items = generateLocalFeedItems({ tunes: tunes, viewIds: ['t1'] })
    // only one other artist in viewIds → not enough distractors
    expect(items.some(function(i) { return i.type === 'quiz' })).toBe(false)
  })

  it('creates quiz when enough artist distractors', function() {
    const items = generateLocalFeedItems({
      tunes: tunes,
      viewIds: ['t1', 't2', 't3', 't4'],
      rng: function() { return 0 },
    })
    expect(items.some(function(i) { return i.type === 'quiz' })).toBe(true)
  })
})
