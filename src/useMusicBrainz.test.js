import { musicBrainzGet } from './musicBrainzRequest'
import useMusicBrainz from './useMusicBrainz'

jest.mock('./musicBrainzRequest', function() {
  return {
    musicBrainzGet: jest.fn(),
  }
})

describe('useMusicBrainz', function() {
  beforeEach(function() {
    jest.useFakeTimers()
    musicBrainzGet.mockReset()
  })

  afterEach(function() {
    jest.useRealTimers()
  })

  test('searchArtist rejects through the returned promise instead of leaving axios unhandled', async function() {
    const busy = new Error('MusicBrainz is busy — wait a moment and try again.')
    busy.code = 'MUSICBRAINZ_BUSY'
    musicBrainzGet.mockRejectedValue(busy)
    const api = useMusicBrainz()
    const pending = api.searchArtist('Altan')
    const assertion = expect(pending).rejects.toMatchObject({ code: 'MUSICBRAINZ_BUSY' })
    jest.advanceTimersByTime(500)
    await assertion
  })

  test('artistOptions settles to empty list when search fails if caller catches', async function() {
    const busy = new Error('MusicBrainz is busy — wait a moment and try again.')
    busy.code = 'MUSICBRAINZ_BUSY'
    musicBrainzGet.mockRejectedValue(busy)
    const api = useMusicBrainz()
    const pending = api.artistOptions('Altan').catch(function() { return [] })
    jest.advanceTimersByTime(500)
    await expect(pending).resolves.toEqual([])
  })
})
