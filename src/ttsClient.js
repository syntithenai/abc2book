import { fetchViaMediaProxy } from './mediaProxyClient'
import { getActiveResolverAccessToken } from './mediaResolverHealthStore'

export async function synthesizeSpeech(text, accessToken) {
  const input = typeof text === 'string' ? text.trim() : ''
  if (!input) {
    throw new Error('No speech text')
  }

  const token = accessToken || getActiveResolverAccessToken()
  const response = await fetchViaMediaProxy('/tts/speech', token, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'audio/wav',
    },
    body: JSON.stringify({ input: input }),
  })

  if (!response.ok) {
    let message = 'Speech synthesis failed'
    try {
      const body = await response.json()
      if (body && body.error) message = body.error
    } catch (e) {
      // ignore
    }
    throw new Error(message)
  }

  return response.blob()
}
