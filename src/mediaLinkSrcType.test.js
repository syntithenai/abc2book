import {
  resolveLinkPlaybackSrcType,
  resolveUriPlaybackSrcType,
  linkSupportsPlayRange,
  isMediaLinkPlaybackCandidate,
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

  test('resolveUriPlaybackSrcType treats music-collection paths as audio', function() {
    expect(resolveUriPlaybackSrcType('/music-collection/Altan/track.mp3', isYoutubeLink)).toBe('audio')
    expect(resolveUriPlaybackSrcType('http://localhost:8787/music-collection/Altan/track.mp3', isYoutubeLink)).toBe('audio')
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

  test('resolveLinkPlaybackSrcType treats owned links with .mid titles as midifile', function() {
    expect(resolveLinkPlaybackSrcType({
      link: 'abcbook-recording:abc123',
      title: 'scratchpad.notation.mid',
    }, isYoutubeLink)).toBe('midifile')
  })

  test('resolveLinkPlaybackSrcType handles nested link objects', function() {
    expect(resolveLinkPlaybackSrcType({
      link: { link: 'abcbook-recording:rec1', recordingId: 'rec1' },
      title: 'Rec',
    }, isYoutubeLink)).toBe('recording')
  })

  test('resolveLinkPlaybackSrcType treats inline MIDI data as midifile', function() {
    expect(resolveLinkPlaybackSrcType({
      link: 'data:audio/midi;base64,TVRoZA==',
    }, isYoutubeLink)).toBe('midifile')
  })

  test('linkSupportsPlayRange is false for MIDI files', function() {
    expect(linkSupportsPlayRange({ link: 'https://example.com/a.mp3' }, isYoutubeLink)).toBe(true)
    expect(linkSupportsPlayRange({ link: 'https://youtu.be/abc' }, isYoutubeLink)).toBe(true)
    expect(linkSupportsPlayRange({ link: 'https://example.com/tune.mid' }, isYoutubeLink)).toBe(false)
    expect(linkSupportsPlayRange({
      link: 'abcbook-recording:rec1',
      mediaKind: 'midi',
    }, isYoutubeLink)).toBe(false)
  })

  test('isMediaLinkPlaybackCandidate skips empty and non-audio data URLs', function() {
    expect(isMediaLinkPlaybackCandidate({ link: '' }, isYoutubeLink)).toBe(false)
    expect(isMediaLinkPlaybackCandidate({ link: 'data:text/plain,x' }, isYoutubeLink)).toBe(false)
    expect(isMediaLinkPlaybackCandidate({ link: 'https://example.com/a.mp3' }, isYoutubeLink)).toBe(true)
    expect(isMediaLinkPlaybackCandidate({ link: 'https://youtu.be/abc' }, isYoutubeLink)).toBe(true)
  })
})
