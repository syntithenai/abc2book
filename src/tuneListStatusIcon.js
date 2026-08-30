export function musicStatusIconProps(status) {
  if (!status) return null
  if (status.hasMusicalErrors) {
    return { variant: 'outline-danger', label: 'Has musical errors' }
  }
  if (status.hasMusicalWarnings) {
    return { variant: 'outline-warning', label: 'Has musical warnings' }
  }
  if (status.hasNotes) {
    return { variant: 'outline-primary', label: 'Has music notation' }
  }
  return null
}

export function chordStatusIconProps(status) {
  if (!status) return null
  const abc = !!status.hasChords
  const inline = !!status.hasInlineChords
  if (!abc && !inline) return null
  if (abc && inline) {
    return { variant: 'outline-success', label: 'Has ABC chords and inline lyric chords' }
  }
  if (inline) {
    return { variant: 'outline-info', label: 'Has inline lyric chords' }
  }
  return { variant: 'outline-primary', label: 'Has chords' }
}

export function lyricsStatusIconProps(status) {
  if (!status || !status.hasLyrics) return null
  return { variant: 'outline-primary', label: 'Has lyrics' }
}

export function snapshotStatusIconProps(status) {
  if (!status || !status.hasSnapshot) return null
  return { variant: 'outline-primary', label: 'Has snapshot' }
}

const MEDIA_SOURCE_LABELS = {
  youtube: 'YouTube',
  midi: 'MIDI file',
  recording: 'recording',
  'music-collection': 'library',
  'device-file': 'device file',
  bandcamp: 'Bandcamp',
  'internet-archive': 'Internet Archive',
  loc: 'Library of Congress',
  europeana: 'Europeana',
  file: 'attached file',
  mic: 'recording',
  'video-file': 'video',
  audio: 'audio',
}

function mediaSourceLabel(status) {
  if (!status) return ''
  if (status.hasMidi) return MEDIA_SOURCE_LABELS.midi
  if (status.hasYoutube) return MEDIA_SOURCE_LABELS.youtube
  return MEDIA_SOURCE_LABELS[status.mediaSource] || ''
}

export function mediaStatusIconProps(status) {
  if (!status || !status.hasLinks) return null

  const parts = ['Has media']
  const sourceLabel = mediaSourceLabel(status)
  if (sourceLabel) parts.push(sourceLabel)
  if (status.hasStems) parts.push('stems')
  if (status.hasCachedMedia) parts.push('cached')
  if (status.driveStatus === 'synced') parts.push('uploaded to Google')
  else if (status.driveStatus === 'pending') parts.push('Google upload pending')
  else if (status.driveStatus === 'partial') parts.push('partially uploaded to Google')

  let variant = 'outline-primary'
  if (status.hasMidi) {
    variant = 'outline-info'
  } else if (status.driveStatus === 'pending' || status.driveStatus === 'partial') {
    variant = 'outline-warning'
  } else if (status.hasCachedMedia || status.hasStems || status.driveStatus === 'synced' || status.hasOwnedMedia) {
    variant = 'outline-success'
  } else if (status.hasYoutube) {
    variant = 'outline-danger'
  }

  let overlayIconKey = null
  if (status.hasMidi) overlayIconKey = 'midi'
  else if (status.hasStems) overlayIconKey = 'surroundsound'
  else if (status.hasYoutube) overlayIconKey = 'youtubeblack'
  else if (status.mediaSource === 'music-collection') overlayIconKey = 'folderopen'
  else if (status.driveStatus === 'synced') overlayIconKey = 'save'
  else if (status.hasOwnedMedia || status.hasRecording) overlayIconKey = 'recordcircle'
  else if (status.hasCachedMedia) overlayIconKey = 'save'

  return {
    variant: variant,
    label: parts.join(' · '),
    overlayIconKey: overlayIconKey,
  }
}
