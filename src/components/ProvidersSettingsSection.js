import { useEffect, useState } from 'react'
import { Alert, Button, Form, Modal, Nav, Tab, Table } from 'react-bootstrap'
import { toast } from 'react-toastify'
import FormFieldHelp, { FieldHelpModal } from './FormFieldHelp'
import { SETTINGS_FIELD_HELP } from '../formFieldHelpText'
import {
  DEFAULT_CLOUD_LIGHT_MEDIA_PROXY,
  DEFAULT_PUBLIC_MEDIA_PROXY,
  getLocalMediaProxyCandidates,
} from '../mediaProxyConfig'
import { getResolverLoginWarning } from '../mediaProxyClient'
import {
  PROVIDER_CAPABILITIES,
  applyProviderEdits,
  buildProviderServiceStatusRows,
  buildWizardProviderSet,
  describeProviderSource,
  getActiveProvider,
  getModelSuggestionMetas,
  getModelSuggestions,
  getPresetById,
  getProviderAccountUrl,
  getSelectablePresets,
  getModelPageUrl,
  getProviderModelCatalogUrl,
  isExpensiveModel,
  listGroqCapsMissingKey,
  loadProviderSettings,
  saveProviderSettings,
} from '../providerSettings'
import {
  getSavedWebshareProxyUrl,
  setSavedWebshareProxyUrl,
} from '../webshareProxySettings'
import { pingYoutubeExtension } from '../youtubeExtensionClient'
import { isYoutubeHelperDisabled } from '../youtubeHelperSettings'
import GoogleAuthStatusSection from './GoogleAuthStatusSection'

const CAP_LABELS = {
  llm: 'LLM',
  whisper: 'Whisper (speech-to-text)',
  ocr: 'OCR',
  stems: 'Stems (source separation)',
}

const CAP_SHORT = {
  llm: 'LLM',
  whisper: 'Whisper',
  ocr: 'OCR',
  stems: 'Stems',
}

const TAB_RESOLVER = 'resolver'
const TAB_PROXY = 'proxy'
const TAB_LLM = 'llm'
const TAB_WHISPER = 'whisper'
const TAB_OCR = 'ocr'
const TAB_STEMS = 'stems'

const EXPENSIVE_MODEL_WARNING =
  'This model is more expensive than Tunebook needs for summaries and field lookup. Prefer an economy model unless you need higher quality.'

function ProviderEditorModal({ show, capability, editing, onHide, onApply }) {
  const presets = getSelectablePresets(capability)
  const [presetId, setPresetId] = useState('custom')
  const [apiKey, setApiKey] = useState('')
  const [apiUrl, setApiUrl] = useState('')
  const [model, setModel] = useState('')
  const [label, setLabel] = useState('')
  const [acceptExpensive, setAcceptExpensive] = useState(false)
  const isEdit = !!(editing && editing.id)
  const suggestions = getModelSuggestions(presetId, capability)
  const suggestionMetas = getModelSuggestionMetas(presetId, capability)
  const accountUrl = getProviderAccountUrl(presetId)
  const expensive = isExpensiveModel(presetId, capability, model)
  const modelPageUrl = getModelPageUrl(presetId, capability, model)
  const modelCatalogUrl = getProviderModelCatalogUrl(presetId, capability)
  const modelTrim = model.trim()
  const modelIsExactSuggestion = suggestionMetas.some(function(meta) {
    return meta.id === modelTrim
  })
  // When a full suggestion is selected (default), show the full catalog — do not
  // narrow chips to substring matches of the current model id.
  const filteredMetas = (!modelTrim || modelIsExactSuggestion)
    ? suggestionMetas
    : suggestionMetas.filter(function(meta) {
      return meta.id.toLowerCase().indexOf(modelTrim.toLowerCase()) !== -1
    })

  useEffect(function() {
    if (!show) return
    setAcceptExpensive(false)
    if (isEdit) {
      const nextPreset = editing.provider === 'local'
        ? (presets[0] && presets[0].id) || 'custom'
        : (editing.provider || (presets[0] && presets[0].id) || 'custom')
      setPresetId(nextPreset)
      setApiKey('')
      setApiUrl(editing.apiUrl || '')
      setModel(editing.model || '')
      setLabel(editing.label || '')
      return
    }
    const first = presets[0] ? presets[0].id : 'custom'
    setPresetId(first)
    setApiKey('')
    const preset = getPresetById(first)
    setApiUrl(preset.apiUrl || '')
    const sug = getModelSuggestions(first, capability)
    setModel((preset.models && preset.models[capability]) || sug[0] || '')
    setLabel(preset.label || '')
  }, [show, capability, isEdit, editing && editing.id])

  useEffect(function() {
    setAcceptExpensive(false)
  }, [model, presetId])

  function onPresetChange(nextId) {
    setPresetId(nextId)
    const preset = getPresetById(nextId)
    if (preset.apiUrl) setApiUrl(preset.apiUrl)
    const sug = getModelSuggestions(nextId, capability)
    const defaultModel = (preset.models && preset.models[capability]) || sug[0] || ''
    setModel(defaultModel)
    setLabel(preset.label || '')
  }

  function submit() {
    if (expensive && !acceptExpensive) {
      toast.warn('Confirm the costlier model before saving.')
      return
    }
    if (isEdit) {
      onApply(applyProviderEdits(editing, capability, {
        provider: presetId,
        apiUrl: apiUrl,
        apiKey: apiKey,
        model: model,
        label: label,
      }), { isEdit: true })
    } else {
      const set = buildWizardProviderSet(capability, presetId, apiKey, model)
      if (apiUrl.trim()) set.apiUrl = apiUrl.trim()
      if (label.trim()) set.label = label.trim()
      onApply(set, { isEdit: false, apiKey: apiKey })
    }
    onHide()
  }

  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>
          {isEdit ? 'Edit' : 'Add'} {CAP_LABELS[capability] || capability} provider
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3">
          <div className="d-flex align-items-baseline justify-content-between gap-2 flex-wrap">
            <Form.Label className="mb-0">Provider</Form.Label>
            {accountUrl ? (
              <a href={accountUrl} target="_blank" rel="noopener noreferrer">
                Create An Account
              </a>
            ) : null}
          </div>
          <Form.Select
            className="mt-1"
            value={presetId}
            onChange={function(e) { onPresetChange(e.target.value) }}
          >
            {presets.map(function(p) {
              return <option key={p.id} value={p.id}>{p.label}</option>
            })}
          </Form.Select>
          <Form.Text className="app-text-muted">
            Without a key, the active media resolver (Providers → Resolver, localhost, or peppertrees) is used.
          </Form.Text>
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label>Label</Form.Label>
          <Form.Control
            type="text"
            autoComplete="off"
            value={label}
            onChange={function(e) { setLabel(e.target.value) }}
            placeholder="Display name"
          />
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label>API URL</Form.Label>
          <Form.Control
            type="text"
            autoComplete="off"
            value={apiUrl}
            onChange={function(e) { setApiUrl(e.target.value) }}
            placeholder="https://…"
          />
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label>API key</Form.Label>
          <Form.Control
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={function(e) { setApiKey(e.target.value) }}
            placeholder={isEdit && editing.apiKey ? 'Leave blank to keep existing key' : 'Paste API key'}
          />
        </Form.Group>
        <Form.Group className="mb-2">
          <Form.Label htmlFor={'provider-model-' + capability}>Model</Form.Label>
          <Form.Control
            as="textarea"
            rows={2}
            id={'provider-model-' + capability}
            autoComplete="off"
            value={model}
            onChange={function(e) { setModel(e.target.value) }}
            placeholder={suggestions[0] || 'Model id'}
            className="App-providers-model-input"
          />
          {suggestionMetas.length ? (
            <div className="App-providers-model-suggestions" role="listbox" aria-label="Model suggestions">
              {filteredMetas.map(function(meta) {
                const chipLabel = meta.tier === 'expensive'
                  ? (meta.id + ' (costlier)')
                  : meta.id
                return (
                  <button
                    key={meta.id}
                    type="button"
                    className="App-providers-model-chip"
                    onClick={function() { setModel(meta.id) }}
                  >
                    {chipLabel}
                  </button>
                )
              })}
            </div>
          ) : (
            <Form.Text className="app-text-muted">Type any model id for this provider.</Form.Text>
          )}
          {modelPageUrl || modelCatalogUrl ? (
            <Form.Text className="d-block mt-2">
              {modelPageUrl ? (
                <a href={modelPageUrl} target="_blank" rel="noopener noreferrer">
                  Open model page
                </a>
              ) : null}
              {modelPageUrl && modelCatalogUrl ? <span className="app-text-muted"> · </span> : null}
              {modelCatalogUrl ? (
                <a href={modelCatalogUrl} target="_blank" rel="noopener noreferrer">
                  Browse Demucs models
                </a>
              ) : null}
            </Form.Text>
          ) : null}
        </Form.Group>
        {expensive ? (
          <Alert variant="warning" className="mb-0 mt-2">
            <p className="mb-2">{EXPENSIVE_MODEL_WARNING}</p>
            <Form.Check
              type="checkbox"
              id={'accept-expensive-' + capability}
              checked={acceptExpensive}
              onChange={function(e) { setAcceptExpensive(e.target.checked) }}
              label="Use this costlier model anyway"
            />
          </Alert>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={expensive && !acceptExpensive}>
          {isEdit ? 'Save' : 'Add provider'}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

function GroqFillOtherServicesModal({ show, fromCapability, apiKey, settings, onHide, onConfirm }) {
  const missing = listGroqCapsMissingKey(settings, fromCapability)
  const [selected, setSelected] = useState({})

  useEffect(function() {
    if (!show) return
    const next = {}
    missing.forEach(function(cap) { next[cap] = true })
    setSelected(next)
  }, [show, fromCapability, missing.join(',')])

  const selectedCaps = missing.filter(function(cap) { return selected[cap] })

  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Use Groq on other services?</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="app-text-muted">
          Activate the same Groq API key on other services with each service’s default model.
        </p>
        {missing.length === 0 ? (
          <p className="mb-0">All Groq services already have an active key.</p>
        ) : (
          missing.map(function(cap) {
            const preset = getPresetById('groq')
            const defaultModel = (preset.models && preset.models[cap]) || ''
            return (
              <Form.Check
                key={cap}
                type="checkbox"
                id={'groq-fill-' + cap}
                className="mb-2"
                checked={!!selected[cap]}
                onChange={function(e) {
                  setSelected(Object.assign({}, selected, { [cap]: e.target.checked }))
                }}
                label={(CAP_SHORT[cap] || cap) + (defaultModel ? (' · ' + defaultModel) : '')}
              />
            )
          })
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide}>Skip</Button>
        <Button
          variant="primary"
          disabled={selectedCaps.length === 0}
          onClick={function() { onConfirm(selectedCaps, apiKey) }}
        >
          Activate selected
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

function CapabilitySection({ capability, settings, setSettings, healthProviders, resolverBase, onAddedGroq }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const list = settings[capability] || []
  const active = getActiveProvider(settings, capability)
  const source = describeProviderSource(healthProviders, capability, active, resolverBase)

  function updateList(nextList) {
    const next = Object.assign({}, settings, { [capability]: nextList })
    setSettings(next)
    saveProviderSettings(next)
    return next
  }

  function setActive(id) {
    updateList(list.map(function(item) {
      return Object.assign({}, item, { active: item.id === id })
    }))
  }

  function disableSet(id) {
    updateList(list.map(function(item) {
      return Object.assign({}, item, { active: item.id === id ? false : item.active })
    }))
  }

  function removeSet(id) {
    const nextList = list.filter(function(item) { return item.id !== id })
    if (nextList.length && !nextList.some(function(item) { return item.active })) {
      nextList[0] = Object.assign({}, nextList[0], { active: true })
    }
    updateList(nextList)
  }

  const intro = capability === 'stems'
    ? 'Separate vocals, drums, bass, and other stems via fal.ai (fal-ai/demucs) or Replicate Demucs models. Without a key, Demucs on the active full home resolver is used when available.'
    : null

  return (
    <div className="App-settings-section">
      {intro ? <p className="app-text-muted">{intro}</p> : null}
      <p className="app-text-muted" style={{ marginBottom: '0.5rem' }}>
        Status: <strong>{source.label}</strong>
        {source.model ? <> · model <code>{source.model}</code></> : null}
        {source.resolverBase ? <> · <code>{source.resolverBase}</code></> : null}
        {' · '}Precedence: your key → resolver-provided key → custom resolver
      </p>
      {list.length === 0 ? (
        <p className="app-text-muted">No saved provider sets. Add a key, or rely on the active media resolver.</p>
      ) : (
        <Table size="sm" responsive className="mb-2">
          <thead>
            <tr>
              <th>Active</th>
              <th>Provider</th>
              <th>Model</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map(function(item) {
              return (
                <tr key={item.id}>
                  <td>
                    <Form.Check
                      type="radio"
                      name={'provider-active-' + capability}
                      checked={!!item.active}
                      onChange={function() { setActive(item.id) }}
                      aria-label={'Use ' + (item.label || item.provider)}
                    />
                  </td>
                  <td>{item.label || item.provider}</td>
                  <td><code>{item.model || '—'}</code></td>
                  <td className="text-end text-nowrap">
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      className="me-1"
                      onClick={function() {
                        setEditing(item)
                        setModalOpen(true)
                      }}
                    >
                      Edit
                    </Button>
                    {item.active ? (
                      <Button
                        size="sm"
                        variant="outline-warning"
                        className="me-1"
                        onClick={function() { disableSet(item.id) }}
                      >
                        Disable
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        className="me-1"
                        onClick={function() { setActive(item.id) }}
                      >
                        Enable
                      </Button>
                    )}
                    <Button size="sm" variant="outline-danger" onClick={function() { removeSet(item.id) }}>
                      Remove
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}
      <div className="App-settings-actions">
        <Button
          variant="primary"
          onClick={function() {
            setEditing(null)
            setModalOpen(true)
          }}
        >
          Add provider
        </Button>
      </div>
      <ProviderEditorModal
        show={modalOpen}
        capability={capability}
        editing={editing}
        onHide={function() {
          setModalOpen(false)
          setEditing(null)
        }}
        onApply={function(set, meta) {
          if (editing && editing.id) {
            updateList(list.map(function(item) {
              return item.id === editing.id ? Object.assign({}, set, { id: editing.id, active: item.active }) : item
            }))
            toast.success('Updated ' + (set.label || set.provider))
            return
          }
          const deactivated = list.map(function(item) {
            return Object.assign({}, item, { active: false })
          })
          const next = updateList(deactivated.concat([set]))
          toast.success('Added ' + (set.label || set.provider) + ' for ' + capability)
          if (
            onAddedGroq
            && set.provider === 'groq'
            && !(meta && meta.isEdit)
            && ((meta && meta.apiKey) || set.apiKey)
          ) {
            onAddedGroq(capability, (meta && meta.apiKey) || set.apiKey, next)
          }
        }}
      />
    </div>
  )
}

function ResolverTab({
  mediaProxyUrl,
  setMediaProxyUrl,
  clearMediaProxy,
  refreshResolverStatus,
  resolverMessage,
  resolverStatus,
  formatCandidateStatus,
}) {
  const [showResolverInstallHelp, setShowResolverInstallHelp] = useState(false)

  return (
    <div className="App-settings-section">
      <h3 style={{ fontSize: '1.1rem' }}>Resolver</h3>
      <p className="app-text-muted">
        Optional override of resolver base URL for pitch/tempo playback, lyrics transcription, chord discovery and more.
      </p>
      <Form.Group className="mb-2">
        <Form.Label htmlFor="media-proxy-url">
          Resolver URL
          <FormFieldHelp title={SETTINGS_FIELD_HELP.resolverUrl.title} body={SETTINGS_FIELD_HELP.resolverUrl.body} />
        </Form.Label>
        <Form.Control
          id="media-proxy-url"
          type="url"
          value={mediaProxyUrl}
          placeholder={DEFAULT_PUBLIC_MEDIA_PROXY}
          onChange={function(e) { setMediaProxyUrl(e.target.value) }}
        />
      </Form.Group>
      <div className="App-settings-actions">
        <Button variant="outline-secondary" onClick={clearMediaProxy}>Use defaults</Button>
        <Button variant="outline-secondary" onClick={refreshResolverStatus}>Refresh status</Button>
        <Button
          variant="outline-secondary"
          onClick={function() { setShowResolverInstallHelp(true) }}
        >
          How to install
        </Button>
      </div>
      <FieldHelpModal
        show={showResolverInstallHelp}
        title={SETTINGS_FIELD_HELP.resolverInstall.title}
        fields={SETTINGS_FIELD_HELP.resolverInstall.fields}
        onHide={function() { setShowResolverInstallHelp(false) }}
      />
      <p className="app-text-muted" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
        Order when blank: {getLocalMediaProxyCandidates()[0]}, then {DEFAULT_PUBLIC_MEDIA_PROXY}, then{' '}
        {DEFAULT_CLOUD_LIGHT_MEDIA_PROXY}
      </p>
      <div className="App-settings-resolver-status">
        <strong>{resolverMessage}</strong>
      </div>
      {resolverStatus && resolverStatus.candidates && resolverStatus.candidates.length > 0 ? (
        <ul className="App-settings-resolver-list">
          {resolverStatus.candidates.map(function(candidate) {
            return (
              <li key={candidate.base}>
                {formatCandidateStatus(candidate, resolverStatus.activeBase)}
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

function ProxyTab({ webshareUrl, setWebshareUrl, egressRequired }) {
  return (
    <div className="App-settings-section">
      <h3 style={{ fontSize: '1.1rem' }}>Webshare Proxy</h3>
      <p className="app-text-muted">
        Audio filtering needs residential proxy URL, the TuneBook Helper extension,
        or a home resolver. Paste a Webshare (or compatible) HTTP/SOCKS proxy URL here.
        {egressRequired ? ' The active resolver requires egress for YouTube.' : ''}
      </p>
      <Form.Group className="mb-2">
        <Form.Label htmlFor="webshare-proxy-url">Proxy URL</Form.Label>
        <Form.Control
          id="webshare-proxy-url"
          type="text"
          autoComplete="off"
          placeholder="http://user:pass@proxy.webshare.io:80"
          value={webshareUrl}
          onChange={function(e) { setWebshareUrl(e.target.value) }}
        />
      </Form.Group>
      <div className="App-settings-actions">
        <Button
          variant="primary"
          onClick={function() {
            const saved = setSavedWebshareProxyUrl(webshareUrl)
            setWebshareUrl(saved)
            toast.success(saved ? 'Webshare proxy saved' : 'Webshare proxy cleared')
          }}
        >
          Save Webshare proxy
        </Button>
        <Button
          variant="outline-secondary"
          onClick={function() {
            setSavedWebshareProxyUrl('')
            setWebshareUrl('')
            toast.info('Webshare proxy cleared')
          }}
        >
          Clear
        </Button>
      </div>
    </div>
  )
}

export default function ProvidersSettingsSection({
  resolverStatus,
  mediaProxyUrl,
  setMediaProxyUrl,
  clearMediaProxy,
  refreshResolverStatus,
  resolverMessage,
  accessToken,
  formatCandidateStatus,
  login,
  logout,
  refresh,
  user,
  token,
  authMode,
  authBase,
  authBaseChecked,
  requestGoogleScopes,
}) {
  const [settings, setSettings] = useState(function() { return loadProviderSettings() })
  const [webshareUrl, setWebshareUrl] = useState(function() { return getSavedWebshareProxyUrl() })
  const [helperStatus, setHelperStatus] = useState({ ok: false, version: null, checking: true })
  const [activeTab, setActiveTab] = useState(TAB_RESOLVER)
  const [groqFill, setGroqFill] = useState(null)
  const healthProviders = resolverStatus && resolverStatus.providers
  const egressRequired = !!(resolverStatus && resolverStatus.features && resolverStatus.features.youtubeEgressRequired)
  const activeBase = (resolverStatus && resolverStatus.activeBase) || ''
  const heavyBase = (resolverStatus && resolverStatus.heavyMlBase) || activeBase
  const statusRows = buildProviderServiceStatusRows(resolverStatus, settings, {
    webshareSaved: !!getSavedWebshareProxyUrl(),
    egressRequired: egressRequired,
    helperOk: !!helperStatus.ok && !isYoutubeHelperDisabled(),
    helperVersion: helperStatus.version || '',
  })
  const loginWarning = getResolverLoginWarning(resolverStatus, accessToken)

  useEffect(function() {
    let cancelled = false
    function refreshHelper() {
      if (isYoutubeHelperDisabled()) {
        if (!cancelled) {
          setHelperStatus({ ok: false, version: null, checking: false })
        }
        return
      }
      pingYoutubeExtension({ force: true }).then(function(result) {
        if (cancelled) return
        setHelperStatus({
          ok: !!result.ok,
          version: result.version || null,
          checking: false,
        })
      })
    }
    refreshHelper()
    const intervalId = setInterval(refreshHelper, 15000)
    function onHelperSettingsChanged() {
      refreshHelper()
    }
    window.addEventListener('youtubeHelperSettingsChanged', onHelperSettingsChanged)
    return function() {
      cancelled = true
      clearInterval(intervalId)
      window.removeEventListener('youtubeHelperSettingsChanged', onHelperSettingsChanged)
    }
  }, [])

  useEffect(function() {
    function reload() {
      setSettings(loadProviderSettings())
      setWebshareUrl(getSavedWebshareProxyUrl())
    }
    window.addEventListener('providerSettingsChanged', reload)
    window.addEventListener('webshareProxySettingsChanged', reload)
    return function() {
      window.removeEventListener('providerSettingsChanged', reload)
      window.removeEventListener('webshareProxySettingsChanged', reload)
    }
  }, [])

  function applyGroqFill(caps, apiKey) {
    let next = Object.assign({}, settings)
    caps.forEach(function(cap) {
      const set = buildWizardProviderSet(cap, 'groq', apiKey)
      const list = (next[cap] || []).map(function(item) {
        return Object.assign({}, item, { active: false })
      })
      next = Object.assign({}, next, { [cap]: list.concat([set]) })
    })
    setSettings(next)
    saveProviderSettings(next)
    setGroqFill(null)
    toast.success('Activated Groq on ' + caps.map(function(c) { return CAP_SHORT[c] || c }).join(', '))
  }

  return (
    <div className="App-providers-settings">
      {loginWarning ? (
        <Alert variant="danger" className="App-settings-section">
          <div>{loginWarning.message}</div>
          {loginWarning.showLoginButton && typeof login === 'function' ? (
            <div className="mt-2">
              <Button variant="outline-danger" size="sm" onClick={login}>
                Log in with Google
              </Button>
            </div>
          ) : null}
        </Alert>
      ) : null}
      <div className="app-surface-panel App-settings-section App-providers-intro">
        <h2>Providers</h2>
        <p className="app-text-muted App-providers-intro-text">
          Configure LLM, Whisper, OCR, and Stems backends with your own API keys. Keys stay in this browser and
          are sent only to your active media resolver. If no key is set, the resolver from Providers → Resolver
          (or localhost / peppertrees) is used. Host credentials appear when the resolver embeds operator keys
          for your account.
        </p>
        {resolverStatus && resolverStatus.embeddedCreds ? (
          <p className="app-text-muted App-providers-intro-note">
            This account <strong>can use host credentials</strong> on the active resolver.
          </p>
        ) : null}
        {resolverStatus && resolverStatus.heavyMlBase && resolverStatus.heavyMlBase !== resolverStatus.activeBase ? (
          <p className="app-text-muted App-providers-intro-note">
            Heavy ML (stems / OMR / analysis) routed to <code>{resolverStatus.heavyMlBase}</code>
          </p>
        ) : null}

        <Table size="sm" responsive className="App-providers-status-table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Status</th>
              <th>Using</th>
            </tr>
          </thead>
          <tbody>
            {statusRows.map(function(row) {
              return (
                <tr key={row.id}>
                  <td>{row.service}</td>
                  <td>
                    <span
                      className={
                        'App-providers-status-pill'
                        + (row.statusTone === 'ok' ? ' is-connected' : ' is-unavailable')
                      }
                    >
                      {row.statusLabel}
                    </span>
                  </td>
                  <td className="App-providers-using-cell">{row.using}</td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      </div>

      <div className="app-surface-panel App-settings-section App-providers-tabs-panel">
        <Tab.Container activeKey={activeTab} onSelect={function(k) { if (k) setActiveTab(k) }}>
          <Nav variant="tabs" className="mb-3">
            <Nav.Item>
              <Nav.Link eventKey={TAB_RESOLVER}>Resolver</Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey={TAB_PROXY}>Proxy</Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey={TAB_LLM}>LLM</Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey={TAB_WHISPER}>Whisper</Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey={TAB_OCR}>OCR</Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey={TAB_STEMS}>Stems</Nav.Link>
            </Nav.Item>
          </Nav>
          <Tab.Content>
            <Tab.Pane eventKey={TAB_RESOLVER}>
              <ResolverTab
                mediaProxyUrl={mediaProxyUrl || ''}
                setMediaProxyUrl={setMediaProxyUrl || function() {}}
                clearMediaProxy={clearMediaProxy || function() {}}
                refreshResolverStatus={refreshResolverStatus || function() {}}
                resolverMessage={resolverMessage || ''}
                resolverStatus={resolverStatus}
                formatCandidateStatus={formatCandidateStatus || function(c) { return c.base }}
              />
            </Tab.Pane>
            <Tab.Pane eventKey={TAB_PROXY}>
              <ProxyTab
                webshareUrl={webshareUrl}
                setWebshareUrl={setWebshareUrl}
                egressRequired={egressRequired}
              />
            </Tab.Pane>
            {PROVIDER_CAPABILITIES.map(function(cap) {
              const eventKey = cap === 'llm' ? TAB_LLM
                : (cap === 'whisper' ? TAB_WHISPER
                  : (cap === 'ocr' ? TAB_OCR : TAB_STEMS))
              return (
                <Tab.Pane key={cap} eventKey={eventKey}>
                  <CapabilitySection
                    capability={cap}
                    settings={settings}
                    setSettings={setSettings}
                    healthProviders={healthProviders}
                    resolverBase={cap === 'stems' ? heavyBase : activeBase}
                    onAddedGroq={function(fromCap, apiKey, nextSettings) {
                      const missing = listGroqCapsMissingKey(nextSettings, fromCap)
                      if (!missing.length) return
                      setGroqFill({ fromCapability: fromCap, apiKey: apiKey, settings: nextSettings })
                    }}
                  />
                </Tab.Pane>
              )
            })}
          </Tab.Content>
        </Tab.Container>
      </div>

      <GroqFillOtherServicesModal
        show={!!groqFill}
        fromCapability={groqFill && groqFill.fromCapability}
        apiKey={groqFill && groqFill.apiKey}
        settings={(groqFill && groqFill.settings) || settings}
        onHide={function() { setGroqFill(null) }}
        onConfirm={applyGroqFill}
      />

      <GoogleAuthStatusSection
        user={user}
        token={token}
        authMode={authMode}
        authBase={authBase}
        authBaseChecked={authBaseChecked}
        resolverStatus={resolverStatus}
        login={login}
        logout={logout}
        refresh={refresh}
        requestGoogleScopes={requestGoogleScopes}
      />
    </div>
  )
}
