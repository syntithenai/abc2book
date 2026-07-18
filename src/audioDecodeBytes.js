/**
 * Decode compressed audio bytes to an AudioBuffer.
 *
 * Prefers the browser's native decodeAudioData (native-speed, supports
 * m4a/AAC and webm/opus which the JS audio-decode package handles poorly),
 * falling back to audio-decode when native decoding is unavailable or fails.
 */

function getAudioContextClass() {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

async function decodeWithFallback(arrayBuffer) {
  const decodeModule = await import('audio-decode');
  const decode = decodeModule.default || decodeModule;
  return decode(arrayBuffer);
}

async function nativeDecode(arrayBuffer, audioContext) {
  let ctx = audioContext;
  let ownsContext = false;
  if (!ctx) {
    const AudioContextClass = getAudioContextClass();
    if (!AudioContextClass) {
      throw new Error('AudioContext is not available');
    }
    ctx = new AudioContextClass();
    ownsContext = true;
  }
  try {
    // decodeAudioData detaches its input buffer, so pass a copy to keep the
    // caller's bytes usable (e.g. for caching).
    return await ctx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    if (ownsContext && ctx.state !== 'closed' && typeof ctx.close === 'function') {
      ctx.close().catch(function() {});
    }
  }
}

export async function decodeAudioBytes(arrayBuffer, audioContext) {
  const AudioContextClass = getAudioContextClass();
  if (audioContext || AudioContextClass) {
    try {
      return await nativeDecode(arrayBuffer, audioContext);
    } catch (e) {
      // Fall through to the JS decoder (unsupported format, jsdom, etc.).
    }
  }
  return decodeWithFallback(arrayBuffer);
}
