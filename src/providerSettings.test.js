/**
 * @jest-environment jsdom
 */

import {
  applyProviderEdits,
  buildProviderServiceStatusRows,
  buildWizardProviderSet,
  describeProviderSource,
  getActiveProviderHeaders,
  getModelSuggestions,
  getPresetById,
  getProviderAccountUrl,
  getSelectablePresets,
  isCapabilityAvailable,
  isExpensiveModel,
  listGroqCapsMissingKey,
  getModelPageUrl,
  getProviderModelCatalogUrl,
  loadProviderSettings,
  saveProviderSettings,
} from './providerSettings'

describe('providerSettings', function() {
  beforeEach(function() {
    localStorage.clear()
  })

  test('round-trips settings and active headers including stems', function() {
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
      stems: [{
        id: '2',
        provider: 'fal',
        apiUrl: 'https://fal.run',
        apiKey: 'fal_test',
        model: 'htdemucs',
        active: true,
        capability: 'stems',
      }],
    }
    saveProviderSettings(settings)
    const headers = getActiveProviderHeaders()
    expect(headers['X-Tunebook-Provider-llm']).toContain('gsk_test')
    expect(headers['X-Tunebook-Provider-stems']).toContain('fal_test')
    expect(headers['X-Tunebook-Provider-whisper']).toBeUndefined()
  })

  test('local provider header omits secrets', function() {
    const headers = getActiveProviderHeaders({
      llm: [{ id: '1', provider: 'local', apiUrl: '', apiKey: '', model: '', active: true }],
      whisper: [],
      ocr: [],
      stems: [],
    })
    const parsed = JSON.parse(headers['X-Tunebook-Provider-llm'])
    expect(parsed.provider).toBe('local')
    expect(parsed.apiKey).toBeUndefined()
  })

  test('load defaults when empty include stems', function() {
    const loaded = loadProviderSettings()
    expect(loaded.llm).toEqual([])
    expect(loaded.whisper).toEqual([])
    expect(loaded.stems).toEqual([])
  })

  test('getModelSuggestions returns curated lists including Groq OCR', function() {
    const groqLlm = getModelSuggestions('groq', 'llm')
    expect(groqLlm[0]).toBe('llama-3.1-8b-instant')
    expect(groqLlm).toContain('openai/gpt-oss-120b')
    expect(getPresetById('groq').models.llm).toBe('llama-3.1-8b-instant')
    expect(getModelSuggestions('fal', 'stems')).toEqual(['fal-ai/demucs'])
    expect(getModelSuggestions('fal', 'stems')).not.toContain('htdemucs_6s')
    expect(getModelSuggestions('replicate', 'stems')).toContain('cjwbw/demucs')
    expect(getModelSuggestions('replicate', 'stems')).toContain('ryan5453/demucs')
    expect(getModelPageUrl('fal', 'stems', 'fal-ai/demucs')).toBe('https://fal.ai/models/fal-ai/demucs')
    expect(getModelPageUrl('replicate', 'stems', 'cjwbw/demucs')).toBe('https://replicate.com/cjwbw/demucs')
    expect(getModelPageUrl('replicate', 'stems', 'ryan5453/demucs')).toBe('https://replicate.com/ryan5453/demucs')
    expect(getProviderModelCatalogUrl('replicate', 'stems')).toBe('https://replicate.com/search?query=demucs')
    expect(getProviderModelCatalogUrl('fal', 'stems')).toBe('')
    expect(getModelSuggestions('openai', 'whisper')).toContain('whisper-1')
    const groqOcr = getModelSuggestions('groq', 'ocr')
    expect(groqOcr).toContain('qwen/qwen3.6-27b')
    expect(groqOcr).not.toContain('meta-llama/llama-4-scout-17b-16e-instruct')
    expect(groqOcr).not.toContain('openai/gpt-oss-120b')
    expect(getSelectablePresets('ocr').some(function(p) { return p.id === 'groq' })).toBe(true)
    expect(getSelectablePresets('whisper').some(function(p) { return p.id === 'replicate' })).toBe(false)
    expect(getSelectablePresets('llm').some(function(p) { return p.id === 'local' })).toBe(false)
  })

  test('economy defaults and expensive model flags', function() {
    expect(getPresetById('together').models.llm).toBe('Qwen/Qwen2.5-7B-Instruct-Turbo')
    expect(isExpensiveModel('groq', 'llm', 'llama-3.3-70b-versatile')).toBe(true)
    expect(isExpensiveModel('groq', 'llm', 'llama-3.1-8b-instant')).toBe(false)
    expect(isExpensiveModel('openai', 'llm', 'gpt-4o')).toBe(true)
    expect(isExpensiveModel('groq', 'ocr', 'qwen/qwen3.6-27b')).toBe(true)
  })

  test('loadProviderSettings migrates deprecated Groq Scout OCR model', function() {
    localStorage.setItem('bookstorage_provider_settings_v1', JSON.stringify({
      llm: [],
      whisper: [],
      ocr: [{
        id: '1',
        provider: 'groq',
        apiUrl: 'https://api.groq.com/openai/v1',
        apiKey: 'gsk',
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        active: true,
        capability: 'ocr',
      }],
      stems: [],
    }))
    const loaded = loadProviderSettings()
    expect(loaded.ocr[0].model).toBe('qwen/qwen3.6-27b')
    const stored = JSON.parse(localStorage.getItem('bookstorage_provider_settings_v1'))
    expect(stored.ocr[0].model).toBe('qwen/qwen3.6-27b')
  })

  test('listGroqCapsMissingKey skips caps with active Groq key', function() {
    const settings = {
      llm: [],
      whisper: [{
        id: 'w1',
        provider: 'groq',
        apiKey: 'gsk',
        active: true,
        capability: 'whisper',
      }],
      ocr: [],
      stems: [],
    }
    expect(listGroqCapsMissingKey(settings, 'whisper')).toEqual(['llm', 'ocr'])
    expect(listGroqCapsMissingKey(settings, null)).toEqual(['llm', 'ocr'])
  })

  test('account urls point at key pages', function() {
    expect(getProviderAccountUrl('groq')).toContain('console.groq.com')
    expect(getProviderAccountUrl('openai')).toContain('api-keys')
    expect(getProviderAccountUrl('custom')).toBe('')
  })

  test('buildWizardProviderSet uses model override and suggestions', function() {
    const set = buildWizardProviderSet('stems', 'fal', 'key', 'fal-ai/demucs')
    expect(set.provider).toBe('fal')
    expect(set.model).toBe('fal-ai/demucs')
    expect(set.apiKey).toBe('key')
    const groq = buildWizardProviderSet('llm', 'groq', 'gsk')
    expect(groq.model).toBe('llama-3.1-8b-instant')
  })

  test('applyProviderEdits keeps api key when blank', function() {
    const existing = {
      id: '1',
      provider: 'openai',
      apiUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-keep',
      model: 'gpt-4o-mini',
      label: 'OpenAI',
      active: true,
      capability: 'llm',
    }
    const next = applyProviderEdits(existing, 'llm', {
      provider: 'openai',
      apiUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4o',
      label: 'OpenAI',
    })
    expect(next.apiKey).toBe('sk-keep')
    expect(next.model).toBe('gpt-4o')
  })

  test('describeProviderSource distinguishes BYO vs resolver key vs custom resolver', function() {
    expect(describeProviderSource(null, 'llm', {
      provider: 'groq',
      apiKey: 'x',
      model: 'm',
    }).kind).toBe('user')
    expect(describeProviderSource(null, 'llm', {
      provider: 'groq',
      apiKey: 'x',
      model: 'm',
    }).label).toBe('BYO key')

    expect(describeProviderSource({
      capabilities: {
        llm: { hostEmbeddedUsable: true, active: { source: 'host', model: 'host-model' } },
      },
    }, 'llm', null).kind).toBe('host')
    expect(describeProviderSource({
      capabilities: {
        llm: { hostEmbeddedUsable: true, active: { source: 'host', model: 'host-model' } },
      },
    }, 'llm', null).label).toBe('Resolver provided key')

    expect(describeProviderSource({
      capabilities: {
        whisper: { localAvailable: true, active: { source: 'local' } },
      },
    }, 'whisper', null).kind).toBe('local')
    expect(describeProviderSource({
      capabilities: {
        whisper: { localAvailable: true, active: { source: 'local' } },
      },
    }, 'whisper', null).label).toBe('Custom resolver')
  })

  test('buildProviderServiceStatusRows uses Connected / Not available and Using column', function() {
    const rows = buildProviderServiceStatusRows({
      activeBase: 'http://127.0.0.1:8765',
      heavyMlBase: 'http://127.0.0.1:8765',
      features: { stems: true, practiceAnalysis: true, sheetImageOmr: false, sheetImageOcr: true },
      demucsModel: 'htdemucs',
      providers: { capabilities: {} },
    }, {
      llm: [],
      whisper: [],
      ocr: [],
      stems: [],
    }, { webshareSaved: false, egressRequired: true })

    const byId = {}
    rows.forEach(function(r) { byId[r.id] = r })
    expect(byId.stems.available).toBe(true)
    expect(byId.stems.statusLabel).toBe('Connected')
    expect(byId.stems.statusTone).toBe('ok')
    expect(byId.stems.using).toMatch(/Custom resolver/)
    expect(byId.ocr.available).toBe(true)
    expect(byId.ocr.using).toMatch(/Custom resolver/)
    expect(byId.analysis.statusLabel).toBe('Connected')
    expect(byId.omr.statusLabel).toBe('Not available')
    expect(byId.omr.statusTone).toBe('bad')
    expect(byId.proxy.statusTone).toBe('bad')
    expect(byId.proxy.service).toBe('Media Proxy')
  })

  test('Media Proxy Using shows TuneBook Helper when extension is connected', function() {
    const rows = buildProviderServiceStatusRows({
      activeBase: 'http://localhost:3000',
      features: { youtubeEgressRequired: true },
    }, { llm: [], whisper: [], ocr: [], stems: [] }, {
      webshareSaved: false,
      egressRequired: true,
      helperOk: true,
      helperVersion: '1.2.0',
    })
    const proxy = rows.find(function(r) { return r.id === 'proxy' })
    expect(proxy.service).toBe('Media Proxy')
    expect(proxy.available).toBe(true)
    expect(proxy.statusLabel).toBe('Connected')
    expect(proxy.using).toBe('TuneBook Helper · v1.2.0')
  })

  test('localhost feature flags mark LLM Whisper OCR Connected without BYO keys', function() {
    const rows = buildProviderServiceStatusRows({
      activeBase: 'http://localhost:3000',
      heavyMlBase: 'http://localhost:3000',
      features: {
        llm: true,
        whisper: true,
        sheetImageOcr: true,
        stems: true,
        practiceAnalysis: true,
        sheetImageOmr: true,
        youtubeEgressRequired: false,
      },
      demucsModel: 'htdemucs',
      providers: { capabilities: {} },
    }, {
      llm: [],
      whisper: [],
      ocr: [],
      stems: [],
    }, { webshareSaved: false, egressRequired: false })

    const byId = {}
    rows.forEach(function(r) { byId[r.id] = r })
    ;['llm', 'whisper', 'ocr', 'stems'].forEach(function(id) {
      expect(byId[id].available).toBe(true)
      expect(byId[id].statusLabel).toBe('Connected')
      expect(byId[id].using).toMatch(/Custom resolver/)
      expect(byId[id].using).toMatch(/localhost:3000/)
    })
  })

  test('isCapabilityAvailable treats BYO LLM as available without features.llm', function() {
    expect(isCapabilityAvailable('llm', { llm: false }, {
      llm: [{
        id: '1',
        provider: 'groq',
        apiUrl: 'https://api.groq.com/openai/v1',
        apiKey: 'gsk',
        model: 'llama',
        active: true,
        capability: 'llm',
      }],
      whisper: [],
      ocr: [],
      stems: [],
    })).toBe(true)
    expect(isCapabilityAvailable('llm', { llm: false }, {
      llm: [],
      whisper: [],
      ocr: [],
      stems: [],
    })).toBe(false)
    expect(isCapabilityAvailable('llm', { llm: true }, {
      llm: [],
      whisper: [],
      ocr: [],
      stems: [],
    })).toBe(true)
  })
})
