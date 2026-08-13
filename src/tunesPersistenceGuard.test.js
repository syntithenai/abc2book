import { shouldRefuseTunesPersist, countTunes } from './tunesPersistenceGuard'

function makeTunes(n) {
  const out = {}
  for (let i = 0; i < n; i += 1) out['t' + i] = { id: 't' + i }
  return out
}

describe('tunesPersistenceGuard', function() {
  test('countTunes handles null and maps', function() {
    expect(countTunes(null)).toBe(0)
    expect(countTunes(makeTunes(3))).toBe(3)
  })

  test('allows equal or larger pending writes', function() {
    expect(shouldRefuseTunesPersist(makeTunes(10), makeTunes(10))).toBe(false)
    expect(shouldRefuseTunesPersist(makeTunes(12), makeTunes(10))).toBe(false)
  })

  test('allows small shrinks', function() {
    expect(shouldRefuseTunesPersist(makeTunes(95), makeTunes(100))).toBe(false)
  })

  test('refuses mass shrink of in-memory library', function() {
    expect(shouldRefuseTunesPersist(makeTunes(1), makeTunes(3128))).toBe(true)
    expect(shouldRefuseTunesPersist(makeTunes(20), makeTunes(200))).toBe(true)
    expect(shouldRefuseTunesPersist({}, makeTunes(100))).toBe(true)
  })

  test('allows intentional empty when memory is already empty', function() {
    expect(shouldRefuseTunesPersist({}, {})).toBe(false)
  })

  test('allows empty pending when memory empty after deleteAll', function() {
    expect(shouldRefuseTunesPersist({}, makeTunes(0))).toBe(false)
  })
})
