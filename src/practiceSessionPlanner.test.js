import {
  buildPracticeSessionPlan,
  collectPracticeCandidates,
  normalizePracticeKey,
  pickPracticeKey,
  pitchOffsetToPracticeKey,
  selectRouteForTune,
  isPlayableTune,
} from './practiceSessionPlanner'

const helpers = {
  hasLinks: function(tune) {
    return !!(tune && Array.isArray(tune.links) && tune.links.length > 0 && tune.links[0].link)
  },
  hasNotesOrChords: function(tune) {
    return !!(tune && tune.voices && Object.keys(tune.voices).length > 0)
  },
  filterSearch: function(tune, filter, bookFilter, tagFilter) {
    if (bookFilter && (!tune.books || !tune.books.some(function(b) { return b.toLowerCase() === bookFilter.toLowerCase() }))) {
      return false
    }
    if (Array.isArray(tagFilter) && tagFilter.length > 0) {
      const tags = tune.tags || []
      return tagFilter.every(function(t) { return tags.indexOf(t) !== -1 })
    }
    return true
  },
}

function makeTune(id, overrides) {
  return Object.assign({
    id,
    name: id,
    key: 'D',
    books: [],
    tags: [],
    boost: 0,
    voices: { v: { notes: ['CDEF|'] } },
    links: [],
  }, overrides || {})
}

describe('practiceSessionPlanner', function() {
  it('picks majority practice key', function() {
    const tunes = [
      makeTune('a', { key: 'G' }),
      makeTune('b', { key: 'G' }),
      makeTune('c', { key: 'D' }),
    ]
    expect(pickPracticeKey(tunes)).toBe('G')
    expect(normalizePracticeKey('Am')).toBe('Am')
    expect(normalizePracticeKey('D')).toBe('D')
  })

  it('prefers media route when links exist', function() {
    const tune = makeTune('t1', { links: [{ link: 'https://example.com/a.mp3' }] })
    expect(selectRouteForTune(tune, helpers).route).toBe('media')
  })

  it('uses midi when no links', function() {
    const tune = makeTune('t2')
    expect(selectRouteForTune(tune, helpers).route).toBe('midi')
  })

  it('collects all playable tunes when no filters', function() {
    const tunes = {
      a: makeTune('a'),
      b: makeTune('b', { voices: null, links: [{ link: 'x' }] }),
      c: makeTune('c', { voices: null, links: [] }),
    }
    delete tunes.c.voices
    const result = collectPracticeCandidates(tunes, {}, helpers)
    expect(result.map(function(t) { return t.id }).sort()).toEqual(['a', 'b'])
  })

  it('builds plan with warmups and media-first tunes', function() {
    const tunes = {
      m1: makeTune('m1', { key: 'D', links: [{ link: 'https://x.com/1.mp3', startAt: '0', endAt: '60' }], boost: 5 }),
      m2: makeTune('m2', { key: 'D', boost: 1 }),
    }
    const plan = buildPracticeSessionPlan({
      totalMinutes: 10,
      includeWarmups: true,
      tunes,
      helpers,
    })
    expect(plan.practiceKey).toBe('D')
    expect(plan.steps[0].type).toBe('warmup')
    const tuneSteps = plan.steps.filter(function(s) { return s.type === 'tune' })
    expect(tuneSteps.length).toBeGreaterThan(0)
    expect(tuneSteps.some(function(s) { return s.route === 'media' })).toBe(true)
    expect(tuneSteps.find(function(s) { return s.tuneId === 'm1' }).route).toBe('media')
    expect(tuneSteps[0].tempoStart).toBeLessThanOrEqual(tuneSteps[0].tempoEnd)
  })

  it('applies skill level tempo range to tune steps', function() {
    const tunes = { a: makeTune('a', { key: 'D' }) }
    const plan = buildPracticeSessionPlan({
      totalMinutes: 10,
      includeWarmups: false,
      skillLevel: 2,
      tunes,
      helpers,
    })
    const tuneStep = plan.steps.find(function(s) { return s.type === 'tune' })
    expect(tuneStep.tempoStart).toBe(0.5)
    expect(tuneStep.tempoEnd).toBeCloseTo(0.8, 5)
    expect(plan.skillLevel).toBe(2)
  })

  it('computes pitch offset for non-matching keys', function() {
    expect(pitchOffsetToPracticeKey('C', 'G')).toBe(-5)
    expect(pitchOffsetToPracticeKey('G', 'G')).toBe(0)
  })

  it('includes booked tunes when no filters are set', function() {
    const tunes = {
      a: makeTune('a', { books: ['folk'], voices: { v: { notes: ['DEFG|'] } } }),
      b: makeTune('b', { books: ['jigs'], links: [{ link: 'https://example.com/x.mp3' }] }),
    }
    const result = collectPracticeCandidates(tunes, {}, helpers)
    expect(result.map(function(t) { return t.id }).sort()).toEqual(['a', 'b'])
  })

  it('reports a clearer error when the library has no playable tunes', function() {
    const plan = buildPracticeSessionPlan({ tunes: { x: makeTune('x', { voices: null, links: [] }) }, helpers })
    delete plan.steps
    expect(plan.error).toBe('No playable tunes found in your tune book.')
  })
})
