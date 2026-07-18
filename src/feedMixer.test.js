import { buildFeedStream } from './feedMixer'

function makeRng(seed) {
  var s = seed
  return function() {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function item(id, type) {
  return {
    id: id,
    type: type,
    status: 'queued',
    createdAt: 1,
    factHash: id,
  }
}

describe('feedMixer', function() {
  it('keeps theory and singing shares in range over 200 picks', function() {
    const pool = []
    const theory = []
    const singing = []
    for (var i = 0; i < 300; i++) {
      pool.push(item('p' + i, 'dyk'))
      theory.push(item('t' + i, 'theory_lesson'))
      singing.push(item('s' + i, 'singing_tip'))
    }
    const rng = makeRng(42)
    const stream = buildFeedStream({
      poolItems: pool,
      theoryItems: theory,
      singingItems: singing,
      skill: 5,
      instrument: 'mandolin',
      pageSize: 200,
      rng: rng,
    })
    expect(stream.length).toBe(200)
    var theoryCount = 0
    var singingCount = 0
    var badAdj = 0
    for (var j = 0; j < stream.length; j++) {
      const ty = stream[j].type
      if (ty === 'theory_lesson' || ty === 'theory_quiz') theoryCount++
      if (ty === 'singing_tip' || ty === 'warmup_idea') singingCount++
      if (j > 0) {
        const a = stream[j - 1].type
        const b = stream[j].type
        const ia = a === 'theory_lesson' || a === 'theory_quiz' || a === 'singing_tip' || a === 'warmup_idea'
        const ib = b === 'theory_lesson' || b === 'theory_quiz' || b === 'singing_tip' || b === 'warmup_idea'
        if (ia && ib) badAdj++
      }
    }
    expect(theoryCount).toBeGreaterThanOrEqual(8)
    expect(theoryCount).toBeLessThanOrEqual(24)
    expect(singingCount).toBeGreaterThanOrEqual(10)
    expect(singingCount).toBeLessThanOrEqual(35)
    expect(badAdj).toBe(0)
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
      skill: 5,
      instrument: 'voice',
      pageSize: 200,
      rng: makeRng(7),
    })
    var singingCount = 0
    stream.forEach(function(c) {
      if (c.type === 'singing_tip' || c.type === 'warmup_idea') singingCount++
    })
    expect(singingCount).toBeGreaterThanOrEqual(20)
    expect(singingCount).toBeLessThanOrEqual(40)
  })
})
