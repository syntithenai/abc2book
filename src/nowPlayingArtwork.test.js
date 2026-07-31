import {
  getTuneArtworkUrl,
  hasTuneArtwork,
  youtubeArtworkFromUrl,
  artworkFromLinkImage,
  needsOwnedRecordingArtwork,
  isYoutubeArtworkUrl,
  youtubeArtworkMaxResUrl,
} from './nowPlayingArtwork'
import { extractArchiveIdentifier, archiveArtworkUrlFromUri } from './archiveOrgLinkUtils'

describe('nowPlayingArtwork', function() {
  const tunebook = {
    utils: {
      isYoutubeLink: function(url) {
        return /youtube\.com|youtu\.be/.test(url)
      },
    },
  }

  test('youtubeArtworkFromUrl builds ytimg URL', function() {
    expect(youtubeArtworkFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'))
      .toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
  })

  test('getTuneArtworkUrl resolves YouTube from link.link', function() {
    const tune = {
      links: [{ link: 'https://youtu.be/dQw4w9WgXcQ', title: 'Video' }],
    }
    expect(getTuneArtworkUrl(tune, tunebook, { linkIndex: 0 }))
      .toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
  })

  test('link.image takes precedence over derivation', function() {
    const tune = {
      links: [{
        link: 'https://youtu.be/dQw4w9WgXcQ',
        image: 'https://example.com/custom.jpg',
      }],
    }
    expect(getTuneArtworkUrl(tune, tunebook, { linkIndex: 0 }))
      .toBe('https://example.com/custom.jpg')
  })

  test('getTuneArtworkUrl derives Internet Archive artwork', function() {
    const tune = {
      links: [{ link: 'https://archive.org/details/foo-bar', title: 'Archive' }],
    }
    expect(getTuneArtworkUrl(tune, tunebook, { linkIndex: 0 }))
      .toBe('https://archive.org/services/img/foo-bar')
  })

  test('active linkIndex does not fall back to another link', function() {
    const tune = {
      links: [
        { link: 'https://archive.org/details/foo', title: 'Archive' },
        { link: 'https://youtu.be/dQw4w9WgXcQ', title: 'Video' },
      ],
    }
    expect(getTuneArtworkUrl(tune, tunebook, { linkIndex: 0 }))
      .toBe('https://archive.org/services/img/foo')
    expect(getTuneArtworkUrl(tune, tunebook, { linkIndex: 1 }))
      .toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
  })

  test('hasTuneArtwork is true for music collection image URLs', function() {
    const tune = {
      links: [{
        link: 'https://resolver.example/music-collection/Altan/track.mp3',
        image: 'https://resolver.example/music-collection-art/12',
      }],
    }
    expect(hasTuneArtwork(tune, tunebook, { linkIndex: 0 })).toBe(true)
    expect(getTuneArtworkUrl(tune, tunebook, { linkIndex: 0 }))
      .toBe('https://resolver.example/music-collection-art/12')
  })

  test('hasTuneArtwork is true for owned recordings without sync artwork URL', function() {
    const tune = {
      links: [{ link: 'abcbook-recording:rec-1', recordingId: 'rec-1' }],
    }
    expect(getTuneArtworkUrl(tune, tunebook, { linkIndex: 0 })).toBe(null)
    expect(needsOwnedRecordingArtwork(tune.links[0])).toBe(true)
    expect(hasTuneArtwork(tune, tunebook, { linkIndex: 0 })).toBe(true)
  })

  test('artworkFromLinkImage returns trimmed image URL', function() {
    expect(artworkFromLinkImage({ image: ' https://example.com/a.jpg ' }))
      .toBe('https://example.com/a.jpg')
    expect(artworkFromLinkImage({ image: '  ' })).toBe(null)
  })

  test('youtube maxres helper upgrades hqdefault URL', function() {
    const hq = 'https://i.ytimg.com/vi/abc12345678/hqdefault.jpg'
    expect(isYoutubeArtworkUrl(hq)).toBe(true)
    expect(youtubeArtworkMaxResUrl(hq))
      .toBe('https://i.ytimg.com/vi/abc12345678/maxresdefault.jpg')
  })
})

describe('archiveOrgLinkUtils artwork helpers', function() {
  test('extractArchiveIdentifier handles details and download URLs', function() {
    expect(extractArchiveIdentifier('https://archive.org/details/foo')).toBe('foo')
    expect(extractArchiveIdentifier('https://archive.org/download/foo/bar.mp3')).toBe('foo')
  })

  test('archiveArtworkUrlFromUri builds services img URL', function() {
    expect(archiveArtworkUrlFromUri('https://archive.org/details/foo'))
      .toBe('https://archive.org/services/img/foo')
  })
})
