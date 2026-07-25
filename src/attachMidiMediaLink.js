import { createAttachedMidiLink } from './linkRecording'
import { isMidiImportFile } from './midiFileUtils'

function pendingFileToFile(pendingFile) {
  if (!pendingFile || !pendingFile.blob) return null
  if (pendingFile.blob instanceof File) return pendingFile.blob
  return new File(
    [pendingFile.blob],
    pendingFile.name || 'import.mid',
    { type: pendingFile.type || 'audio/midi' }
  )
}

/**
 * Attach candidate.pendingFile MIDI as a media link (keeps tuneFiles attachment separate).
 */
export async function attachMidiMediaLinkFromPendingFile(tune, pendingFile, options) {
  if (!tune || !tune.id || !pendingFile || !pendingFile.blob) {
    return tune
  }
  const file = pendingFileToFile(pendingFile)
  if (!file || !isMidiImportFile(file)) {
    return tune
  }
  const opts = options || {}
  try {
    const attached = await createAttachedMidiLink({
      tune: tune,
      file: file,
      title: pendingFile.name || file.name || 'Attached MIDI',
      token: opts.token,
      driveApi: opts.driveApi,
      uploadToDrive: opts.uploadToDrive === true,
      linkIndex: 0,
    })
    const links = Array.isArray(tune.links) ? tune.links.slice() : []
    if (attached && attached.link) {
      links.unshift(attached.link)
    }
    return Object.assign({}, tune, { links: links })
  } catch (e) {
    return tune
  }
}
