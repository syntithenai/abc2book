'use strict'

const PLAYBACK_E2E_TUNE_IDS = {
  midi: 'e2e00000000000000000010',
  mp3: 'e2e00000000000000000011',
  youtube: 'e2e00000000000000000012',
  archive: 'e2e00000000000000000013',
  processed: 'e2e00000000000000000014',
  midifile: 'e2e00000000000000000015',
}

function playbackRouteUrl(base, tuneId, mode, linkIndex) {
  const root = String(base || 'http://localhost:3000').replace(/\/$/, '')
  if (mode === 'midi') {
    return root + '/#/tunes/' + encodeURIComponent(tuneId) + '/playMidi'
  }
  return root + '/#/tunes/' + encodeURIComponent(tuneId) + '/playMedia/' + String(linkIndex != null ? linkIndex : 0)
}

module.exports = {
  PLAYBACK_E2E_TUNE_IDS: PLAYBACK_E2E_TUNE_IDS,
  playbackRouteUrl: playbackRouteUrl,
}
