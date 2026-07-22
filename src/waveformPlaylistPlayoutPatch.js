import Playout from 'waveform-playlist/lib/Playout'

let patched = false

/**
 * Guard waveform-playlist teardown: stop/restart can double-fire source.onended.
 */
export default function ensureWaveformPlayoutDisconnectGuard() {
  if (patched) return
  patched = true

  const proto = Playout.prototype
  const original = proto.setUpSource
  if (typeof original !== 'function') return

  proto.setUpSource = function patchedSetUpSource() {
    const result = original.apply(this, arguments)
    const source = this.source
    if (!source || typeof source.onended !== 'function') return result

    const prior = source.onended
    source.onended = function guardedOnEnded(event) {
      try {
        if (typeof prior === 'function') prior.call(source, event)
      } catch (e) {
        // waveform-playlist can race stop/restart and double-fire onended
      }
    }
    return result
  }
}
