import {
  resolveMediaLinkPlaybackButton,
  mediaLinkPlaybackIcon,
} from './mediaLinkPlaybackButton'

describe('mediaLinkPlaybackButton', function() {
  const isYoutubeLink = function(url) {
    return String(url).indexOf('youtube.com') >= 0
  }

  test('resolveMediaLinkPlaybackButton uses midi plug styling for midifile links', function() {
    expect(resolveMediaLinkPlaybackButton({
      link: 'abcbook-recording:abc',
      mediaKind: 'midi',
    }, isYoutubeLink)).toEqual({
      variant: 'info',
      iconKey: 'midi',
      className: 'media-controls-link-btn media-controls-link-btn--midi',
      label: 'MIDI',
    })
  })

  test('resolveMediaLinkPlaybackButton uses link styling for audio links', function() {
    expect(resolveMediaLinkPlaybackButton({
      link: 'https://example.com/tune.mp3',
    }, isYoutubeLink)).toEqual({
      variant: 'danger',
      iconKey: 'link',
      className: 'media-controls-link-btn media-controls-link-btn--media',
      label: null,
    })
  })

  test('mediaLinkPlaybackIcon resolves tunebook icons', function() {
    const tunebook = { icons: { midi: 'MIDI_ICON', link: 'LINK_ICON' } }
    expect(mediaLinkPlaybackIcon(tunebook, 'midi')).toBe('MIDI_ICON')
    expect(mediaLinkPlaybackIcon(tunebook, 'missing')).toBe('LINK_ICON')
  })
})
