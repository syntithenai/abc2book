let sharedContext = null

export function playInTuneChime(audioContext) {
  try {
    const ctx = audioContext || sharedContext || new (window.AudioContext || window.webkitAudioContext)()
    sharedContext = ctx
    if (ctx.state === 'suspended') ctx.resume()

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.value = 0.0001
    osc.connect(gain)
    gain.connect(ctx.destination)

    const t = ctx.currentTime
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
    osc.start(t)
    osc.stop(t + 0.2)
  } catch (e) {
    // ignore if audio unavailable
  }
}
