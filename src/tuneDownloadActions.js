import { lyricLinesToText } from './wLinesUtils'
import { abcToMusicXml } from './scoreImportClient'
import { isMediaProxyConfigured } from './mediaProxyClient'
import { countCacheableLinks, resolveActiveLinkForTune } from './mediaLinkResolve'
import { getMediaPlaybackSettings } from './pitchTempoUtils'
import { getMediaResolverHealthState } from './mediaResolverHealthStore'
import { getResolverFeaturesFromStatus } from './resolverFeatures'
import { isStemsCapabilityAvailable, loadProviderSettings } from './providerSettings'
import { exportTuneToChordPro, exportTuneToOnSong, tuneHasChordSheetContent } from './chordProFormatUtils'
import { getAudioCompressFormat, getAudioCompressExtension } from './audioCompressSettings'
import { encodeAudioBuffer } from './audioCompressEncode'
import { renderAbcToAudioBuffer } from './notationAudioExport'
import { isFeedFeedbackAdmin } from './feedFeedbackUtils'
import { saveBlobToDevice } from './nativeFileSave'

export const TUNE_DOWNLOAD_FORMATS = [
  { id: 'abc', label: 'ABC', icon: 'music', description: 'ABC notation file' },
  { id: 'csv', label: 'CSV', icon: 'filelist', description: 'Spreadsheet metadata export' },
  { id: 'json', label: 'JSON', icon: 'stack', description: 'Tune data as JSON' },
  { id: 'midi', label: 'MIDI', icon: 'midi', description: 'Generated MIDI playback' },
  { id: 'midi-notation', label: 'MIDI (notation-friendly)', icon: 'midi', description: 'Melody-focused MIDI for re-import' },
  { id: 'musescore', label: 'MuseScore', icon: 'pianoroll', description: 'MusicXML for MuseScore', requiresResolver: true },
  { id: 'chordpro', label: 'ChordPro', icon: 'words', description: 'ChordPro chord sheet (.cho)' },
  { id: 'onsong', label: 'OnSong', icon: 'words', description: 'OnSong chord sheet (.onsong)' },
  { id: 'links', label: 'Links list', icon: 'link', description: 'Titles and media links' },
  { id: 'lyrics', label: 'Lyrics text', icon: 'words', description: 'Lyrics with title and artist headers' },
  { id: 'linked-audio', label: 'Audio', icon: 'headphone', description: 'Linked media using the Compress Audio setting, with playback settings and trim applied' },
]

export function linkedAudioDownloadFormat(formatId) {
  if (formatId === 'linked-audio') return getAudioCompressFormat()
  // Legacy ids still resolve for queued jobs / bookmarks.
  if (formatId === 'linked-audio-wav') return 'wav'
  if (formatId === 'linked-audio-mp3') return 'mp3'
  return null
}

export function isLinkedAudioDownloadFormat(formatId) {
  return formatId === 'linked-audio'
    || formatId === 'linked-audio-wav'
    || formatId === 'linked-audio-mp3'
}

export function isRestrictedTuneDownloadFormat(formatId) {
  return isLinkedAudioDownloadFormat(formatId) || formatId === 'stems'
}

export function canShowRestrictedTuneDownloads(user, resolverStatus) {
  return isFeedFeedbackAdmin(user, resolverStatus)
}

export function shouldShowRestrictedTuneDownloads(options) {
  if (options && options.allowRestrictedFormats) return true
  const resolverStatus = (options && options.resolverStatus)
    || (getMediaResolverHealthState().status || null)
  return canShowRestrictedTuneDownloads(options && options.user, resolverStatus)
}

export function getTuneDownloadFormatsForContext(options) {
  const showRestricted = shouldShowRestrictedTuneDownloads(options)
  return TUNE_DOWNLOAD_FORMATS.filter(function(format) {
    return showRestricted || !isLinkedAudioDownloadFormat(format.id)
  })
}

function escapeCsvCell(value) {
  var text = value === null || value === undefined ? '' : String(value)
  if (text.indexOf('"') !== -1 || text.indexOf(',') !== -1 || text.indexOf('\n') !== -1 || text.indexOf('\r') !== -1) {
    return '"' + text.replace(/"/g, '""') + '"'
  }
  return text
}

export function sanitizeDownloadFilename(name, fallback) {
  var cleaned = String(name || fallback || 'download').replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_').trim()
  return cleaned || String(fallback || 'download')
}

export function tunesToCsv(tunes) {
  var rows = [[
    'name',
    'composer',
    'key',
    'meter',
    'tempo',
    'rhythm',
    'books',
    'tags',
    'boost',
    'difficulty',
    'srcUrl',
  ]]
  tunes.forEach(function(tune) {
    rows.push([
      tune && tune.name ? tune.name : '',
      tune && tune.composer ? tune.composer : '',
      tune && tune.key ? tune.key : '',
      tune && tune.meter ? tune.meter : '',
      tune && tune.tempo ? tune.tempo : '',
      tune && tune.rhythm ? tune.rhythm : '',
      tune && Array.isArray(tune.books) ? tune.books.join('; ') : '',
      tune && Array.isArray(tune.tags) ? tune.tags.join('; ') : '',
      tune && tune.boost !== undefined && tune.boost !== null ? tune.boost : '',
      tune && tune.difficulty !== undefined && tune.difficulty !== null ? tune.difficulty : '',
      tune && tune.srcUrl ? tune.srcUrl : '',
    ])
  })
  return rows.map(function(row) {
    return row.map(escapeCsvCell).join(',')
  }).join('\n')
}

export function tunesToJson(tunes) {
  return JSON.stringify(tunes, null, 2)
}

export function tunesToLyricsText(tunes) {
  return tunes.map(function(tune) {
    var header = (tune && tune.name ? tune.name : 'Untitled')
      + (tune && tune.composer ? ' - ' + tune.composer : '')
    var lyrics = tune ? lyricLinesToText(tune) : ''
    if (!lyrics.trim()) return header + '\n'
    return header + '\n' + lyrics
  }).join('\n\n')
}


export function downloadBlob(filename, blob) {
  if (!blob) return
  saveBlobToDevice(blob, filename).catch(function(err) {
    console.warn('downloadBlob failed', err)
    var url = window.URL.createObjectURL(blob)
    var anchor = document.createElement('a')
    document.body.appendChild(anchor)
    anchor.style.display = 'none'
    anchor.href = url
    anchor.download = filename
    anchor.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(anchor)
  })
}

function pauseBetweenDownloads(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms)
  })
}

async function downloadMusicXmlForTune(tune, tunebook, token) {
  var abc = tunebook.getMusicXmlExportAbc
    ? tunebook.getMusicXmlExportAbc(tune)
    : (tunebook.getNotationExportAbc
      ? tunebook.getNotationExportAbc(tune)
      : tunebook.getExportAbc(tune))
  if (!abc) {
    throw new Error('Could not generate ABC for "' + (tune.name || 'tune') + '"')
  }
  var musicXml = await abcToMusicXml(
    abc,
    sanitizeDownloadFilename(tune.name, 'tune') + '.abc',
    token
  )
  downloadBlob(
    sanitizeDownloadFilename(tune.name, 'tune') + '.musicxml',
    new Blob([musicXml], { type: 'application/vnd.recordare.musicxml+xml' })
  )
}

export function isStemsDownloadAvailable() {
  if (!isMediaProxyConfigured()) return false
  const status = getMediaResolverHealthState().status
  const features = getResolverFeaturesFromStatus(status)
  return isStemsCapabilityAvailable(features, loadProviderSettings(), status)
}

export function isStemsDownloadDisabled(tunes, tunebook) {
  if (!isStemsDownloadAvailable()) return true
  const isYoutubeLink = tunebook && tunebook.utils ? tunebook.utils.isYoutubeLink : null
  return countCacheableLinks(tunes, isYoutubeLink) === 0
}

export function isTuneDownloadFormatAvailable(formatId) {
  var format = TUNE_DOWNLOAD_FORMATS.find(function(item) { return item.id === formatId })
  if (!format) return false
  if (format.requiresResolver && !isMediaProxyConfigured()) return false
  return true
}

function tuneHasNotationAudio(tune, tunebook) {
  return !!(tunebook && typeof tunebook.hasNotesOrChords === 'function' && tunebook.hasNotesOrChords(tune))
}

function tuneHasLinkedOrNotationAudio(tune, tunebook) {
  const isYoutubeLink = tunebook && tunebook.utils ? tunebook.utils.isYoutubeLink : null
  if (resolveActiveLinkForTune(tune, null, isYoutubeLink)) return true
  return tuneHasNotationAudio(tune, tunebook)
}

export function isTuneDownloadFormatDisabled(formatId, tunes, tunebook) {
  if (!isTuneDownloadFormatAvailable(formatId)) return true
  if (formatId === 'chordpro' || formatId === 'onsong') {
    return !tunes.some(function(tune) { return tuneHasChordSheetContent(tune) })
  }
  if (formatId === 'midi' || formatId === 'midi-notation') {
    return !tunes.some(function(tune) { return tuneHasNotationAudio(tune, tunebook) })
  }
  if (isLinkedAudioDownloadFormat(formatId)) {
    return !tunes.some(function(tune) { return tuneHasLinkedOrNotationAudio(tune, tunebook) })
  }
  return false
}

export function getTuneDownloadStartToastMessage(formatId, tuneCount) {
  const count = tuneCount > 0 ? tuneCount : 1
  const plural = count === 1 ? '' : 's'
  if (isLinkedAudioDownloadFormat(formatId)) {
    return 'Starting audio download for ' + count + ' tune' + plural + '...'
  }
  if (formatId === 'stems') {
    return 'Starting stems download for ' + count + ' tune' + plural + '...'
  }
  if (formatId === 'midi' || formatId === 'midi-notation') {
    return 'Starting MIDI download for ' + count + ' tune' + plural + '...'
  }
  return 'Starting download for ' + count + ' tune' + plural + '...'
}

async function downloadNotationAudioForTune(tune, tunebook, audioFormat) {
  const abc = tunebook.getExportAbc ? tunebook.getExportAbc(tune) : null
  if (!abc || !String(abc).trim()) {
    throw new Error('Could not generate notation audio for "' + (tune && tune.name ? tune.name : 'tune') + '"')
  }
  const buffer = await renderAbcToAudioBuffer(abc)
  const encoded = await encodeAudioBuffer(buffer, audioFormat)
  const extension = getAudioCompressExtension(audioFormat)
  downloadBlob(
    sanitizeDownloadFilename(tune && tune.name, 'tune') + '.' + extension,
    encoded.blob
  )
}

async function downloadLinkedAudioForTune(tune, tunebook, token, formatId) {
  const isYoutubeLink = tunebook && tunebook.utils ? tunebook.utils.isYoutubeLink : null
  const resolved = resolveActiveLinkForTune(tune, null, isYoutubeLink)
  if (!resolved) {
    throw new Error('No linked media found for "' + (tune && tune.name ? tune.name : 'tune') + '"')
  }
  const audioFormat = linkedAudioDownloadFormat(formatId)
  const extension = getAudioCompressExtension(audioFormat)
  const safeName = sanitizeDownloadFilename(tune && tune.name, 'tune')
  const filename = safeName + '-link-' + (parseInt(resolved.linkIndex, 10) + 1) + '.' + extension
  const health = getMediaResolverHealthState()
  const { downloadTuneMediaExport } = await import('./mediaExportUtils')
  await downloadTuneMediaExport({
    tune: tune,
    linkIndex: resolved.linkIndex,
    srcType: resolved.srcType,
    filename: filename,
    audioFormat: audioFormat,
    youtubeGetId: tunebook.utils.YouTubeGetID,
    accessToken: token && token.access_token ? token.access_token : null,
    demucsModel: health.status && health.status.demucsModel ? health.status.demucsModel : 'htdemucs',
    settings: getMediaPlaybackSettings(tune),
    trim: true,
  })
}

export async function executeTuneDownload(formatId, options) {
  var tunes = Array.isArray(options.tunes) ? options.tunes.filter(Boolean) : []
  var tunebook = options.tunebook
  var archiveBaseName = sanitizeDownloadFilename(options.archiveBaseName, tunes.length === 1 ? 'tune' : 'selected')
  var utils = tunebook.utils
  var abcTools = tunebook.abcTools
  var token = options.token

  if (!tunes.length) {
    throw new Error('No tunes selected for download')
  }

  switch (formatId) {
    case 'abc': {
      var abc = tunes.length === 1
        ? abcTools.json2abc(tunes[0]).trim()
        : abcTools.tunesToAbc(tunes)
      utils.download(archiveBaseName + '.abc', abc)
      return
    }
    case 'csv': {
      utils.download(archiveBaseName + '.csv', tunesToCsv(tunes))
      return
    }
    case 'json': {
      utils.download(archiveBaseName + '.json', tunesToJson(tunes))
      return
    }
    case 'links': {
      utils.download(archiveBaseName + ' links.txt', abcTools.tunesToLinkList(tunes))
      return
    }
    case 'lyrics': {
      utils.download(archiveBaseName + ' lyrics.txt', tunesToLyricsText(tunes))
      return
    }
    case 'midi':
    case 'midi-notation': {
      var notationFriendly = formatId === 'midi-notation'
      for (var midiIndex = 0; midiIndex < tunes.length; midiIndex++) {
        tunebook.downloadMidi(tunes[midiIndex], { notationFriendly: notationFriendly })
        if (midiIndex < tunes.length - 1) {
          await pauseBetweenDownloads(350)
        }
      }
      return
    }
    case 'musescore': {
      if (!isMediaProxyConfigured()) {
        throw new Error('MuseScore export needs a media resolver for MIDI to MusicXML conversion.')
      }
      for (var xmlIndex = 0; xmlIndex < tunes.length; xmlIndex++) {
        await downloadMusicXmlForTune(tunes[xmlIndex], tunebook, token)
        if (xmlIndex < tunes.length - 1) {
          await pauseBetweenDownloads(500)
        }
      }
      return
    }
    case 'linked-audio':
    case 'linked-audio-mp3':
    case 'linked-audio-wav': {
      const isYoutubeLink = tunebook && tunebook.utils ? tunebook.utils.isYoutubeLink : null
      const linkedTunes = tunes.filter(function(tune) {
        return resolveActiveLinkForTune(tune, null, isYoutubeLink)
      })
      const notationTunes = tunes.filter(function(tune) {
        return !resolveActiveLinkForTune(tune, null, isYoutubeLink) && tuneHasNotationAudio(tune, tunebook)
      })
      if (!linkedTunes.length && !notationTunes.length) {
        throw new Error('No linked media or notation audio was found on the selected tune(s).')
      }
      const audioFormat = linkedAudioDownloadFormat(formatId)
      for (var linkedIndex = 0; linkedIndex < linkedTunes.length; linkedIndex++) {
        await downloadLinkedAudioForTune(linkedTunes[linkedIndex], tunebook, token, formatId)
        if (linkedIndex < linkedTunes.length - 1) {
          await pauseBetweenDownloads(500)
        }
      }
      for (var notationIndex = 0; notationIndex < notationTunes.length; notationIndex++) {
        await downloadNotationAudioForTune(notationTunes[notationIndex], tunebook, audioFormat)
        if (notationIndex < notationTunes.length - 1) {
          await pauseBetweenDownloads(500)
        }
      }
      return
    }
    case 'chordpro': {
      for (var choIndex = 0; choIndex < tunes.length; choIndex++) {
        var choTune = tunes[choIndex]
        if (!tuneHasChordSheetContent(choTune)) continue
        utils.download(
          sanitizeDownloadFilename(choTune.name, 'tune') + '.cho',
          exportTuneToChordPro(choTune)
        )
        if (choIndex < tunes.length - 1) {
          await pauseBetweenDownloads(350)
        }
      }
      return
    }
    case 'onsong': {
      for (var onsongIndex = 0; onsongIndex < tunes.length; onsongIndex++) {
        var onsongTune = tunes[onsongIndex]
        if (!tuneHasChordSheetContent(onsongTune)) continue
        utils.download(
          sanitizeDownloadFilename(onsongTune.name, 'tune') + '.onsong',
          exportTuneToOnSong(onsongTune)
        )
        if (onsongIndex < tunes.length - 1) {
          await pauseBetweenDownloads(350)
        }
      }
      return
    }
    default:
      throw new Error('Unknown download format')
  }
}
