import axios from 'axios'
import {
  musicBrainzGet,
  resetMusicBrainzRequestStateForTests,
  toFriendlyMusicBrainzError,
} from './musicBrainzRequest'

jest.mock('axios')

describe('musicBrainzRequest', function() {
  beforeEach(function() {
    axios.get.mockReset()
    resetMusicBrainzRequestStateForTests()
  })

  test('retries on 503 and eventually succeeds', async function() {
    axios.get
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce({ data: { ok: true } })

    const response = await musicBrainzGet('/artist', {
      params: { query: 'Altan', fmt: 'json' },
    })
    expect(response.data.ok).toBe(true)
    expect(axios.get).toHaveBeenCalledTimes(2)
  })

  test('throws friendly error after repeated overload responses', async function() {
    axios.get.mockRejectedValue({ response: { status: 503 } })

    await expect(musicBrainzGet('/release/1', {
      params: { inc: 'recordings', fmt: 'json' },
    })).rejects.toMatchObject({
      code: 'MUSICBRAINZ_BUSY',
      message: 'MusicBrainz is busy — wait a moment and try again.',
    })
    expect(axios.get.mock.calls.length).toBeGreaterThan(1)
  })

  test('toFriendlyMusicBrainzError never surfaces raw axios status strings', function() {
    const raw = new Error('Request failed with status code 500')
    raw.response = { status: 500 }
    const friendly = toFriendlyMusicBrainzError(raw)
    expect(friendly.message).not.toMatch(/Request failed with status code/)
    expect(friendly.message).toContain('500')
    expect(friendly.code).toBe('HTTP_ERROR')
    expect(friendly.cause).toBe(raw)
  })

  test('musicBrainzGet wraps non-retryable HTTP errors', async function() {
    axios.get.mockRejectedValue({
      message: 'Request failed with status code 404',
      response: { status: 404 },
    })

    await expect(musicBrainzGet('/artist/missing', {
      params: { fmt: 'json' },
    })).rejects.toMatchObject({
      code: 'HTTP_ERROR',
      message: expect.stringContaining('404'),
    })
  })
})
