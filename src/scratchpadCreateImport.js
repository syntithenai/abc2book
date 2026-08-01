import { classifyAddFormFile } from './addFormAttach'
import {
  abcTextToCandidates,
  detectTextImportFormat,
  parseImportFile,
  readFileAsText,
} from './importSourceParse'
import { detectScoreFormat } from './scoreImportClient'
import { openMidiImportWizard } from './midiImportWizard'
import { isMidiImportFile } from './midiFileUtils'
import { blankNotationTune } from './scratchpadStore'
import {
  SCRATCHPAD_NOTATION_ABC_ACCEPT,
  SCRATCHPAD_NOTATION_FULL_ACCEPT,
} from './scratchpadNotationImportAccess'
import {
  DRIVE_READONLY_SCOPE,
  fetchDriveFileBlob,
  fetchDriveFileText,
  openGoogleDrivePicker,
} from './googleDrivePickerClient'

const SCRATCHPAD_IMAGE_FILE_ACCEPT = 'image/*,.pdf,application/pdf'
const SCRATCHPAD_AUDIO_FILE_ACCEPT = 'audio/*,video/*'
const SCRATCHPAD_TEXT_FILE_ACCEPT = '.txt,.md,text/plain,text/markdown'

const SCRATCHPAD_IMAGE_DRIVE_MIMES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
]

const SCRATCHPAD_AUDIO_DRIVE_MIMES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/x-m4a',
  'audio/webm',
  'audio/ogg',
  'video/mp4',
]

const SCRATCHPAD_TEXT_DRIVE_MIMES = [
  'text/plain',
  'text/markdown',
  'application/vnd.google-apps.document',
]

const SCRATCHPAD_NOTATION_DRIVE_MIMES_FULL = [
  'text/plain',
  'application/xml',
  'application/vnd.recordare.musicxml+xml',
  'application/vnd.recordare.musicxml',
  'application/zip',
  'audio/midi',
  'audio/mid',
  'application/vnd.google-apps.document',
]

const SCRATCHPAD_NOTATION_DRIVE_MIMES_ABC = [
  'text/plain',
  'application/vnd.google-apps.document',
]

function defaultTitle(itemType) {
  if (itemType === 'text') return 'Text note'
  if (itemType === 'image') return 'Image'
  if (itemType === 'notation') return 'Notation'
  if (itemType === 'audio') return 'Audio'
  if (itemType === 'composition') return 'Composition'
  return 'Scratchpad item'
}

function fileTitleFromName(fileName, itemType) {
  const base = String(fileName || '').trim()
  if (!base) return defaultTitle(itemType)
  return base.replace(/\.[^.]+$/, '') || defaultTitle(itemType)
}

export function getScratchpadFileAccept(itemType, notationImportAccess) {
  if (itemType === 'image') return SCRATCHPAD_IMAGE_FILE_ACCEPT
  if (itemType === 'audio') return SCRATCHPAD_AUDIO_FILE_ACCEPT
  if (itemType === 'notation') {
    return notationImportAccess && notationImportAccess.fileAccept
      ? notationImportAccess.fileAccept
      : SCRATCHPAD_NOTATION_FULL_ACCEPT
  }
  if (itemType === 'text') return SCRATCHPAD_TEXT_FILE_ACCEPT
  return '*/*'
}

export function getScratchpadDriveMimeTypes(itemType, notationImportAccess) {
  if (itemType === 'image') return SCRATCHPAD_IMAGE_DRIVE_MIMES.slice()
  if (itemType === 'audio') return SCRATCHPAD_AUDIO_DRIVE_MIMES.slice()
  if (itemType === 'notation') {
    if (notationImportAccess && notationImportAccess.abcOnly) {
      return SCRATCHPAD_NOTATION_DRIVE_MIMES_ABC.slice()
    }
    return SCRATCHPAD_NOTATION_DRIVE_MIMES_FULL.slice()
  }
  if (itemType === 'text') return SCRATCHPAD_TEXT_DRIVE_MIMES.slice()
  return []
}

export function notationFileNeedsImportWizard(file) {
  if (!file) return false
  const kind = classifyAddFormFile(file)
  const scoreFormat = detectScoreFormat(file.name)
  return kind === 'midi' || isMidiImportFile(file) || scoreFormat === 'midi'
}

/**
 * Notation imports that open a wizard (e.g. MIDI) cannot run in a batch.
 * When multiple files are selected and any need a wizard, only the first file is kept.
 */
export function prepareScratchpadCreateFiles(type, files) {
  const list = Array.isArray(files) ? files.filter(Boolean) : []
  if (!list.length || type !== 'notation' || list.length === 1) {
    return { files: list, skipped: 0 }
  }
  const hasWizardFile = list.some(notationFileNeedsImportWizard)
  if (!hasWizardFile) {
    return { files: list, skipped: 0 }
  }
  return { files: [list[0]], skipped: list.length - 1 }
}

export function scratchpadSourcesForType(itemType, notationImportAccess, options) {
  const opts = options || {}
  const loggedIn = !!opts.loggedIn
  let sources
  if (itemType === 'image') {
    sources = [
      { key: 'blank', label: 'Blank canvas' },
      { key: 'camera', label: 'Camera' },
      { key: 'import', label: 'Import files' },
      { key: 'drive', label: 'Google Drive' },
      { key: 'google-photos', label: 'Google Photos' },
    ]
  } else if (itemType === 'audio') {
    sources = [
      { key: 'capture', label: 'Record audio' },
      { key: 'import', label: 'Import files' },
      { key: 'drive', label: 'Google Drive' },
    ]
  } else if (itemType === 'notation') {
    if (notationImportAccess && (notationImportAccess.mode === 'login' || notationImportAccess.mode === 'credit')) {
      sources = [
        { key: 'blank', label: 'Blank notation' },
        { key: 'import', label: notationImportAccess.importLabel || 'Import ABC' },
        { key: 'drive', label: 'Google Drive' },
        {
          key: notationImportAccess.mode === 'credit' ? 'credit-import' : 'login-import',
          label: notationImportAccess.loginImportLabel || 'Login to Import MusicXML/MIDI',
        },
      ]
    } else {
      const importLabel = notationImportAccess
        ? notationImportAccess.importLabel
        : 'Import ABC/MusicXML/MIDI'
      sources = [
        { key: 'blank', label: 'Blank notation' },
        { key: 'import', label: importLabel },
        { key: 'drive', label: 'Google Drive' },
      ]
    }
  } else if (itemType === 'composition') {
    sources = [{ key: 'blank', label: 'Blank composition' }]
  } else {
    sources = [
      { key: 'blank', label: 'Blank text' },
      { key: 'import', label: 'Import text files' },
      { key: 'drive', label: 'Google Drive' },
    ]
  }
  if (!loggedIn) {
    return sources.filter(function(src) {
      return src.key !== 'drive' && src.key !== 'google-photos'
    })
  }
  return sources
}

function normalizeAccessToken(token) {
  if (!token) return null
  if (typeof token === 'string') return token
  return token.access_token || null
}

async function importNotationTuneFromFile(file, tunebook, token, options) {
  const opts = options || {}
  const abcOnly = !!opts.abcOnly
  const fileTitle = fileTitleFromName(file.name, 'notation')
  const kind = classifyAddFormFile(file)
  const scoreFormat = detectScoreFormat(file.name)
  const accessToken = normalizeAccessToken(token)

  if (abcOnly) {
    if (kind === 'midi' || isMidiImportFile(file) || (scoreFormat && scoreFormat !== 'abc')) {
      throw new Error('Only ABC files can be imported without the media resolver.')
    }
    const text = await readFileAsText(file)
    if (detectTextImportFormat(text, file.name) !== 'abc') {
      throw new Error('Only ABC notation can be imported without the media resolver.')
    }
    const candidates = abcTextToCandidates(text, tunebook, null)
    if (candidates && candidates.length > 0 && candidates[0].tune) {
      return {
        title: candidates[0].tune.name || fileTitle,
        tuneSnapshot: candidates[0].tune,
      }
    }
    return null
  }

  if (kind === 'midi' || isMidiImportFile(file) || scoreFormat === 'midi') {
    const wizardResult = await openMidiImportWizard({ file: file, accessToken: accessToken })
    const candidates = wizardResult.candidates || []
    if (candidates.length > 0 && candidates[0].tune) {
      return {
        title: candidates[0].tune.name || fileTitle,
        tuneSnapshot: candidates[0].tune,
      }
    }
    return { title: fileTitle, tuneSnapshot: blankNotationTune(null, fileTitle) }
  }

  if (scoreFormat && scoreFormat !== 'abc') {
    const candidates = await parseImportFile({
      file: file,
      tunebook: tunebook,
      accessToken: accessToken,
      resolverAvailable: true,
    })
    if (candidates && candidates.length > 0 && candidates[0].tune) {
      return {
        title: candidates[0].tune.name || fileTitle,
        tuneSnapshot: candidates[0].tune,
      }
    }
    return null
  }

  const text = await readFileAsText(file)
  const candidates = abcTextToCandidates(text, tunebook, null)
  if (candidates && candidates.length > 0 && candidates[0].tune) {
    return {
      title: candidates[0].tune.name || fileTitle,
      tuneSnapshot: candidates[0].tune,
    }
  }
  return null
}

export async function buildScratchpadCreateOptions(type, file, context) {
  const ctx = context || {}
  if (!file || !type) return null

  const kind = classifyAddFormFile(file)
  const fileTitle = fileTitleFromName(file.name, type)

  if (type === 'image' && (kind === 'sheetImage' || (file.type && file.type.indexOf('image/') === 0))) {
    return { title: fileTitle, blob: file }
  }
  if (type === 'audio' && (kind === 'audio' || kind === 'video')) {
    return { title: fileTitle, blob: file }
  }
  if (type === 'notation') {
    const imported = await importNotationTuneFromFile(file, ctx.tunebook, ctx.token, {
      abcOnly: ctx.abcOnly,
    })
    return imported
  }
  if (type === 'text') {
    const text = await new Response(file).text()
    return { textBody: text, title: fileTitle }
  }
  return null
}

async function driveMeta(driveApi, fileId) {
  return new Promise(function(resolve, reject) {
    driveApi.getDocumentMeta(fileId).then(resolve).catch(reject)
  })
}

export async function loadScratchpadDriveFile(driveApi, fileId, token, itemType) {
  if (!driveApi || !fileId) throw new Error('Drive file is not available')
  const meta = await driveMeta(driveApi, fileId)
  const mime = meta && meta.mimeType ? meta.mimeType : ''
  const fileName = (meta && meta.name) || 'drive-import'

  if (itemType === 'image' || itemType === 'audio') {
    const blob = await fetchDriveFileBlob(driveApi, fileId)
    const type = blob.type || mime || (itemType === 'audio' ? 'audio/wav' : 'application/octet-stream')
    return new File([blob], fileName, { type: type })
  }

  if (itemType === 'notation' && mime.indexOf('google-apps') === -1
    && (mime.indexOf('audio/') === 0 || mime.indexOf('application/') === 0 && mime.indexOf('text/') !== 0)) {
    const blob = await fetchDriveFileBlob(driveApi, fileId)
    return new File([blob], fileName, { type: blob.type || mime || 'application/octet-stream' })
  }

  const text = await fetchDriveFileText(driveApi, fileId, normalizeAccessToken(token))
  return new File([String(text || '')], fileName, { type: 'text/plain' })
}

export async function pickScratchpadDriveFiles(options) {
  const opts = options || {}
  if (!opts.token || !opts.token.access_token) {
    throw new Error('Log in with Google first.')
  }
  if (!opts.driveApi) {
    throw new Error('Google Drive is not available.')
  }

  let accessToken = opts.token.access_token
  if (typeof opts.requestGoogleScopes === 'function') {
    const scopeResult = await opts.requestGoogleScopes([DRIVE_READONLY_SCOPE])
    if (scopeResult && scopeResult.access_token) {
      accessToken = scopeResult.access_token
    }
  }

  const picked = await openGoogleDrivePicker({
    accessToken: accessToken,
    title: opts.title || 'Choose Google Drive files',
    mimeTypes: opts.mimeTypes,
    multiSelect: opts.multiSelect !== false,
  })

  const docs = Array.isArray(picked) ? picked : (picked ? [picked] : [])
  if (!docs.length) return []

  if (typeof opts.onFetchStart === 'function') {
    opts.onFetchStart(docs.length)
  }

  const files = []
  for (let i = 0; i < docs.length; i += 1) {
    const doc = docs[i]
    if (!doc || !doc.id) continue
    if (typeof opts.onFetchProgress === 'function') {
      opts.onFetchProgress(i + 1, docs.length)
    }
    const file = await loadScratchpadDriveFile(opts.driveApi, doc.id, opts.token, opts.itemType)
    if (file) files.push(file)
  }
  return files
}

export {
  defaultTitle,
  SCRATCHPAD_NOTATION_ABC_ACCEPT,
  SCRATCHPAD_NOTATION_FULL_ACCEPT,
}
