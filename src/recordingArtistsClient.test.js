import { titleVariants } from './recordingArtistsClient'

describe('titleVariants', function() {
  test('claire swaps to clair', function() {
    const variants = titleVariants('Claire de Lune')
    expect(variants[0]).toBe('Claire de Lune')
    expect(variants).toContain('Clair de Lune')
  })

  test('clair swaps to clare and claire', function() {
    const variants = titleVariants('Clair de Lune')
    expect(variants[0]).toBe('Clair de Lune')
    expect(variants).toContain('Clare de Lune')
    expect(variants).toContain('Claire de Lune')
  })

  test('returns empty for blank title', function() {
    expect(titleVariants('')).toEqual([])
    expect(titleVariants('   ')).toEqual([])
  })
})
