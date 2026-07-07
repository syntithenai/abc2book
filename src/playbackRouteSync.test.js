import { resolveMediaLinkIndex, syncPlaybackRoute } from './playbackRouteSync'

const tuneWithBoth = {
  id: 't1',
  links: [{ link: 'https://youtube.com/watch?v=abc' }],
}

function hasNotesOrChords() { return true }
function getSrc(tune, idx) {
  return tune.links[idx].link
}

describe('playbackRouteSync', function() {
  test('playMedia route selects media mode', function() {
    const route = syncPlaybackRoute({
      playState: 'playMedia',
      mediaLinkNumberParam: '0',
      tune: tuneWithBoth,
      hasNotesOrChords: hasNotesOrChords,
      getSrc: getSrc,
    })
    expect(route.mode).toBe('media')
    expect(route.mediaLinkNumber).toBe(0)
    expect(route.src).toBe('https://youtube.com/watch?v=abc')
  })

  test('playMidi route selects midi mode', function() {
    const route = syncPlaybackRoute({
      playState: 'playMidi',
      mediaLinkNumberParam: '0',
      tune: tuneWithBoth,
      hasNotesOrChords: hasNotesOrChords,
      getSrc: getSrc,
    })
    expect(route.mode).toBe('midi')
    expect(route.mediaLinkNumber).toBe(null)
  })

  test('playMidi without notation never falls back to linked media', function() {
    const linksOnly = {
      id: 't2',
      links: [{ link: 'https://youtube.com/watch?v=abc' }],
    }
    const route = syncPlaybackRoute({
      playState: 'playMidi',
      mediaLinkNumberParam: '0',
      tune: linksOnly,
      hasNotesOrChords: function() { return false },
      getSrc: getSrc,
    })
    expect(route.mode).toBe('none')
  })

  test('resolveMediaLinkIndex defaults to 0', function() {
    expect(resolveMediaLinkIndex(undefined, tuneWithBoth)).toBe(0)
    expect(resolveMediaLinkIndex('bad', tuneWithBoth)).toBe(0)
  })
})
