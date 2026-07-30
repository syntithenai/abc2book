import { synthesizeSpeech } from './ttsClient'
import * as mediaProxyClient from './mediaProxyClient'
import * as mediaResolverHealthStore from './mediaResolverHealthStore'

jest.mock('./mediaProxyClient', function() {
  return {
    fetchViaMediaProxy: jest.fn(),
  }
})

jest.mock('./mediaResolverHealthStore', function() {
  return {
    getActiveResolverAccessToken: jest.fn(function() { return 'token-abc' }),
  }
})

describe('ttsClient', function() {
  beforeEach(function() {
    jest.clearAllMocks()
  })

  test('synthesizeSpeech posts JSON to /tts/speech', async function() {
    const blob = new Blob(['wav'], { type: 'audio/wav' })
    mediaProxyClient.fetchViaMediaProxy.mockResolvedValue({
      ok: true,
      blob: async function() { return blob },
    })

    const result = await synthesizeSpeech('Blue Moon', 'token-abc')

    expect(mediaProxyClient.fetchViaMediaProxy).toHaveBeenCalledWith(
      '/tts/speech',
      'token-abc',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ input: 'Blue Moon' }),
      })
    )
    expect(result).toBe(blob)
  })

  test('synthesizeSpeech rejects empty text', async function() {
    await expect(synthesizeSpeech('')).rejects.toThrow('No speech text')
    expect(mediaProxyClient.fetchViaMediaProxy).not.toHaveBeenCalled()
  })

  test('synthesizeSpeech surfaces resolver errors', async function() {
    mediaProxyClient.fetchViaMediaProxy.mockResolvedValue({
      ok: false,
      json: async function() { return { error: 'TTS unavailable' } },
    })

    await expect(synthesizeSpeech('Test')).rejects.toThrow('TTS unavailable')
  })
})
