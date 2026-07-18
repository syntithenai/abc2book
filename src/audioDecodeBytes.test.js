jest.mock('audio-decode', function () {
  return jest.fn()
})

import decode from 'audio-decode'
import { decodeAudioBytes } from './audioDecodeBytes'

describe('decodeAudioBytes', function () {
  const originalAudioContext = window.AudioContext

  beforeEach(function () {
    decode.mockResolvedValue({ duration: 5, sampleRate: 44100, via: 'audio-decode' })
  })

  afterEach(function () {
    window.AudioContext = originalAudioContext
  })

  test('falls back to audio-decode when AudioContext is unavailable', async function () {
    delete window.AudioContext
    const bytes = new ArrayBuffer(8)
    const result = await decodeAudioBytes(bytes)
    expect(decode).toHaveBeenCalledWith(bytes)
    expect(result.via).toBe('audio-decode')
  })

  test('uses provided context decodeAudioData with a copied buffer', async function () {
    const decoded = { duration: 7, sampleRate: 48000, via: 'native' }
    const ctx = {
      decodeAudioData: jest.fn(function () {
        return Promise.resolve(decoded)
      }),
      state: 'running',
      close: jest.fn(),
    }
    const bytes = new ArrayBuffer(8)
    const result = await decodeAudioBytes(bytes, ctx)
    expect(result).toBe(decoded)
    expect(decode).not.toHaveBeenCalled()
    // A copy must be passed since decodeAudioData detaches its input.
    const passed = ctx.decodeAudioData.mock.calls[0][0]
    expect(passed).not.toBe(bytes)
    expect(passed.byteLength).toBe(8)
    // Provided contexts must not be closed.
    expect(ctx.close).not.toHaveBeenCalled()
  })

  test('creates and closes a temporary context when none is provided', async function () {
    const decoded = { duration: 3, via: 'native' }
    const close = jest.fn(function () { return Promise.resolve() })
    const decodeAudioData = jest.fn(function () { return Promise.resolve(decoded) })
    window.AudioContext = jest.fn(function () {
      this.decodeAudioData = decodeAudioData
      this.state = 'running'
      this.close = close
    })
    const result = await decodeAudioBytes(new ArrayBuffer(4))
    expect(result).toBe(decoded)
    expect(window.AudioContext).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalled()
    expect(decode).not.toHaveBeenCalled()
  })

  test('falls back to audio-decode when native decode fails', async function () {
    const ctx = {
      decodeAudioData: jest.fn(function () {
        return Promise.reject(new Error('unsupported format'))
      }),
      state: 'running',
      close: jest.fn(),
    }
    const bytes = new ArrayBuffer(8)
    const result = await decodeAudioBytes(bytes, ctx)
    expect(ctx.decodeAudioData).toHaveBeenCalled()
    expect(decode).toHaveBeenCalledWith(bytes)
    expect(result.via).toBe('audio-decode')
  })
})
