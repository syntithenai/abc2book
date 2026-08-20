import {
  collectMediaLinkCandidateIndexes,
  findNextPlayableLinkIndex,
  queueItemHasAlternateMediaLinks,
} from './playlistPlaybackSkip'

describe('playlistPlaybackSkip media link fallback', function() {
  const tunebook = {
    hasLinks: function(tune) {
      return !!(tune && tune.links && tune.links.length > 0)
    },
  }

  test('collectMediaLinkCandidateIndexes skips empty and data links', function() {
    const tune = {
      id: 't',
      links: [
        { link: '' },
        { link: 'data:text/plain,nope' },
        { link: 'https://example.com/a.mp3' },
        { link: 'https://youtu.be/abc' },
      ],
    }
    expect(collectMediaLinkCandidateIndexes(tune)).toEqual([2, 3])
  })

  test('findNextPlayableLinkIndex walks remaining links then wraps', function() {
    const tune = {
      id: 't',
      links: [
        { link: 'https://example.com/a.mp3' },
        { link: '' },
        { link: 'https://example.com/b.mp3' },
      ],
    }
    expect(findNextPlayableLinkIndex(tune, tunebook, 0)).toBe(2)
    expect(findNextPlayableLinkIndex(tune, tunebook, 2)).toBe(0)
  })

  test('findNextPlayableLinkIndex skips already tried indexes', function() {
    const tune = {
      id: 't',
      links: [
        { link: 'https://example.com/a.mp3' },
        { link: 'https://example.com/b.mp3' },
        { link: 'https://example.com/c.mp3' },
      ],
    }
    expect(findNextPlayableLinkIndex(tune, tunebook, 0, {
      skipIndexes: { 1: true },
    })).toBe(2)
    expect(findNextPlayableLinkIndex(tune, tunebook, 2, {
      skipIndexes: { 0: true, 2: true },
    })).toBe(1)
    expect(findNextPlayableLinkIndex(tune, tunebook, 1, {
      skipIndexes: { 0: true, 1: true, 2: true },
    })).toBe(-1)
  })

  test('queueItemHasAlternateMediaLinks is true when another candidate exists', function() {
    const tune = {
      id: 't',
      links: [
        { link: 'https://example.com/a.mp3' },
        { link: 'https://example.com/b.mp3' },
      ],
    }
    expect(queueItemHasAlternateMediaLinks(tune, { tuneId: 't' }, tunebook, 0)).toBe(true)
    expect(queueItemHasAlternateMediaLinks(tune, { tuneId: 't' }, tunebook, 0, {
      skipIndexes: { 1: true },
    })).toBe(false)
  })
})
