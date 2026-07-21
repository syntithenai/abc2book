import { buildFeedStream, isQuizCard, quizDifficulty, sortQuizzesEasyFirst, FEED_QUIZ_WEIGHT } from './feedMixer'

function makeRng(seed) {
  var s = seed
  return function() {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function item(id, type, extra) {
  return Object.assign({
    id: id,
    type: type,
    status: 'queued',
    createdAt: 1,
    factHash: id,
  }, extra || {})
}

describe('feedMixer', function() {
  it('keeps theory and singing shares in range over 200 picks', function() {
    const pool = []
    const theory = []
    const singing = []
    const quizzes = []
    for (var i = 0; i < 300; i++) {
      pool.push(item('p' + i, 'dyk'))
      theory.push(item('t' + i, 'theory_lesson'))
      singing.push(item('s' + i, 'singing_tip'))
      quizzes.push(item('q' + i, 'quiz', { difficulty: (i % 5) + 1 }))
    }
    const rng = makeRng(42)
    const stream = buildFeedStream({
      poolItems: pool,
      theoryItems: theory,
      singingItems: singing,
      quizItems: quizzes,
      skill: 5,
      instrument: 'mandolin',
      pageSize: 200,
      rng: rng,
    })
    expect(stream.length).toBe(200)
    var theoryCount = 0
    var singingCount = 0
    var quizCount = 0
    var badAdj = 0
    var quizAdj = 0
    for (var j = 0; j < stream.length; j++) {
      const ty = stream[j].type
      if (ty === 'theory_lesson') theoryCount++
      if (ty === 'singing_tip' || ty === 'warmup_idea') singingCount++
      if (isQuizCard(stream[j])) quizCount++
      if (j > 0) {
        const a = stream[j - 1].type
        const b = stream[j].type
        const ia = a === 'theory_lesson' || a === 'singing_tip' || a === 'warmup_idea'
        const ib = b === 'theory_lesson' || b === 'singing_tip' || b === 'warmup_idea'
        if (ia && ib) badAdj++
        if (isQuizCard(stream[j]) && isQuizCard(stream[j - 1])) quizAdj++
      }
    }
    expect(theoryCount).toBeGreaterThanOrEqual(8)
    expect(theoryCount).toBeLessThanOrEqual(30)
    expect(singingCount).toBeGreaterThanOrEqual(8)
    expect(singingCount).toBeLessThanOrEqual(35)
    expect(quizCount).toBeGreaterThanOrEqual(Math.floor(200 * FEED_QUIZ_WEIGHT * 0.6))
    expect(quizCount).toBeLessThanOrEqual(Math.ceil(200 * FEED_QUIZ_WEIGHT * 1.6))
    expect(badAdj).toBe(0)
    expect(quizAdj).toBe(0)
  })

  it('raises singing share for voice instrument', function() {
    const pool = []
    const theory = []
    const singing = []
    for (var i = 0; i < 300; i++) {
      pool.push(item('p' + i, 'dyk'))
      theory.push(item('t' + i, 'theory_lesson'))
      singing.push(item('s' + i, 'singing_tip'))
    }
    const stream = buildFeedStream({
      poolItems: pool,
      theoryItems: theory,
      singingItems: singing,
      quizItems: [],
      skill: 5,
      instrument: 'voice',
      pageSize: 200,
      rng: makeRng(7),
    })
    var singingCount = 0
    stream.forEach(function(c) {
      if (c.type === 'singing_tip' || c.type === 'warmup_idea') singingCount++
    })
    expect(singingCount).toBeGreaterThanOrEqual(15)
    expect(singingCount).toBeLessThanOrEqual(40)
  })

  it('fills a full page when only instructional cards remain', function() {
    const theory = []
    const singing = []
    for (var i = 0; i < 12; i++) {
      theory.push(item('t' + i, 'theory_lesson'))
      singing.push(item('s' + i, 'singing_tip'))
    }
    const stream = buildFeedStream({
      poolItems: [],
      theoryItems: theory,
      singingItems: singing,
      quizItems: [],
      skill: 5,
      instrument: 'mandolin',
      pageSize: 10,
      rng: makeRng(3),
    })
    expect(stream.length).toBe(10)
  })

  it('aims for ~10% quizzes without placing them back-to-back', function() {
    const pool = []
    const theory = []
    const quizzes = []
    for (var i = 0; i < 40; i++) pool.push(item('d' + i, 'dyk'))
    for (var j = 0; j < 20; j++) theory.push(item('l' + j, 'theory_lesson'))
    for (var k = 0; k < 20; k++) quizzes.push(item('q' + k, 'quiz', { difficulty: k % 5 }))
    const stream = buildFeedStream({
      poolItems: pool,
      theoryItems: theory,
      singingItems: [],
      quizItems: quizzes,
      skill: 0,
      instrument: 'mandolin',
      pageSize: 20,
      rng: makeRng(11),
    })
    expect(stream.length).toBe(20)
    var quizN = 0
    for (var n = 0; n < stream.length; n++) {
      if (isQuizCard(stream[n])) quizN++
      if (n > 0 && isQuizCard(stream[n]) && isQuizCard(stream[n - 1])) {
        throw new Error('adjacent quizzes at ' + n)
      }
    }
    expect(quizN).toBeGreaterThanOrEqual(1)
    expect(quizN).toBeLessThanOrEqual(3)
  })

  it('serves easier quizzes before harder ones', function() {
    const quizzes = [
      item('hard', 'theory_quiz', { difficulty: 8, createdAt: 1 }),
      item('easy', 'quiz', { difficulty: 1, createdAt: 2 }),
      item('mid', 'quiz', { difficulty: 4, createdAt: 3 }),
    ]
    const sorted = sortQuizzesEasyFirst(quizzes)
    expect(sorted.map(function(q) { return q.id })).toEqual(['easy', 'mid', 'hard'])
    expect(quizDifficulty(sorted[0])).toBe(1)

    const pool = []
    for (var i = 0; i < 30; i++) pool.push(item('d' + i, 'dyk'))
    const stream = buildFeedStream({
      poolItems: pool,
      theoryItems: [],
      singingItems: [],
      quizItems: quizzes,
      skill: 0,
      instrument: 'mandolin',
      pageSize: 20,
      rng: makeRng(3),
    })
    const seen = stream.filter(isQuizCard)
    expect(seen.length).toBeGreaterThanOrEqual(1)
    expect(seen[0].id).toBe('easy')
  })

  it('prefers pool stories over instructional when both available', function() {
    const pool = []
    const theory = []
    for (var i = 0; i < 50; i++) pool.push(item('w' + i, 'news'))
    for (var j = 0; j < 50; j++) theory.push(item('t' + j, 'theory_lesson'))
    const stream = buildFeedStream({
      poolItems: pool,
      theoryItems: theory,
      singingItems: [],
      quizItems: [],
      skill: 0,
      instrument: 'mandolin',
      pageSize: 20,
      rng: makeRng(99),
    })
    var news = 0
    stream.forEach(function(c) { if (c.type === 'news') news++ })
    expect(news).toBeGreaterThanOrEqual(12)
  })
})
