import MidiPlayer from 'midi-player-js'

const MIDI_EXTENSIONS = ['.mid', '.midi']
const MIDI_MIME_TYPES = ['audio/midi', 'audio/mid', 'audio/x-midi']

export function isMidiFileName(name) {
  const lower = String(name || '').toLowerCase()
  return MIDI_EXTENSIONS.some(function(ext) { return lower.endsWith(ext) })
}

export function isMidiMimeType(type) {
  return MIDI_MIME_TYPES.includes(String(type || '').toLowerCase())
}

export function isMidiImportFile(file) {
  if (!file) return false
  if (isMidiMimeType(file.type)) return true
  return isMidiFileName(file.name)
}

export function isHttpMidiUrl(url) {
  const trimmed = String(url || '').trim()
  if (!/^https?:\/\//i.test(trimmed)) return false
  try {
    const pathname = new URL(trimmed).pathname.toLowerCase()
    return pathname.endsWith('.mid') || pathname.endsWith('.midi')
  } catch (e) {
    return isMidiFileName(trimmed.split('?')[0])
  }
}

export function isMidiOwnedMediaLink(link) {
  return !!(link && link.mediaKind === 'midi')
}

/**
 * Probe MIDI file duration in seconds (best effort).
 * @param {Blob|ArrayBuffer} input
 * @returns {Promise<number|null>}
 */
export function probeMidiDuration(input) {
  return new Promise(function(resolve) {
    let settled = false
    function finish(value) {
      if (settled) return
      settled = true
      resolve(value)
    }

    const player = new MidiPlayer.Player(function() {})
    player.on('fileLoaded', function() {
      const duration = typeof player.getSongTime === 'function' ? player.getSongTime() : null
      finish(duration && duration > 0 ? duration : null)
    })
    player.on('error', function() {
      finish(null)
    })

    try {
      if (input instanceof ArrayBuffer) {
        player.loadArrayBuffer(input)
      } else if (input && typeof input.arrayBuffer === 'function') {
        input.arrayBuffer().then(function(buffer) {
          player.loadArrayBuffer(buffer)
        }).catch(function() {
          finish(null)
        })
      } else {
        finish(null)
      }
    } catch (e) {
      finish(null)
    }

    setTimeout(function() { finish(null) }, 5000)
  })
}
