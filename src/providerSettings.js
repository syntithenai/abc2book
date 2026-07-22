/** Provider capability presets for Settings → Providers wizard. */

export const PROVIDER_CAPABILITIES = ['llm', 'whisper', 'ocr', 'stems']

/**
 * Named cloud providers users can configure with BYO keys.
 * Resolver (custom URL / localhost / peppertrees) is the fallback when no key is set —
 * not offered as a selectable "Local" preset.
 */
/** Normalize a suggestion entry to { id, tier }. Strings default to economy. */
export function normalizeModelSuggestion(entry) {
  if (!entry) return null
  if (typeof entry === 'string') {
    return { id: entry, tier: 'economy' }
  }
  if (entry.id) {
    return {
      id: String(entry.id),
      tier: entry.tier === 'expensive' || entry.tier === 'standard' ? entry.tier : 'economy',
    }
  }
  return null
}

export const PROVIDER_PRESETS = [
  {
    id: 'groq',
    label: 'Groq',
    apiUrl: 'https://api.groq.com/openai/v1',
    accountUrl: 'https://console.groq.com/keys',
    // LLM: POST …/chat/completions
    // Whisper: POST …/audio/transcriptions (+ /audio/translations)
    // OCR: POST …/chat/completions with image_url (vision models only)
    capabilities: ['llm', 'whisper', 'ocr'],
    models: {
      llm: 'llama-3.1-8b-instant',
      whisper: 'whisper-large-v3',
      // Vision docs list only Scout + Qwen3.6-27B (gpt-oss-* are text-only).
      // Scout is deprecated 2026-07-17; prefer Qwen3.6 for OCR.
      ocr: 'qwen/qwen3.6-27b',
    },
    modelSuggestions: {
      llm: [
        { id: 'llama-3.1-8b-instant', tier: 'economy' },
        { id: 'openai/gpt-oss-20b', tier: 'economy' },
        { id: 'openai/gpt-oss-safeguard-20b', tier: 'economy' },
        { id: 'openai/gpt-oss-120b', tier: 'standard' },
        { id: 'qwen/qwen3-32b', tier: 'standard' },
        { id: 'meta-llama/llama-4-scout-17b-16e-instruct', tier: 'standard' },
        { id: 'llama-3.3-70b-versatile', tier: 'expensive' },
        { id: 'qwen/qwen3.6-27b', tier: 'expensive' },
      ],
      whisper: ['whisper-large-v3', 'whisper-large-v3-turbo'],
      ocr: [
        { id: 'qwen/qwen3.6-27b', tier: 'expensive' },
      ],
    },
  },
  {
    id: 'openai',
    label: 'OpenAI',
    apiUrl: 'https://api.openai.com/v1',
    accountUrl: 'https://platform.openai.com/api-keys',
    // LLM/OCR: POST …/chat/completions (vision on gpt-4o / gpt-4.1 family)
    // Whisper: POST …/audio/transcriptions
    capabilities: ['llm', 'whisper', 'ocr'],
    models: {
      llm: 'gpt-4o-mini',
      whisper: 'whisper-1',
      ocr: 'gpt-4o-mini',
    },
    modelSuggestions: {
      llm: [
        { id: 'gpt-4o-mini', tier: 'economy' },
        { id: 'gpt-4.1-mini', tier: 'economy' },
        { id: 'o4-mini', tier: 'standard' },
        { id: 'gpt-4o', tier: 'expensive' },
        { id: 'gpt-4.1', tier: 'expensive' },
      ],
      // whisper-1 supports verbose_json (our default). gpt-4o-* transcribe use json.
      whisper: ['whisper-1', 'gpt-4o-mini-transcribe', 'gpt-4o-transcribe'],
      ocr: [
        { id: 'gpt-4o-mini', tier: 'economy' },
        { id: 'gpt-4.1-mini', tier: 'economy' },
        { id: 'gpt-4o', tier: 'expensive' },
        { id: 'gpt-4.1', tier: 'expensive' },
      ],
    },
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    apiUrl: 'https://api.anthropic.com/v1',
    accountUrl: 'https://console.anthropic.com/settings/keys',
    // Claude Messages API supports vision, but Tunebook’s cloud OCR/LLM adapters
    // are OpenAI-compatible (/chat/completions). No Whisper endpoint.
    // Keep LLM listed for custom OpenAI-compatible Anthropic proxies only.
    capabilities: ['llm'],
    models: {
      llm: 'claude-haiku-4-5-20251001',
    },
    modelSuggestions: {
      llm: [
        { id: 'claude-haiku-4-5-20251001', tier: 'economy' },
        { id: 'claude-3-5-haiku-latest', tier: 'economy' },
        { id: 'claude-sonnet-4-20250514', tier: 'expensive' },
        { id: 'claude-sonnet-4-5-20250929', tier: 'expensive' },
        { id: 'claude-3-5-sonnet-latest', tier: 'expensive' },
      ],
    },
  },
  {
    id: 'together',
    label: 'Together AI',
    apiUrl: 'https://api.together.ai/v1',
    accountUrl: 'https://api.together.ai/settings/api-keys',
    // LLM: POST …/chat/completions
    // Whisper: POST …/audio/transcriptions
    // OCR: POST …/chat/completions with image_url (vision catalog)
    capabilities: ['llm', 'whisper', 'ocr'],
    models: {
      llm: 'Qwen/Qwen2.5-7B-Instruct-Turbo',
      whisper: 'openai/whisper-large-v3',
      ocr: 'Qwen/Qwen3.5-9B',
    },
    modelSuggestions: {
      llm: [
        { id: 'Qwen/Qwen2.5-7B-Instruct-Turbo', tier: 'economy' },
        { id: 'openai/gpt-oss-20b', tier: 'economy' },
        { id: 'openai/gpt-oss-120b', tier: 'standard' },
        { id: 'google/gemma-4-31B-it', tier: 'standard' },
        { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', tier: 'expensive' },
      ],
      whisper: [
        'openai/whisper-large-v3',
        'nvidia/parakeet-tdt-0.6b-v3',
      ],
      ocr: [
        { id: 'Qwen/Qwen3.5-9B', tier: 'economy' },
        { id: 'google/gemma-4-31B-it', tier: 'standard' },
        { id: 'MiniMaxAI/MiniMax-M3', tier: 'expensive' },
        { id: 'moonshotai/Kimi-K2.6', tier: 'expensive' },
      ],
    },
  },
  {
    id: 'fal',
    label: 'fal.ai',
    apiUrl: 'https://fal.run',
    accountUrl: 'https://fal.ai/dashboard/keys',
    // Stems only — single Demucs endpoint (variant is an API input, not a separate model page).
    // https://fal.ai/models/fal-ai/demucs
    capabilities: ['stems'],
    models: {
      stems: 'fal-ai/demucs',
    },
    modelSuggestions: {
      stems: ['fal-ai/demucs'],
    },
  },
  {
    id: 'replicate',
    label: 'Replicate',
    apiUrl: 'https://api.replicate.com/v1',
    accountUrl: 'https://replicate.com/account/api-tokens',
    // Predictions API — Demucs model pages on Replicate (owner/name).
    capabilities: ['stems'],
    models: {
      stems: 'cjwbw/demucs',
    },
    modelSuggestions: {
      stems: [
        'cjwbw/demucs',
        'ryan5453/demucs',
      ],
    },
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    apiUrl: '',
    accountUrl: '',
    capabilities: ['llm', 'whisper', 'ocr', 'stems'],
    models: {
      llm: '',
      whisper: '',
      ocr: '',
      stems: '',
    },
    modelSuggestions: {
      llm: [],
      whisper: [],
      ocr: [],
      stems: [],
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

export function getPresetById(presetId) {
  return PROVIDER_PRESETS.find(function(p) { return p.id === presetId })
    || PROVIDER_PRESETS.find(function(p) { return p.id === 'custom' })
}

/** Presets offered in Add/Edit UI for a capability (excludes legacy local). */
export function getSelectablePresets(capability) {
  return PROVIDER_PRESETS.filter(function(p) {
    if (p.id === 'local') return false
    return (p.capabilities || []).indexOf(capability) !== -1
  })
}

export function getProviderAccountUrl(presetId) {
  const preset = getPresetById(presetId)
  return (preset && preset.accountUrl) || ''
}

/** Model suggestion ids for chips (default first). Accepts string or {id,tier} entries. */
export function getModelSuggestions(presetId, capability) {
  const metas = getModelSuggestionMetas(presetId, capability)
  return metas.map(function(m) { return m.id })
}

/** Full suggestion metadata for a preset/capability. */
export function getModelSuggestionMetas(presetId, capability) {
  const preset = getPresetById(presetId)
  if (!preset) return []
  const raw = (preset.modelSuggestions && preset.modelSuggestions[capability]) || []
  const defaultModel = (preset.models && preset.models[capability]) || ''
  const byId = {}
  raw.forEach(function(entry) {
    const meta = normalizeModelSuggestion(entry)
    if (!meta || !meta.id) return
    byId[meta.id] = meta
  })
  if (defaultModel && !byId[defaultModel]) {
    byId[defaultModel] = { id: defaultModel, tier: 'economy' }
  }
  const out = []
  const seen = {}
  function pushId(id) {
    if (!id || seen[id] || !byId[id]) return
    seen[id] = true
    out.push(byId[id])
  }
  if (defaultModel) pushId(defaultModel)
  raw.forEach(function(entry) {
    const meta = normalizeModelSuggestion(entry)
    if (meta) pushId(meta.id)
  })
  return out
}

export function getModelMeta(presetId, capability, modelId) {
  const id = String(modelId || '').trim()
  if (!id) return null
  const metas = getModelSuggestionMetas(presetId, capability)
  for (let i = 0; i < metas.length; i++) {
    if (metas[i].id === id) return metas[i]
  }
  return { id: id, tier: 'economy' }
}

export function isExpensiveModel(presetId, capability, modelId) {
  const meta = getModelMeta(presetId, capability, modelId)
  return !!(meta && meta.tier === 'expensive')
}

/**
 * Public docs / playground URL for a selected model when we know one.
 * Fal Demucs is a single endpoint; Replicate uses owner/name pages.
 */
export function getModelPageUrl(presetId, capability, modelId) {
  const id = String(modelId || '').trim()
  if (!id) return ''
  const preset = String(presetId || '').toLowerCase()

  if (capability === 'stems') {
    if (preset === 'fal' || id === 'fal-ai/demucs' || id.indexOf('fal-ai/') === 0) {
      return 'https://fal.ai/models/fal-ai/demucs'
    }
    if (preset === 'replicate' || id.indexOf('/') !== -1) {
      const path = id.split(':')[0].replace(/^\/+/, '')
      if (path.indexOf('/') !== -1 && path.indexOf('fal-ai/') !== 0) {
        return 'https://replicate.com/' + path
      }
    }
  }

  return ''
}

/** Browse / search page for discovering models on a provider (when available). */
export function getProviderModelCatalogUrl(presetId, capability) {
  if (String(presetId || '').toLowerCase() === 'replicate' && capability === 'stems') {
    return 'https://replicate.com/search?query=demucs'
  }
  return ''
}

const GROQ_FILL_CAPS = ['llm', 'whisper', 'ocr']

/**
 * Groq capabilities that lack an active Groq set with a key (excluding exceptCap).
 */
export function listGroqCapsMissingKey(settings, exceptCap) {
  const src = settings || defaultProviderSettings()
  return GROQ_FILL_CAPS.filter(function(cap) {
    if (exceptCap && cap === exceptCap) return false
    const active = getActiveProvider(src, cap)
    if (active && active.provider === 'groq' && (active.apiKey || '').trim()) return false
    return true
  })
}

export function buildWizardProviderSet(capability, presetId, apiKey, model) {
  const preset = getPresetById(presetId)
  const set = emptyProviderSet(capability)
  set.provider = preset.id
  set.apiUrl = preset.apiUrl || ''
  set.apiKey = apiKey || ''
  const defaultModel = (preset.models && preset.models[capability]) || ''
  const suggestions = getModelSuggestions(preset.id, capability)
  set.model = (model && String(model).trim())
    || defaultModel
    || (suggestions[0] || '')
  set.label = preset.label
  set.active = true
  return set
}

export function applyProviderEdits(existing, capability, fields) {
  const prev = existing || emptyProviderSet(capability)
  const next = Object.assign({}, prev)
  const presetId = fields.provider || next.provider || 'custom'
  const preset = getPresetById(presetId)
  const providerChanged = preset.id !== prev.provider
  next.provider = preset.id
  next.label = fields.label != null && String(fields.label).trim()
    ? String(fields.label).trim()
    : (preset.label || next.label)
  if (fields.apiUrl != null) {
    next.apiUrl = String(fields.apiUrl || '').trim()
  } else if (preset.apiUrl && (providerChanged || !next.apiUrl)) {
    next.apiUrl = preset.apiUrl
  }
  if (fields.apiKey != null && String(fields.apiKey).trim()) {
    next.apiKey = String(fields.apiKey).trim()
  }
  if (fields.model != null) {
    next.model = String(fields.model || '').trim()
  }
  next.capability = capability
  return next
}

export function defaultProviderSettings() {
  return {
    llm: [],
    whisper: [],
    ocr: [],
    stems: [],
  }
}

const DEPRECATED_GROQ_OCR_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'
const REPLACEMENT_GROQ_OCR_MODEL = 'qwen/qwen3.6-27b'

function migrateProviderSettings(settings) {
  const next = settings || defaultProviderSettings()
  let changed = false
  const ocrList = Array.isArray(next.ocr) ? next.ocr : []
  next.ocr = ocrList.map(function(item) {
    if (!item || String(item.model || '') !== DEPRECATED_GROQ_OCR_MODEL) return item
    changed = true
    return Object.assign({}, item, { model: REPLACEMENT_GROQ_OCR_MODEL })
  })
  return { settings: next, changed: changed }
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
    const migrated = migrateProviderSettings(out)
    if (migrated.changed) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated.settings))
      } catch (e) {
        // ignore quota
      }
    }
    return migrated.settings
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

/**
 * True when the SPA can use a capability via BYO key and/or resolver feature.
 */
export function isCapabilityAvailable(capability, features, settings) {
  const active = getActiveProvider(settings || loadProviderSettings(), capability)
  if (active && active.provider === 'local') return true
  if (active && (active.apiKey || active.apiUrl)) return true
  const caps = features || {}
  if (capability === 'llm') return !!caps.llm
  if (capability === 'whisper') return !!caps.whisper
  if (capability === 'ocr') return !!(caps.sheetImageOcr || caps.sheetImage)
  if (capability === 'stems') return !!caps.stems
  return false
}

/** Stems on light gateway need BYO or host-embedded cloud Demucs provider. */
export function isStemsCapabilityAvailable(features, settings, resolverStatus) {
  const srcSettings = settings || loadProviderSettings()
  const active = getActiveProvider(srcSettings, 'stems')
  if (active && active.provider === 'local') return true
  if (active && (active.apiKey || active.apiUrl)) return true
  if (!(features && features.stems)) return false
  if (!features.lightMode) return true
  const healthProviders = resolverStatus && resolverStatus.providers
  const base = (resolverStatus && resolverStatus.heavyMlBase)
    || (resolverStatus && resolverStatus.activeBase)
    || ''
  const source = describeProviderSource(healthProviders, 'stems', active, base)
  return source.kind === 'user' || source.kind === 'host'
}

/** Headers to send with media proxy requests for the active provider overlays. */
export function getActiveProviderHeaders(settings) {
  const headers = {}
  const src = settings || loadProviderSettings()
  PROVIDER_CAPABILITIES.forEach(function(cap) {
    const active = getActiveProvider(src, cap)
    if (!active) return
    // Legacy "local" sets still force resolver backends; new UI no longer offers Local.
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

/**
 * Describe which credentials/backend will be used for a capability.
 * Returns { label, kind, model, resolverBase }.
 */
export function describeProviderSource(healthProviders, capability, activeUserSet, resolverBase) {
  let kind = 'none'
  let model = ''

  if (activeUserSet && activeUserSet.provider === 'local') {
    kind = 'local'
    model = activeUserSet.model || ''
  } else if (activeUserSet && (activeUserSet.apiKey || activeUserSet.apiUrl)) {
    kind = 'user'
    model = activeUserSet.model || ''
  } else {
    const caps = healthProviders && healthProviders.capabilities
    const cap = caps && caps[capability]
    const active = cap && cap.active
    if (active && active.source === 'host') {
      kind = 'host'
      model = active.model || ''
    } else if (active && active.source === 'local') {
      kind = 'local'
      model = active.model || ''
    } else if (cap && cap.hostEmbeddedUsable) {
      kind = 'host'
      model = (cap.active && cap.active.model) || ''
    } else if (cap && cap.localAvailable) {
      kind = 'local'
      model = (cap.active && cap.active.model) || ''
    }
  }

  return {
    label: kind === 'user'
      ? 'BYO key'
      : (kind === 'host'
        ? 'Resolver provided key'
        : (kind === 'local' ? 'Custom resolver' : 'Not configured')),
    kind: kind,
    model: model,
    resolverBase: resolverBase || '',
  }
}

function shortenBase(base) {
  if (!base) return ''
  try {
    const u = new URL(base)
    return u.host + (u.pathname && u.pathname !== '/' ? u.pathname.replace(/\/$/, '') : '')
  } catch (e) {
    return String(base).replace(/^https?:\/\//, '')
  }
}

function formatUsingLine(kind, model, resolverBase) {
  const host = shortenBase(resolverBase)
  if (kind === 'user') {
    return model ? ('BYO key · ' + model) : 'BYO key'
  }
  if (kind === 'host') {
    let line = 'Resolver provided key'
    if (host) line += ' · ' + host
    if (model) line += ' · ' + model
    return line
  }
  if (kind === 'local') {
    let line = 'Custom resolver'
    if (host) line += ' · ' + host
    if (model) line += ' · ' + model
    return line
  }
  return '—'
}

/**
 * Build rows for the Providers status matrix.
 * Each row: { id, service, available, statusLabel, statusTone, using }
 */
export function buildProviderServiceStatusRows(resolverStatus, settings, opts) {
  const options = opts || {}
  const healthProviders = resolverStatus && resolverStatus.providers
  const activeBase = (resolverStatus && resolverStatus.activeBase) || ''
  const heavyBase = (resolverStatus && resolverStatus.heavyMlBase) || activeBase
  const features = (resolverStatus && resolverStatus.features) || {}
  const rows = []

  PROVIDER_CAPABILITIES.forEach(function(cap) {
    const active = getActiveProvider(settings, cap)
    const base = cap === 'stems' ? heavyBase : activeBase
    const source = describeProviderSource(healthProviders, cap, active, base)
    let kind = source.kind
    let available = kind !== 'none'
    // Resolver feature fallback when no BYO / host / localAvailable signal
    if (kind === 'none') {
      const featureOk = cap === 'llm' ? !!features.llm
        : (cap === 'whisper' ? !!features.whisper
          : (cap === 'ocr' ? !!(features.sheetImageOcr || features.sheetImage)
            : (cap === 'stems'
              ? isStemsCapabilityAvailable(features, settings, resolverStatus)
              : false)))
      if (featureOk) {
        kind = 'local'
        available = true
      }
    }
    const model = source.model
      || (cap === 'stems' && kind === 'local' && resolverStatus && resolverStatus.demucsModel
        ? resolverStatus.demucsModel
        : '')
    rows.push({
      id: cap,
      service: cap === 'stems' ? 'Stems' : (cap === 'llm' ? 'LLM' : (cap === 'whisper' ? 'Whisper' : 'OCR')),
      kind: kind,
      available: available,
      statusLabel: available ? 'Connected' : 'Not available',
      statusTone: available ? 'ok' : 'bad',
      using: formatUsingLine(kind, model, base),
      detail: formatUsingLine(kind, model, base),
    })
  })

  const webshareSaved = !!options.webshareSaved
  const egressRequired = !!options.egressRequired
  const helperOk = !!options.helperOk
  const helperVersion = options.helperVersion ? String(options.helperVersion) : ''
  const proxyAvailable = webshareSaved || helperOk || !egressRequired
  let proxyUsing = '—'
  let proxyKind = 'none'
  if (helperOk) {
    proxyKind = 'user'
    proxyUsing = helperVersion
      ? ('TuneBook Helper · v' + helperVersion)
      : 'TuneBook Helper'
  } else if (webshareSaved) {
    proxyKind = 'user'
    proxyUsing = 'Webshare'
  } else if (!egressRequired) {
    proxyKind = 'local'
    proxyUsing = activeBase
      ? ('Custom resolver · ' + shortenBase(activeBase))
      : 'Custom resolver'
  } else {
    proxyUsing = 'Not configured'
  }
  rows.push({
    id: 'proxy',
    service: 'Media Proxy',
    kind: proxyKind,
    available: proxyAvailable,
    statusLabel: proxyAvailable ? 'Connected' : 'Not available',
    statusTone: proxyAvailable ? 'ok' : 'bad',
    using: proxyUsing,
    detail: proxyUsing,
  })

  const analysisAvailable = !!(features.practiceAnalysis)
  rows.push({
    id: 'analysis',
    service: 'Audio analysis',
    kind: analysisAvailable ? 'local' : 'none',
    available: analysisAvailable,
    statusLabel: analysisAvailable ? 'Connected' : 'Not available',
    statusTone: analysisAvailable ? 'ok' : 'bad',
    using: analysisAvailable
      ? formatUsingLine('local', '', heavyBase || activeBase)
      : 'Needs full home resolver',
    detail: analysisAvailable
      ? formatUsingLine('local', '', heavyBase || activeBase)
      : 'Needs full home resolver',
  })

  const omrAvailable = !!features.sheetImageOmr
  rows.push({
    id: 'omr',
    service: 'OMR',
    kind: omrAvailable ? 'local' : 'none',
    available: omrAvailable,
    statusLabel: omrAvailable ? 'Connected' : 'Not available',
    statusTone: omrAvailable ? 'ok' : 'bad',
    using: omrAvailable
      ? formatUsingLine('local', '', heavyBase || activeBase)
      : (features.sheetImageOcr || features.sheetImage
        ? 'Chord OCR only (no staff OMR)'
        : 'Needs full home resolver'),
    detail: omrAvailable
      ? formatUsingLine('local', '', heavyBase || activeBase)
      : (features.sheetImageOcr || features.sheetImage
        ? 'Chord OCR only (no staff OMR)'
        : 'Needs full home resolver'),
  })

  return rows
}
