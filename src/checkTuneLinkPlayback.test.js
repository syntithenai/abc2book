import {
  buildLinkCheckQueue,
  checkLinkPlaybackItem,
  getEmptyLinkReason,
  getLinkRegionWarnings,
  getLinkSrcType,
  getTunesWithoutLinks,
  isLinkCheckAuthFailure,
  LINK_CHECK_STATUS,
  tuneHasLinkContent,
} from './checkTuneLinkPlayback'

function isYoutubeLink(url) {
  return /youtube\.com|youtu\.be/.test(url || '')
}

describe('checkTuneLinkPlayback', function() {
  test('buildLinkCheckQueue collects links from selected tunes', function() {
    const queue = buildLinkCheckQueue([
      {
        id: 't1',
        name: 'Tune One',
        links: [
          { title: 'A', link: 'https://example.com/a.mp3' },
          { title: '', link: '', startAt: '', endAt: '' },
        ],
      },
      {
        id: 't2',
        name: 'Tune Two',
        links: [{ title: 'YT', link: 'https://www.youtube.com/watch?v=abc123' }],
      },
    ])

    expect(queue).toHaveLength(2)
    expect(queue[0].tuneId).toBe('t1')
    expect(queue[0].linkIndex).toBe(0)
    expect(queue[1].tuneName).toBe('Tune Two')
  })

  test('getLinkSrcType detects empty, youtube, audio, and recording links', function() {
    expect(getLinkSrcType({ link: '' }, isYoutubeLink)).toBe('empty')
    expect(getLinkSrcType({ link: 'https://youtu.be/abc' }, isYoutubeLink)).toBe('youtube')
    expect(getLinkSrcType({ link: 'https://example.com/a.mp3' }, isYoutubeLink)).toBe('audio')
    expect(getLinkSrcType({ link: 'abcbook-recording:rec1' }, isYoutubeLink)).toBe('recording')
    expect(getLinkSrcType({ link: 'abcbook-recording:rec1', mediaKind: 'midi' }, isYoutubeLink)).toBe('midifile')
    expect(getLinkSrcType({ link: 'https://example.com/a.mid' }, isYoutubeLink)).toBe('midifile')
    expect(getLinkSrcType({ link: 'data:text/plain,hello' }, isYoutubeLink)).toBe('skip')
  })

  test('getEmptyLinkReason explains missing URLs', function() {
    expect(getEmptyLinkReason({ title: 'No url' })).toBe('Missing link URL')
    expect(getEmptyLinkReason({ link: 'https://example.com' })).toBeNull()
  })

  test('getTunesWithoutLinks lists selected tunes missing links', function() {
    function hasLinks(tune) {
      return !!(tune.links && tune.links[0] && tune.links[0].link)
    }

    const missing = getTunesWithoutLinks([
      { id: 'a', name: 'With link', links: [{ link: 'https://example.com/x' }] },
      { id: 'b', name: 'No links' },
      { id: 'c', name: 'Empty link', links: [{ title: 'placeholder' }] },
    ], hasLinks)

    expect(missing).toHaveLength(2)
    expect(missing.map(function(item) { return item.tuneId })).toEqual(['b', 'c'])
  })

  test('tuneHasLinkContent falls back to URL scan without hasLinks helper', function() {
    expect(tuneHasLinkContent({ links: [{ link: 'https://example.com' }] })).toBe(true)
    expect(tuneHasLinkContent({ links: [{ title: 'no url' }] })).toBe(false)
    expect(tuneHasLinkContent({})).toBe(false)
  })

  test('getLinkRegionWarnings flags missing startAt/endAt with URL present', function() {
    const warnings = getLinkRegionWarnings([
      {
        id: 'a',
        name: 'Tune A',
        links: [{ link: 'https://example.com/a.mp3', startAt: '', endAt: '' }],
      },
    ])

    expect(warnings).toHaveLength(1)
    expect(warnings[0].missing).toEqual(['startAt', 'endAt'])
  })

  test('getLinkRegionWarnings skips tunes with region fields set', function() {
    const warnings = getLinkRegionWarnings([
      {
        id: 'b',
        name: 'Tune B',
        links: [{ link: 'https://example.com/b.mp3', startAt: '0:05', endAt: '1:30' }],
      },
    ])
    expect(warnings).toHaveLength(0)
  })

  test('getLinkRegionWarnings skips MIDI files', function() {
    const warnings = getLinkRegionWarnings([
      {
        id: 'm',
        name: 'MIDI Tune',
        links: [{ link: 'https://example.com/tune.mid', startAt: '', endAt: '' }],
      },
      {
        id: 'r',
        name: 'Owned MIDI',
        links: [{ link: 'abcbook-recording:rec1', mediaKind: 'midi', startAt: '', endAt: '' }],
      },
    ])
    expect(warnings).toHaveLength(0)
  })

  test('isLinkCheckAuthFailure detects proxy auth and login phrasing', function() {
    expect(isLinkCheckAuthFailure(new Error('Media proxy error 401 Unauthorized'))).toBe(true)
    expect(isLinkCheckAuthFailure(new Error('Missing Authorization header'))).toBe(true)
    expect(isLinkCheckAuthFailure(new Error('Login required for this source'))).toBe(true)
    expect(isLinkCheckAuthFailure(new Error('Could not load audio'))).toBe(false)
    expect(isLinkCheckAuthFailure(new Error('Media proxy not configured'), {
      accessToken: null,
      requiresAuth: true,
    })).toBe(true)
    expect(isLinkCheckAuthFailure(new Error('Media proxy not configured'), {
      accessToken: 'tok',
      requiresAuth: true,
    })).toBe(false)
  })

  test('checkLinkPlaybackItem skips non-audio data URIs', async function() {
    const result = await checkLinkPlaybackItem({
      tuneId: 't1',
      tuneName: 'Tune',
      linkIndex: 0,
      link: { link: 'data:text/plain;base64,aGVsbG8=' },
    }, { isYoutubeLink: isYoutubeLink })
    expect(result.ok).toBe(true)
    expect(result.status).toBe(LINK_CHECK_STATUS.SKIP)
  })

  test('checkLinkPlaybackItem flags auth-required sources without token as Needing Login', async function() {
    const result = await checkLinkPlaybackItem({
      tuneId: 't1',
      tuneName: 'Tune',
      linkIndex: 0,
      link: { link: 'https://resolver.example/music-collection/track.mp3' },
    }, {
      isYoutubeLink: isYoutubeLink,
      accessToken: null,
    })
    expect(result.ok).toBe(false)
    expect(result.status).toBe(LINK_CHECK_STATUS.NEEDS_LOGIN)
    expect(result.error).toBe('Needing Login')
  })

  test('checkLinkPlaybackItem flags bandcamp without token as Needing Login', async function() {
    const result = await checkLinkPlaybackItem({
      tuneId: 't1',
      tuneName: 'Tune',
      linkIndex: 0,
      link: { link: 'https://artist.bandcamp.com/track/song' },
    }, {
      isYoutubeLink: isYoutubeLink,
      accessToken: '',
    })
    expect(result.ok).toBe(false)
    expect(result.status).toBe(LINK_CHECK_STATUS.NEEDS_LOGIN)
  })

  test('checkLinkPlaybackItem marks empty URL as broken, not needing login', async function() {
    const result = await checkLinkPlaybackItem({
      tuneId: 't1',
      tuneName: 'Tune',
      linkIndex: 0,
      link: { title: 'Empty', link: '' },
    }, { isYoutubeLink: isYoutubeLink })
    expect(result.ok).toBe(false)
    expect(result.status).toBe(LINK_CHECK_STATUS.BROKEN)
    expect(result.error).toBe('Missing link URL')
  })
})
