import useAbcTools from './useAbcTools'
import { selectWarmupsForSession, VOCAL_SYLLABLES } from './practiceWarmupGenerator'

describe('voice warmup under-staff lyrics', function() {
  it('survives Abc.js abc2json/json2abc roundtrip', function() {
    const abcTools = useAbcTools()
    const list = selectWarmupsForSession('C', 5, { instrument: 'voice' }, 2)
    expect(list.length).toBeGreaterThan(0)
    list.forEach(function(warmup) {
      expect(warmup.abc).toMatch(/\nw:/)
      const tune = abcTools.abc2json(warmup.abc)
      expect(Array.isArray(tune.wLines) && tune.wLines.length).toBeGreaterThan(0)
      const out = abcTools.json2abc(tune)
      expect(out).toMatch(/\nw:/)
      const hasSyllable = VOCAL_SYLLABLES.some(function(s) {
        return out.indexOf(s) !== -1
      })
      expect(hasSyllable).toBe(true)
    })
  })
})
