export const ADAPTIVE_RANGE_STEPS = [50, 25, 12, 6, 3]

export function rmsFromTimeDomain(timeDomain) {
  if (!timeDomain || !timeDomain.length) return 0
  let sum = 0
  for (let i = 0; i < timeDomain.length; i += 1) {
    const sample = (timeDomain[i] - 128) / 128
    sum += sample * sample
  }
  const rms = Math.sqrt(sum / timeDomain.length)
  return Math.min(1, rms * 2.5)
}

export function targetAdaptiveRange(absCents) {
  const abs = Math.abs(absCents)
  if (!Number.isFinite(abs)) return ADAPTIVE_RANGE_STEPS[0]
  if (abs > 25) return 50
  if (abs > 12) return 25
  if (abs > 6) return 12
  if (abs > 2) return 6
  return 3
}

export function adaptiveDisplayRange(absCents, currentRange, smoothing) {
  const blend = smoothing == null ? 0.15 : smoothing
  const current = Number.isFinite(currentRange) ? currentRange : ADAPTIVE_RANGE_STEPS[0]
  const desired = targetAdaptiveRange(absCents)
  if (Math.abs(desired - current) < 0.5) return desired
  return current + (desired - current) * blend
}

/**
 * Exponential smoothing for the VU needle. Readout should use raw cents;
 * this only eases visual motion. Converges faster when far from target.
 */
export function smoothNeedleCents(current, target, deltaMs) {
  if (target == null || !Number.isFinite(target)) {
    if (current == null || !Number.isFinite(current)) return null
    return current
  }
  if (current == null || !Number.isFinite(current)) return target
  const dt = Math.max(1, deltaMs || 16)
  const error = Math.abs(target - current)
  const tau = error > 20 ? 120 : error > 8 ? 180 : error > 3 ? 280 : 380
  const alpha = 1 - Math.exp(-dt / tau)
  return current + (target - current) * alpha
}

export function smoothNeedleRange(current, target, deltaMs) {
  if (target == null || !Number.isFinite(target)) return current
  if (current == null || !Number.isFinite(current)) return target
  const dt = Math.max(1, deltaMs || 16)
  const tau = 420
  const alpha = 1 - Math.exp(-dt / tau)
  return current + (target - current) * alpha
}

export function centsToNeedleAngle(cents, halfRange, maxDeg) {
  const range = halfRange > 0 ? halfRange : 50
  const max = maxDeg == null ? 80 : maxDeg
  const clamped = Math.max(-range, Math.min(range, cents || 0))
  return (clamped / range) * max
}

function mixColor(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
  ]
}

function rgbToCss(rgb) {
  return 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')'
}

export function volumeSegmentColors(count) {
  const stops = [
    [236, 112, 132],
    [243, 156, 118],
    [196, 164, 132],
    [120, 148, 104],
    [76, 175, 80]
  ]
  const colors = []
  for (let i = 0; i < count; i += 1) {
    const pos = count === 1 ? 0 : i / (count - 1)
    const scaled = pos * (stops.length - 1)
    const idx = Math.min(stops.length - 2, Math.floor(scaled))
    const t = scaled - idx
    colors.push(rgbToCss(mixColor(stops[idx], stops[idx + 1], t)))
  }
  return colors
}

export function formatCents(cents) {
  if (cents == null || !Number.isFinite(cents)) return '— ¢'
  const rounded = Math.round(cents)
  if (rounded > 0) return '+' + rounded + ' ¢'
  return rounded + ' ¢'
}

export function formatFrequency(freq) {
  if (freq == null || !Number.isFinite(freq)) return '— Hz'
  return freq.toFixed(1) + ' Hz'
}
