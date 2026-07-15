import { getActiveProviderHeaders, loadProviderSettings } from './providerSettings'

/**
 * @jest-environment jsdom
 */

describe('providerSettings', function() {
  beforeEach(function() {
    localStorage.clear()
  })

  test('round-trips settings and active headers', function() {
    const settings = {
      llm: [{
        id: '1',
        provider: 'groq',
        apiUrl: 'https://api.groq.com/openai/v1',
        apiKey: 'gsk_test',
        model: 'llama',
        active: true,
        capability: 'llm',
      }],
      whisper: [],
      ocr: [],
    }
    // eslint-disable-next-line global-require
    const { saveProviderSettings, getActiveProviderHeaders: headersFn } = require('./providerSettings')
    saveProviderSettings(settings)
    const headers = headersFn()
    expect(headers['X-Tunebook-Provider-llm']).toContain('gsk_test')
    expect(headers['X-Tunebook-Provider-whisper']).toBeUndefined()
  })

  test('local provider header omits secrets', function() {
    const headers = getActiveProviderHeaders({
      llm: [{ id: '1', provider: 'local', apiUrl: '', apiKey: '', model: '', active: true }],
      whisper: [],
      ocr: [],
    })
    const parsed = JSON.parse(headers['X-Tunebook-Provider-llm'])
    expect(parsed.provider).toBe('local')
    expect(parsed.apiKey).toBeUndefined()
  })

  test('load defaults when empty', function() {
    const loaded = loadProviderSettings()
    expect(loaded.llm).toEqual([])
    expect(loaded.whisper).toEqual([])
  })
})
