import { lyricLinesToText } from './wLinesUtils'
import { abcToMusicXml } from './scoreImportClient'
import { isMediaProxyConfigured } from './mediaProxyClient'
import { countCacheableLinks } from './mediaLinkResolve'
import { getMediaResolverHealthState } from './mediaResolverHealthStore'
import { resolverHasFeature } from './resolverFeatures'
import * as mediaCacheQueue from './mediaCacheQueue'
import { exportTuneToChordPro, exportTuneToOnSong, tuneHasChordSheetContent } from './chordProFormatUtils'

export const TUNE_DOWNLOAD_FORMATS = [
  { id: 'abc', label: 'ABC', icon: 'music', description: 'ABC notation file' },
  { id: 'csv', label: 'CSV', icon: 'filelist', description: 'Spreadsheet metadata export' },
  { id: 'json', label: 'JSON', icon: 'stack', description: 'Tune data as JSON' },
  { id: 'midi', label: 'MIDI', icon: 'midi', description: 'Generated MIDI playback' },
  { id: 'musescore', label: 'MuseScore', icon: 'pianoroll', description: 'MusicXML for MuseScore', requiresResolver: true },
  { id: 'chordpro', label: 'ChordPro', icon: 'words', description: 'ChordPro chord sheet (.cho)' },
  { id: 'onsong', label: 'OnSong', icon: 'words', description: 'OnSong chord sheet (.onsong)' },
  { id: 'links', label: 'Links list', icon: 'link', description: 'Titles and media links' },
  { id: 'lyrics', label: 'Lyrics text', icon: 'words', description: 'Lyrics with title and artist headers' },
  { id: 'linked-audio-mp3', label: 'Audio (MP3)', icon: 'headphone', description: 'Linked media as MP3 with playback settings and trim applied' },
  { id: 'linked-audio-wav', label: 'Audio (WAV)', icon: 'headphone', description: 'Linked media as WAV with playback settings and trim applied' },
]

export function linkedAudioDownloadFormat(formatId) {
  if (formatId === 'linked-audio-wav') return 'wav'
  if (formatId === 'linked-audio-mp3') return 'mp3'
  return null
}

export function isLinkedAudioDownloadFormat(formatId) {
  return linkedAudioDownloadFormat(formatId) !== null
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
  var url = window.URL.createObjectURL(blob)
  var anchor = document.createElement('a')
  document.body.appendChild(anchor)
  anchor.style.display = 'none'
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.URL.revokeObjectURL(url)
  document.body.removeChild(anchor)
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
  return resolverHasFeature(getMediaResolverHealthState().status, 'stems')
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

export function isTuneDownloadFormatDisabled(formatId, tunes, tunebook) {
  if (!isTuneDownloadFormatAvailable(formatId)) return true
  if (formatId === 'chordpro' || formatId === 'onsong') {
    return !tunes.some(function(tune) { return tuneHasChordSheetContent(tune) })
  }
  if (isLinkedAudioDownloadFormat(formatId)) {
    const isYoutubeLink = tunebook && tunebook.utils ? tunebook.utils.isYoutubeLink : null
    return countCacheableLinks(tunes, isYoutubeLink) === 0
  }
  return false
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
    case 'midi': {
      for (var midiIndex = 0; midiIndex < tunes.length; midiIndex++) {
        tunebook.downloadMidi(tunes[midiIndex])
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
    case 'linked-audio-mp3':
    case 'linked-audio-wav': {
      const audioFormat = linkedAudioDownloadFormat(formatId)
      const queueTunebook = {
        utils: tunebook.utils,
        accessToken: token && token.access_token ? token.access_token : null,
      }
      const ids = mediaCacheQueue.enqueueTunesDownloadJobs(tunes, queueTunebook, null, audioFormat)
      if (!ids.length) {
        throw new Error('No cacheable linked media was found on the selected tune(s).')
      }
      mediaCacheQueue.start()
      if (options.onOpenQueue) {
        options.onOpenQueue()
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
