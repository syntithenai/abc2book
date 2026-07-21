import {
  resolveLinkPlaybackSrcType,
  resolveUriPlaybackSrcType,
} from './mediaLinkSrcType'

describe('mediaLinkSrcType', function() {
  const isYoutubeLink = function(url) {
    return String(url).indexOf('youtube.com') >= 0 || String(url).indexOf('youtu.be') >= 0
  }

  test('resolveUriPlaybackSrcType detects midifile URLs', function() {
    expect(resolveUriPlaybackSrcType('https://example.com/tune.mid', isYoutubeLink)).toBe('midifile')
    expect(resolveUriPlaybackSrcType('https://example.com/tune.MIDI', isYoutubeLink)).toBe('midifile')
    expect(resolveUriPlaybackSrcType('https://example.com/tune.mp3', isYoutubeLink)).toBe('audio')
  })

  test('resolveLinkPlaybackSrcType prefers owned MIDI mediaKind', function() {
    expect(resolveLinkPlaybackSrcType({
      link: 'abcbook-recording:abc123',
      mediaKind: 'midi',
    }, isYoutubeLink)).toBe('midifile')
    expect(resolveLinkPlaybackSrcType({
      link: 'abcbook-recording:abc123',
      mediaKind: 'audio',
    }, isYoutubeLink)).toBe('recording')
  })
})
