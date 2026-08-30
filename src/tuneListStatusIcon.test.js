import {
  musicStatusIconProps,
  chordStatusIconProps,
  lyricsStatusIconProps,
  mediaStatusIconProps,
  snapshotStatusIconProps,
} from './tuneListStatusIcon'

describe('tuneListStatusIcon', function() {
  test('music icon uses danger for errors and warning for warnings', function() {
    expect(musicStatusIconProps({ hasNotes: true, hasMusicalErrors: true })).toEqual({
      variant: 'outline-danger',
      label: 'Has musical errors',
    })
    expect(musicStatusIconProps({ hasNotes: true, hasMusicalWarnings: true })).toEqual({
      variant: 'outline-warning',
      label: 'Has musical warnings',
    })
    expect(musicStatusIconProps({ hasNotes: true })).toEqual({
      variant: 'outline-primary',
      label: 'Has music notation',
    })
    expect(musicStatusIconProps({ hasMusicalErrors: true })).toEqual({
      variant: 'outline-danger',
      label: 'Has musical errors',
    })
    expect(musicStatusIconProps({})).toBeNull()
  })

  test('chord icon colors ABC vs inline vs both', function() {
    expect(chordStatusIconProps({ hasChords: true })).toEqual({
      variant: 'outline-primary',
      label: 'Has chords',
    })
    expect(chordStatusIconProps({ hasInlineChords: true })).toEqual({
      variant: 'outline-info',
      label: 'Has inline lyric chords',
    })
    expect(chordStatusIconProps({ hasChords: true, hasInlineChords: true })).toEqual({
      variant: 'outline-success',
      label: 'Has ABC chords and inline lyric chords',
    })
    expect(chordStatusIconProps({})).toBeNull()
  })

  test('lyrics icons stay outline-primary', function() {
    expect(lyricsStatusIconProps({ hasLyrics: true })).toEqual({
      variant: 'outline-primary',
      label: 'Has lyrics',
    })
    expect(lyricsStatusIconProps({})).toBeNull()
  })

  test('snapshot icons stay outline-primary', function() {
    expect(snapshotStatusIconProps({ hasSnapshot: true })).toEqual({
      variant: 'outline-primary',
      label: 'Has snapshot',
    })
    expect(snapshotStatusIconProps({})).toBeNull()
  })

  test('media icon colors source, cache, google, and stems', function() {
    expect(mediaStatusIconProps({ hasLinks: true })).toEqual({
      variant: 'outline-primary',
      label: 'Has media',
      overlayIconKey: null,
    })
    expect(mediaStatusIconProps({ hasLinks: true, hasMidi: true })).toMatchObject({
      variant: 'outline-info',
      overlayIconKey: 'midi',
    })
    expect(mediaStatusIconProps({ hasLinks: true, hasYoutube: true })).toMatchObject({
      variant: 'outline-danger',
      overlayIconKey: 'youtubeblack',
    })
    expect(mediaStatusIconProps({
      hasLinks: true,
      hasYoutube: true,
      hasCachedMedia: true,
    })).toMatchObject({
      variant: 'outline-success',
      overlayIconKey: 'youtubeblack',
    })
    expect(mediaStatusIconProps({ hasLinks: true, hasStems: true })).toMatchObject({
      variant: 'outline-success',
      overlayIconKey: 'surroundsound',
    })
    expect(mediaStatusIconProps({ hasLinks: true, driveStatus: 'synced' })).toMatchObject({
      variant: 'outline-success',
      overlayIconKey: 'save',
    })
    expect(mediaStatusIconProps({ hasLinks: true, driveStatus: 'pending' })).toMatchObject({
      variant: 'outline-warning',
    })
    expect(mediaStatusIconProps({ hasLinks: true, hasOwnedMedia: true })).toMatchObject({
      variant: 'outline-success',
      overlayIconKey: 'recordcircle',
    })
    expect(mediaStatusIconProps({})).toBeNull()
  })
})
