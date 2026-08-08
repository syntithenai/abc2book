import { readAudioFileMetadata, isVideoImportFile, titleArtistFromFilename } from './audioFileMetadata'
import { createAttachedAudioLink, createAttachedVideoLink } from './linkRecording'
import { freshTuneId } from './importReviewCandidateUtils'
import { primaryArtist } from './tuneBibliographicUtils'
import { toSearchText } from './searchTextUtils'

export function normalizeMediaIdentityKey(title, artist) {
  const normalizedTitle = toSearchText(title).replace(/\s+/g, ' ')
  const normalizedArtist = toSearchText(artist).replace(/\s+/g, ' ')
  if (!normalizedTitle && !normalizedArtist) return ''
  return normalizedTitle + '\0' + normalizedArtist
}

export function mediaImportMergeTargetId(title, artist) {
  const key = normalizeMediaIdentityKey(title, artist)
  if (!key || key === '\0') return null
  return 'media-import:' + encodeURIComponent(key)
}

export async function resolveMediaFileIdentity(file, draft) {
  const isVideo = isVideoImportFile(file)
  let title = ''
  let artist = ''
  let album = ''
  let duration = null

  if (!isVideo) {
    try {
      const metadata = await readAudioFileMetadata(file)
      title = metadata.title || ''
      artist = metadata.artist || ''
      album = metadata.album || ''
      duration = metadata.duration
    } catch (e) { /* ignore tag parse errors */ }
  } else {
    const fromName = titleArtistFromFilename(file.name)
    title = fromName.title
    artist = fromName.artist
  }

  if (!title) {
    title = (draft && draft.tune && draft.tune.name) || ''
  }
  if (!artist) {
    artist = (draft && draft.tune ? primaryArtist(draft.tune) : '') || ''
  }
  if (!title && file && file.name) {
    const fromName = titleArtistFromFilename(file.name)
    title = fromName.title || String(file.name).replace(/\.[^.]+$/, '')
    if (!artist) artist = fromName.artist
  }

  const displayTitle = String(title || '').trim() || 'Untitled'
  return {
    title: displayTitle,
    artist: String(artist || '').trim(),
    album: album,
    duration: duration,
    isVideo: isVideo,
  }
}

export async function buildMediaFileImportCandidate(file, options) {
  const opts = options || {}
  const draft = opts.draft
  const identity = await resolveMediaFileIdentity(file, draft)
  const tuneBase = {
    id: freshTuneId(),
    name: identity.title,
    composer: identity.artist,
    links: [],
  }
  if (opts.sourceUrl) {
    tuneBase.srcUrl = opts.sourceUrl
  }

  const linkTitle = identity.title || (file && file.name) || 'Attached media'
  const attached = identity.isVideo
    ? await createAttachedVideoLink({
      tune: tuneBase,
      file: file,
      title: linkTitle,
      uploadToDrive: !!opts.uploadToDrive,
      token: opts.token,
      driveApi: opts.driveApi,
    })
    : await createAttachedAudioLink({
      tune: tuneBase,
      file: file,
      title: linkTitle,
      uploadToDrive: !!opts.uploadToDrive,
      token: opts.token,
      driveApi: opts.driveApi,
    })

  return {
    tune: Object.assign({}, tuneBase, {
      links: [attached.link],
      mediaCacheLocked: true,
    }),
    sourceKind: identity.isVideo ? 'video' : 'audio',
    mergeTargetId: mediaImportMergeTargetId(identity.title, identity.artist),
    skipEnrich: true,
    mergeMode: 'suggestOnly',
  }
}

export async function buildMediaImportCandidatesFromFiles(files, options) {
  const opts = options || {}
  const list = Array.isArray(files) ? files.filter(Boolean) : []
  const candidates = []
  for (let i = 0; i < list.length; i += 1) {
    const uploadToDrive = Array.isArray(opts.uploadToDriveFlags)
      ? !!(opts.uploadToDriveFlags[i])
      : !!opts.uploadToDrive
    candidates.push(await buildMediaFileImportCandidate(list[i], {
      draft: opts.draft,
      token: opts.token,
      driveApi: opts.driveApi,
      uploadToDrive: uploadToDrive,
      sourceUrl: opts.sourceUrl,
    }))
  }
  return candidates
}
