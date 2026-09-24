import useAbcTools from './useAbcTools'

describe('tunesToAbc meta hardening', function() {
  const abcTools = useAbcTools()

  test('exports when meta is the corrupt string "[object Object]"', function() {
    const tunes = {
      a: {
        id: 'a',
        name: 'Broken Meta',
        meta: '[object Object]',
        voices: { '1': { meta: '', notes: ['CDEF|'] } },
      },
    }
    const abc = abcTools.tunesToAbc(tunes)
    expect(abc).toMatch(/T: Broken Meta/)
    expect(abc).toMatch(/CDEF\|/)
    expect(tunes.a.meta).toBe('[object Object]')
  })

  test('does not mutate plain meta objects on export', function() {
    const tunes = {
      b: {
        id: 'b',
        name: 'Plain Meta',
        meta: { X: 9, custom: ['keep'] },
        voices: { '1': { meta: '', notes: ['GABc|'] } },
      },
    }
    abcTools.tunesToAbc(tunes)
    expect(tunes.b.meta.X).toBe(9)
    expect(tunes.b.meta.custom).toEqual(['keep'])
  })
})
