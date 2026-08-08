import axios from 'axios'
import {
  musicBrainzGet,
  resetMusicBrainzRequestStateForTests,
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
})
