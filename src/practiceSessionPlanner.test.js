import {
  buildPracticeSessionPlan,
  collectPracticeCandidates,
  derivePracticeContextFromRecentTunes,
  getTuneConfidence,
  normalizePracticeKey,
  orderPracticeCandidates,
  pickPracticeKey,
  pitchOffsetToPracticeKey,
  selectRouteForTune,
  isPlayableTune,
  tuneMatchesPracticeContent,
  tuneMatchesRecentPracticeContext,
} from './practiceSessionPlanner'
import { noteLinesHaveRealMelody } from './timedImportFinalizer'

const helpers = {
  hasLinks: function(tune) {
    return !!(tune && Array.isArray(tune.links) && tune.links.length > 0 && tune.links[0].link)
  },
  hasNotesOrChords: function(tune) {
    return !!(tune && tune.voices && Object.keys(tune.voices).length > 0)
  },
  hasNotes: function(tune) {
    if (!tune || !tune.voices) return false
    return Object.values(tune.voices).some(function(voice) {
      return noteLinesHaveRealMelody(voice && voice.notes)
    })
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
    lastUpdated: Date.now(),
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

  it('requires lyrics for voice practice', function() {
    const withLyrics = makeTune('song', { wLines: ['Hello world'] })
    const melodyOnly = makeTune('tune')
    expect(tuneMatchesPracticeContent(withLyrics, 'voice', helpers)).toBe(true)
    expect(tuneMatchesPracticeContent(melodyOnly, 'voice', helpers)).toBe(false)
  })

  it('requires melody notes for non-voice practice', function() {
    const melody = makeTune('melody')
    const chordsOnly = makeTune('chords', { voices: { v: { notes: ['"C" "G" "Am"'] } } })
    expect(tuneMatchesPracticeContent(melody, 'mandolin', helpers)).toBe(true)
    expect(tuneMatchesPracticeContent(chordsOnly, 'mandolin', helpers)).toBe(false)
  })

  it('includes all playable tunes from a practice list', function() {
    const tunes = {
      ok: makeTune('ok'),
      other: makeTune('other'),
    }
    const result = collectPracticeCandidates(tunes, { practiceListTuneIds: ['ok', 'other'] }, helpers, { instrument: 'mandolin' })
    expect(result.map(function(t) { return t.id }).sort()).toEqual(['ok', 'other'])
  })

  it('collects voice candidates with lyrics only', function() {
    const now = Date.now()
    const tunes = {
      song: makeTune('song', { wLines: ['Sing me'], lastUpdated: now }),
      tune: makeTune('tune', { lastUpdated: now - 1000 }),
    }
    const result = collectPracticeCandidates(tunes, { practiceListTuneIds: ['song', 'tune'] }, helpers, { instrument: 'voice' })
    expect(result.map(function(t) { return t.id })).toEqual(['song'])
  })

  it('collects playable tunes from a practice list', function() {
    const now = Date.now()
    const tunes = {
      recent: makeTune('recent', { books: ['folk'], tags: ['fast'], lastUpdated: now }),
      matchBook: makeTune('matchBook', { books: ['folk'], lastUpdated: now - 1000 }),
      matchTag: makeTune('matchTag', { tags: ['fast'], lastUpdated: now - 2000 }),
      other: makeTune('other', { books: ['jigs'], tags: ['slow'], lastUpdated: now - 3000 }),
      unplayable: makeTune('unplayable', { voices: null, links: [], lastUpdated: now - 4000 }),
    }
    delete tunes.unplayable.voices
    const result = collectPracticeCandidates(
      tunes,
      { practiceListTuneIds: ['recent', 'matchBook', 'unplayable'] },
      helpers,
      { instrument: 'mandolin' }
    )
    expect(result.map(function(t) { return t.id }).sort()).toEqual(['matchBook', 'recent'])
  })

  it('orders candidates by increasing confidence', function() {
    const candidates = [
      makeTune('low', { boost: 2 }),
      makeTune('high', { boost: 8 }),
      makeTune('other', { boost: 1 }),
    ]
    const ordered = orderPracticeCandidates(candidates, {
      instrument: 'mandolin',
      minConfidence: 3,
      minCount: 2,
    })
    expect(ordered.map(function(t) { return t.id })).toEqual(['other', 'low', 'high'])
  })

  it('avoids recently practiced tunes when other candidates exist', function() {
    const now = 1_700_000_000_000
    const candidates = [
      makeTune('fresh', { boost: 4 }),
      makeTune('recent', { boost: 3 }),
    ]
    const ordered = orderPracticeCandidates(candidates, {
      instrument: 'mandolin',
      minConfidence: 3,
      minCount: 1,
      now: now,
      recentPracticeHistory: { recent: now - 1000 },
    })
    expect(ordered.map(function(t) { return t.id })).toEqual(['fresh'])
  })

  it('falls back to recently practiced tunes when nothing else qualifies', function() {
    const now = 1_700_000_000_000
    const candidates = [makeTune('recent', { boost: 3 })]
    const ordered = orderPracticeCandidates(candidates, {
      instrument: 'mandolin',
      minConfidence: 3,
      minCount: 1,
      now: now,
      recentPracticeHistory: { recent: now - 1000 },
    })
    expect(ordered.map(function(t) { return t.id })).toEqual(['recent'])
  })

  it('falls back to lower-confidence tunes when needed', function() {
    const candidates = [
      makeTune('a', { boost: 1 }),
      makeTune('b', { boost: 2 }),
    ]
    const ordered = orderPracticeCandidates(candidates, {
      instrument: 'violin',
      minConfidence: 3,
      minCount: 2,
    })
    expect(ordered.map(function(t) { return t.id })).toEqual(['a', 'b'])
  })

  it('builds plan with warmups and media-first tunes', function() {
    const tunes = {
      m1: makeTune('m1', { key: 'D', links: [{ link: 'https://x.com/1.mp3', startAt: '0', endAt: '60' }], boost: 5 }),
      m2: makeTune('m2', { key: 'D', boost: 3 }),
    }
    const plan = buildPracticeSessionPlan({
      totalMinutes: 10,
      includeWarmups: true,
      tunes,
      helpers,
      filters: { practiceListTuneIds: ['m1', 'm2'] },
    })
    expect(plan.practiceKey).toBe('D')
    expect(plan.steps[0].type).toBe('warmup')
    const tuneSteps = plan.steps.filter(function(s) { return s.type === 'tune' })
    expect(tuneSteps.length).toBeGreaterThan(0)
    expect(tuneSteps.some(function(s) { return s.route === 'media' })).toBe(true)
    expect(tuneSteps.find(function(s) { return s.tuneId === 'm1' }).route).toBe('media')
    expect(tuneSteps[0].tempoStart).toBeLessThanOrEqual(tuneSteps[0].tempoEnd)
    expect(getTuneConfidence(tunes.m2)).toBeLessThan(getTuneConfidence(tunes.m1))
    expect(tuneSteps[0].tuneId).toBe('m2')
  })

  it('applies skill level tempo range to tune steps', function() {
    const tunes = { a: makeTune('a', { key: 'D' }) }
    const plan = buildPracticeSessionPlan({
      totalMinutes: 10,
      includeWarmups: false,
      skillLevel: 2,
      tunes,
      helpers,
      filters: { practiceListTuneIds: ['a'] },
    })
    const tuneStep = plan.steps.find(function(s) { return s.type === 'tune' })
    expect(tuneStep.tempoStart).toBe(0.40)
    expect(tuneStep.tempoEnd).toBeCloseTo(0.55, 5)
    expect(plan.skillLevel).toBe(2)
  })

  it('keeps full tempo for songs with lyrics', function() {
    const tunes = {
      song: makeTune('song', {
        key: 'D',
        wLines: ['These are the lyrics'],
        links: [{ link: 'https://example.com/song.mp3', startAt: '0', endAt: '60' }],
      }),
      reel: makeTune('reel', { key: 'D' }),
    }
    const plan = buildPracticeSessionPlan({
      totalMinutes: 10,
      includeWarmups: false,
      skillLevel: 2,
      tunes,
      helpers,
      filters: { practiceListTuneIds: ['song', 'reel'] },
    })
    const songStep = plan.steps.find(function(s) { return s.tuneId === 'song' })
    const reelStep = plan.steps.find(function(s) { return s.tuneId === 'reel' })
    expect(songStep.tempoStart).toBe(1)
    expect(songStep.tempoEnd).toBe(1)
    expect(reelStep.tempoStart).toBe(0.40)
    expect(reelStep.tempoEnd).toBeCloseTo(0.55, 5)
  })

  it('computes pitch offset for non-matching keys', function() {
    expect(pitchOffsetToPracticeKey('C', 'G')).toBe(-5)
    expect(pitchOffsetToPracticeKey('G', 'G')).toBe(0)
  })

  it('derives recent practice context from viewed tunes', function() {
    const tunes = {
      a: makeTune('a', { books: ['Reels'], tags: ['party'], lastUpdated: 300 }),
      b: makeTune('b', { books: ['Jigs'], tags: ['fast'], lastUpdated: 200 }),
    }
    const context = derivePracticeContextFromRecentTunes(tunes, 2)
    expect(context.recentBooks.sort()).toEqual(['Jigs', 'Reels'])
    expect(context.recentTags.sort()).toEqual(['fast', 'party'])
    expect(tuneMatchesRecentPracticeContext(makeTune('x', { books: ['Jigs'] }), context.recentBooks, context.recentTags)).toBe(true)
    expect(tuneMatchesRecentPracticeContext(makeTune('y', { tags: ['party'] }), context.recentBooks, context.recentTags)).toBe(true)
    expect(tuneMatchesRecentPracticeContext(makeTune('z', { books: ['Polkas'] }), context.recentBooks, context.recentTags)).toBe(false)
  })

  it('includes two warmups in a five-minute session', function() {
    const tunes = {
      a: makeTune('a', { key: 'D' }),
      b: makeTune('b', { key: 'D' }),
    }
    const plan = buildPracticeSessionPlan({
      totalMinutes: 5,
      includeWarmups: true,
      tunes,
      helpers,
      filters: { practiceListTuneIds: ['a', 'b'] },
    })
    const warmups = plan.steps.filter(function(s) { return s.type === 'warmup' })
    expect(warmups.length).toBe(2)
    expect(warmups[0].id).not.toBe(warmups[1].id)
  })

  it('stores instrument on the session plan', function() {
    const tunes = { a: makeTune('a', { key: 'D' }) }
    const plan = buildPracticeSessionPlan({
      totalMinutes: 10,
      includeWarmups: false,
      instrument: 'cello',
      tunes,
      helpers,
      filters: { practiceListTuneIds: ['a'] },
    })
    expect(plan.instrument).toBe('cello')
  })

  it('reports a clearer error when no practice list tunes are available', function() {
    const plan = buildPracticeSessionPlan({
      tunes: { x: makeTune('x', { voices: null, links: [] }) },
      helpers,
      filters: { practiceListTuneIds: [] },
    })
    delete plan.steps
    expect(plan.error).toBe('Add tunes to your practice lists before starting a session.')
  })
})
