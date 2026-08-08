import { createArtistDiscographyPlaybackSession } from './artistDiscographyPlaybackResolver'
import { browseMusicCollection } from './musicCollectionCuratorClient'
import { searchMediaLinks } from './mediaLinkSearchClient'

jest.mock('./musicCollectionCuratorClient', function() {
  return {
    browseMusicCollection: jest.fn(),
  }
})

jest.mock('./mediaLinkSearchClient', function() {
  return {
    searchMediaLinks: jest.fn(),
  }
})

describe('artistDiscographyPlaybackResolver', function() {
  beforeEach(function() {
    browseMusicCollection.mockReset()
    searchMediaLinks.mockReset()
  })

  test('resolvePlayableCandidate prefers local collection match', async function() {
    browseMusicCollection.mockResolvedValue({
      entries: [{
        id: '1',
        title: 'Sally Gardens',
        artist: 'Altan',
        path: 'Altan/sally.mp3',
      }],
    })
    const session = createArtistDiscographyPlaybackSession()
    const candidate = await session.resolvePlayableCandidate('Altan', 'Sally Gardens', {
      accessToken: 'token',
    })
    expect(candidate.source).toBe('music-collection')
    expect(candidate.title).toBe('Sally Gardens')
    expect(searchMediaLinks).not.toHaveBeenCalled()
  })

  test('resolvePlayableCandidate falls back to media search', async function() {
    browseMusicCollection.mockResolvedValue({ entries: [] })
    searchMediaLinks.mockResolvedValue({
      candidates: [{
        source: 'bandcamp',
        title: 'Sally Gardens',
        artist: 'Altan',
        link: 'https://altan.bandcamp.com/track/sally',
        matchScore: 90,
      }],
    })
    const session = createArtistDiscographyPlaybackSession()
    const candidate = await session.resolvePlayableCandidate('Altan', 'Sally Gardens', {
      accessToken: 'token',
    })
    expect(candidate.source).toBe('bandcamp')
    expect(searchMediaLinks).toHaveBeenCalled()
  })

  test('resolvePlayableCandidate rejects title match with wrong artist', async function() {
    browseMusicCollection.mockResolvedValue({ entries: [] })
    searchMediaLinks.mockResolvedValue({
      candidates: [{
        source: 'bandcamp',
        title: 'Sally Gardens',
        artist: 'Different Artist',
        link: 'https://example.bandcamp.com/track/sally',
        matchScore: 95,
      }],
    })
    const session = createArtistDiscographyPlaybackSession()
    const candidate = await session.resolvePlayableCandidate('Altan', 'Sally Gardens', {
      accessToken: 'token',
    })
    expect(candidate).toBeNull()
  })

  test('resolvePlayableCandidate ignores collection entry with wrong artist', async function() {
    browseMusicCollection.mockResolvedValue({
      entries: [{
        id: '1',
        title: 'Sally Gardens',
        artist: 'Different Artist',
        path: 'wrong.mp3',
      }],
    })
    searchMediaLinks.mockResolvedValue({ candidates: [] })
    const session = createArtistDiscographyPlaybackSession()
    const candidate = await session.resolvePlayableCandidate('Altan', 'Sally Gardens', {
      accessToken: 'token',
    })
    expect(candidate).toBeNull()
    expect(searchMediaLinks).toHaveBeenCalled()
  })
})
