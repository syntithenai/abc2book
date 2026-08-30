/**
 * Headless MIDI import using Midi Import Wizard defaults (no UI).
 * Analyze → pick melody track(s) → light cleanup → importMidiToAbc.
 */
import { analyzeMidiBytes } from './midiAnalyzeClient'
import { importMidiToAbc } from './midiToAbcClient'
import { resolveImportAbcFromResponse } from './midiImportAbcResolve'
import { finalizeMidiImportAbc } from './midiImportFinalize'
import {
  buildImportOptionsFromDraft,
  createMidiImportDraft,
  initDraftFromProfile,
  pitchedTracksWithNotes,
} from './midiImportWizardState'

function pickMelodyOnlyTrackIds(profile) {
  const pitched = pitchedTracksWithNotes(profile && profile.tracks)
  if (!pitched.length) return []
  const recommended = Array.isArray(profile.recommended_track_ids)
    ? profile.recommended_track_ids.filter(function(id) {
      return pitched.some(function(t) { return t.index === id && !t.is_drum })
    })
    : []
  if (recommended.length === 1) return recommended.slice()
  // Prefer melody role; many oldtime MIDIs label the only track as harmony/piano.
  const melody = pitched.find(function(t) { return t.role_hint === 'melody' })
  if (melody) return [melody.index]
  const ranked = pitched.slice().sort(function(a, b) {
    return (b.note_count || 0) - (a.note_count || 0)
  })
  return [ranked[0].index]
}

function abcFromImportResult(result, fileName, trackIds) {
  if (!result) return ''
  let abc = String(result.abc || '').trim()
  if (!abc && result.musicXml) {
    abc = String(resolveImportAbcFromResponse(result, fileName, {
      trackIds: trackIds || [],
    }) || '').trim()
  }
  if (!abc && result.musicXml) {
    // Last chance: resolve again preferring MusicXML even if strategy was odd.
    abc = String(resolveImportAbcFromResponse(
      Object.assign({}, result, { strategy: 'musicxml', abc: '' }),
      fileName,
      { trackIds: trackIds || [] }
    ) || '').trim()
  }
  return abc
}

/**
 * @param {Uint8Array|ArrayBuffer} midiBytes
 * @param {string} fileName
 * @param {string} accessToken
 * @param {{ melodyOnly?: boolean, abcjsParser?: object, strategy?: string }} [options]
 * @returns {Promise<{ abc: string, result: object, draft: object, profile: object }>}
 */
export async function importMidiWithWizardDefaults(midiBytes, fileName, accessToken, options) {
  const opts = options || {}
  const profile = await analyzeMidiBytes(midiBytes, fileName, accessToken)
  let draft = createMidiImportDraft({
    fileName: fileName || 'import.mid',
    midiBytes: midiBytes,
    // Batch/enrich: note_events returns server-side ABC (auto often MusicXML-only).
    strategy: opts.strategy || 'note_events',
  })
  draft = initDraftFromProfile(draft, profile)

  // Batch/enrich: most oldtime MIDIs are a single melody line — don't pull in bass/harmony.
  if (opts.melodyOnly !== false) {
    const ids = pickMelodyOnlyTrackIds(profile)
    if (ids.length) {
      draft.selectedTrackIds = ids
      draft.mode = 'melody'
    }
  }

  // Ensure at least one pitched track is selected when the profile has notes.
  if (!(draft.selectedTrackIds && draft.selectedTrackIds.length)) {
    const ids = pickMelodyOnlyTrackIds(profile)
    if (ids.length) {
      draft.selectedTrackIds = ids
      draft.mode = 'melody'
    }
  }

  const importOpts = buildImportOptionsFromDraft(draft)
  if (!importOpts.maxVoices) {
    importOpts.maxVoices = Math.max(1, (importOpts.trackIds || []).length || 1)
  }

  let result = await importMidiToAbc(midiBytes, fileName, accessToken, importOpts)
  let abc = abcFromImportResult(result, fileName, draft.selectedTrackIds)

  // If note_events failed, try auto (MusicXML path) with same wizard options.
  if (!abc && importOpts.strategy === 'note_events') {
    result = await importMidiToAbc(
      midiBytes,
      fileName,
      accessToken,
      Object.assign({}, importOpts, { strategy: 'auto' })
    )
    abc = abcFromImportResult(result, fileName, draft.selectedTrackIds)
  }

  // Bare note_events without cleanup/track filters — last resort.
  if (!abc) {
    result = await importMidiToAbc(midiBytes, fileName, accessToken, {
      strategy: 'note_events',
      mode: 'melody',
    })
    abc = abcFromImportResult(result, fileName, draft.selectedTrackIds)
  }

  abc = finalizeMidiImportAbc(abc, result, opts.abcjsParser, {
    includeChords: draft.includeChords === true,
    trackIds: draft.selectedTrackIds,
  })

  return {
    abc: String(abc || '').trim(),
    result: result,
    draft: draft,
    profile: profile,
  }
}
