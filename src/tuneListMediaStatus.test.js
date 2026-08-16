import { mergeMediaCacheFlags, resolveTuneMediaSource, scanTuneMediaLinkStatus } from './tuneListMediaStatus'

describe('tuneListMediaStatus', function() {
  test('detects MIDI, YouTube, recording, and Drive sync from links', function() {
    const tune = {
      id: 'a',
      links: [
        { link: 'https://youtu.be/abcdefghijk', title: 'YT' },
        { link: 'abcbook-recording:rec1', recordingId: 'rec1', googleId: 'g1', mediaKind: 'audio' },
        { link: 'abcbook-recording:rec2', recordingId: 'rec2', mediaKind: 'audio' },
      ],
    }
    const status = scanTuneMediaLinkStatus(tune)
    expect(status.hasYoutube).toBe(true)
    expect(status.hasRecording).toBe(true)
    expect(status.hasOwnedMedia).toBe(true)
    expect(status.driveStatus).toBe('partial')
    expect(status.mediaSource).toBe('youtube')
    expect(status.hasMidi).toBe(false)
  })

  test('detects MIDI file links', function() {
    const tune = {
      id: 'a',
      links: [{ link: 'https://example.com/song.mid', title: 'Song.mid', mediaKind: 'midi' }],
    }
    const status = scanTuneMediaLinkStatus(tune)
    expect(status.hasMidi).toBe(true)
    expect(status.mediaSource).toBe('midi')
  })

  test('resolveTuneMediaSource prefers declared source then URI', function() {
    expect(resolveTuneMediaSource({ source: 'bandcamp', link: 'https://x.bandcamp.com/track/a' }, 'audio')).toBe('bandcamp')
    expect(resolveTuneMediaSource({ link: 'https://archive.org/details/foo' }, 'audio')).toBe('internet-archive')
  })

  test('mergeMediaCacheFlags sets cached and stems from summaries', function() {
    const status = {
      a: { hasLinks: true, hasCachedMedia: false, hasStems: false, mediaCacheScanned: false },
    }
    const merged = mergeMediaCacheFlags(
      status,
      [{ tuneId: 'a', entries: 1 }],
      [{ tuneId: 'a', entries: 2 }]
    )
    expect(merged.a.hasCachedMedia).toBe(true)
    expect(merged.a.hasStems).toBe(true)
    expect(merged.a.mediaCacheScanned).toBe(true)
  })
})
