/** Provider capability presets for Settings → Providers wizard. */

export const PROVIDER_CAPABILITIES = ['llm', 'whisper', 'ocr']

export const PROVIDER_PRESETS = [
  {
    id: 'groq',
    label: 'Groq',
    apiUrl: 'https://api.groq.com/openai/v1',
    capabilities: ['llm', 'whisper'],
    models: {
      llm: 'llama-3.1-8b-instant',
      whisper: 'whisper-large-v3',
    },
  },
  {
    id: 'openai',
    label: 'OpenAI',
    apiUrl: 'https://api.openai.com/v1',
    capabilities: ['llm', 'whisper', 'ocr'],
    models: {
      llm: 'gpt-4o-mini',
      whisper: 'whisper-1',
      ocr: 'gpt-4o-mini',
    },
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    apiUrl: 'https://api.anthropic.com/v1',
    capabilities: ['llm'],
    models: {
      llm: 'claude-3-5-haiku-latest',
    },
  },
  {
    id: 'together',
    label: 'Together AI',
    apiUrl: 'https://api.together.xyz/v1',
    capabilities: ['llm', 'whisper'],
    models: {
      llm: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
      whisper: 'openai/whisper-large-v3',
    },
  },
  {
    id: 'replicate',
    label: 'Replicate',
    apiUrl: 'https://api.replicate.com/v1',
    capabilities: ['llm', 'whisper', 'ocr'],
    models: {
      llm: '',
      whisper: '',
      ocr: '',
    },
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    apiUrl: '',
    capabilities: ['llm', 'whisper', 'ocr'],
    models: {
      llm: '',
      whisper: '',
      ocr: '',
    },
  },
  {
    id: 'local',
    label: 'Local (resolver models)',
    apiUrl: '',
    capabilities: ['llm', 'whisper', 'ocr'],
    models: {
      llm: '',
      whisper: '',
      ocr: '',
    },
  },
]

const STORAGE_KEY = 'bookstorage_provider_settings_v1'

function newId() {
  return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
}

export function emptyProviderSet(capability) {
  return {
    id: newId(),
    provider: 'custom',
    apiUrl: '',
    apiKey: '',
    model: '',
    label: '',
    active: false,
    capability: capability,
  }
}

export function buildWizardProviderSet(capability, presetId, apiKey) {
  const preset = PROVIDER_PRESETS.find(function(p) { return p.id === presetId }) || PROVIDER_PRESETS.find(function(p) { return p.id === 'custom' })
  const set = emptyProviderSet(capability)
  set.provider = preset.id
  set.apiUrl = preset.apiUrl || ''
  set.apiKey = apiKey || ''
  set.model = (preset.models && preset.models[capability]) || ''
  set.label = preset.label
  set.active = true
  return set
}

export function defaultProviderSettings() {
  return {
    llm: [],
    whisper: [],
    ocr: [],
  }
}

export function loadProviderSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultProviderSettings()
    const parsed = JSON.parse(raw)
    const out = defaultProviderSettings()
    PROVIDER_CAPABILITIES.forEach(function(cap) {
      if (Array.isArray(parsed[cap])) {
        out[cap] = parsed[cap].map(function(item) {
          return Object.assign(emptyProviderSet(cap), item, { capability: cap })
        })
      }
    })
    return out
  } catch (e) {
    return defaultProviderSettings()
  }
}

export function saveProviderSettings(settings) {
  const next = settings || defaultProviderSettings()
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch (e) {
    // ignore quota
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('providerSettingsChanged'))
  }
  return next
}

export function getActiveProvider(settings, capability) {
  const list = (settings && settings[capability]) || []
  for (let i = 0; i < list.length; i++) {
    if (list[i] && list[i].active) return list[i]
  }
  return null
}

/** Headers to send with media proxy requests for the active provider overlays. */
export function getActiveProviderHeaders(settings) {
  const headers = {}
  const src = settings || loadProviderSettings()
  PROVIDER_CAPABILITIES.forEach(function(cap) {
    const active = getActiveProvider(src, cap)
    if (!active) return
    if (active.provider === 'local') {
      headers['X-Tunebook-Provider-' + cap] = JSON.stringify({
        provider: 'local',
        model: active.model || '',
      })
      return
    }
    if (!active.apiUrl && !active.apiKey) return
    headers['X-Tunebook-Provider-' + cap] = JSON.stringify({
      provider: active.provider || 'custom',
      apiUrl: active.apiUrl || '',
      apiKey: active.apiKey || '',
      model: active.model || '',
    })
  })
  return headers
}

export function describeProviderSource(healthProviders, capability, activeUserSet) {
  if (activeUserSet && activeUserSet.provider === 'local') {
    return { label: 'Using local models', kind: 'local' }
  }
  if (activeUserSet && (activeUserSet.apiKey || activeUserSet.apiUrl)) {
    return { label: 'Using your key', kind: 'user' }
  }
  const caps = healthProviders && healthProviders.capabilities
  const cap = caps && caps[capability]
  const active = cap && cap.active
  if (active && active.source === 'host') {
    return { label: 'Using host credentials', kind: 'host' }
  }
  if (active && active.source === 'local') {
    return { label: 'Using local models', kind: 'local' }
  }
  if (cap && cap.hostEmbeddedUsable) {
    return { label: 'Using host credentials', kind: 'host' }
  }
  if (cap && cap.localAvailable) {
    return { label: 'Using local models', kind: 'local' }
  }
  return { label: 'No provider configured', kind: 'none' }
}
