import {
  buildLinkCheckQueue,
  getEmptyLinkReason,
  getLinkRegionWarnings,
  getLinkSrcType,
  getTunesWithoutLinks,
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
})
