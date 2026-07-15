import { useEffect, useState } from 'react'
import { Button, Form, Modal, Table } from 'react-bootstrap'
import { toast } from 'react-toastify'
import {
  PROVIDER_CAPABILITIES,
  PROVIDER_PRESETS,
  buildWizardProviderSet,
  describeProviderSource,
  emptyProviderSet,
  getActiveProvider,
  loadProviderSettings,
  saveProviderSettings,
} from '../providerSettings'
import {
  getSavedWebshareProxyUrl,
  setSavedWebshareProxyUrl,
} from '../webshareProxySettings'

const CAP_LABELS = {
  llm: 'LLM',
  whisper: 'Whisper (speech-to-text)',
  ocr: 'OCR',
}

function ProviderWizardModal({ show, capability, onHide, onApply }) {
  const [presetId, setPresetId] = useState('groq')
  const [apiKey, setApiKey] = useState('')
  const presets = PROVIDER_PRESETS.filter(function(p) {
    return (p.capabilities || []).indexOf(capability) !== -1
  })

  useEffect(function() {
    if (show) {
      setPresetId(presets[0] ? presets[0].id : 'custom')
      setApiKey('')
    }
  }, [show, capability])

  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Add {CAP_LABELS[capability] || capability} provider</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3">
          <Form.Label>Provider</Form.Label>
          <Form.Select value={presetId} onChange={function(e) { setPresetId(e.target.value) }}>
            {presets.map(function(p) {
              return <option key={p.id} value={p.id}>{p.label}</option>
            })}
          </Form.Select>
        </Form.Group>
        {presetId !== 'local' ? (
          <Form.Group className="mb-2">
            <Form.Label>API key</Form.Label>
            <Form.Control
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={function(e) { setApiKey(e.target.value) }}
              placeholder="Paste API key"
            />
          </Form.Group>
        ) : (
          <p className="app-text-muted mb-0">
            Uses models on the active media resolver (whisper.cpp, local OCR, research LLM).
          </p>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide}>Cancel</Button>
        <Button
          variant="primary"
          onClick={function() {
            onApply(buildWizardProviderSet(capability, presetId, apiKey))
            onHide()
          }}
        >
          Add provider
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

function CapabilitySection({ capability, settings, setSettings, healthProviders }) {
  const [wizardOpen, setWizardOpen] = useState(false)
  const list = settings[capability] || []
  const active = getActiveProvider(settings, capability)
  const source = describeProviderSource(healthProviders, capability, active)

  function updateList(nextList) {
    const next = Object.assign({}, settings, { [capability]: nextList })
    setSettings(next)
    saveProviderSettings(next)
  }

  function setActive(id) {
    updateList(list.map(function(item) {
      return Object.assign({}, item, { active: item.id === id })
    }))
  }

  function removeSet(id) {
    const nextList = list.filter(function(item) { return item.id !== id })
    if (nextList.length && !nextList.some(function(item) { return item.active })) {
      nextList[0] = Object.assign({}, nextList[0], { active: true })
    }
    updateList(nextList)
  }

  return (
    <div className="app-surface-panel App-settings-section" style={{ marginTop: '1rem' }}>
      <h3 style={{ fontSize: '1.1rem' }}>{CAP_LABELS[capability] || capability}</h3>
      <p className="app-text-muted" style={{ marginBottom: '0.5rem' }}>
        Status: <strong>{source.label}</strong>
        {' · '}Precedence: your settings → host credentials → local models
      </p>
      {list.length === 0 ? (
        <p className="app-text-muted">No saved provider sets. Use the wizard or rely on host/local defaults.</p>
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
                  <td>
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
        <Button variant="primary" onClick={function() { setWizardOpen(true) }}>
          Wizard: add provider
        </Button>
        <Button
          variant="outline-secondary"
          onClick={function() {
            const blank = emptyProviderSet(capability)
            blank.active = list.length === 0
            updateList(list.concat([blank]))
          }}
        >
          Add blank
        </Button>
      </div>
      <ProviderWizardModal
        show={wizardOpen}
        capability={capability}
        onHide={function() { setWizardOpen(false) }}
        onApply={function(set) {
          const deactivated = list.map(function(item) {
            return Object.assign({}, item, { active: false })
          })
          updateList(deactivated.concat([set]))
          toast.success('Added ' + (set.label || set.provider) + ' for ' + capability)
        }}
      />
    </div>
  )
}

export default function ProvidersSettingsSection({ resolverStatus }) {
  const [settings, setSettings] = useState(function() { return loadProviderSettings() })
  const [webshareUrl, setWebshareUrl] = useState(function() { return getSavedWebshareProxyUrl() })
  const healthProviders = resolverStatus && resolverStatus.providers
  const egressRequired = !!(resolverStatus && resolverStatus.features && resolverStatus.features.youtubeEgressRequired)

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

  return (
    <>
      <div className="app-surface-panel App-settings-section">
        <h2>Providers</h2>
        <p className="app-text-muted" style={{ marginBottom: 0 }}>
          Configure LLM, Whisper, and OCR backends. Keys stay in this browser and are sent only to your
          active media resolver (never logged). Host credentials appear when the resolver embeds operator keys
          and your account is allowed to use them.
        </p>
        {resolverStatus && resolverStatus.embeddedCreds ? (
          <p className="app-text-muted" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
            This account <strong>can use host credentials</strong> on the active resolver.
          </p>
        ) : null}
        {resolverStatus && resolverStatus.heavyMlBase && resolverStatus.heavyMlBase !== resolverStatus.activeBase ? (
          <p className="app-text-muted" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
            Heavy ML (stems / OMR) routed to <code>{resolverStatus.heavyMlBase}</code>
          </p>
        ) : null}
      </div>

      <div className="app-surface-panel App-settings-section" style={{ marginTop: '1rem' }}>
        <h3 style={{ fontSize: '1.1rem' }}>YouTube egress (Webshare)</h3>
        <p className="app-text-muted">
          Slim / Cloud Run YouTube audio needs a residential proxy URL, the YouTube Helper extension,
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

      {PROVIDER_CAPABILITIES.map(function(cap) {
        return (
          <CapabilitySection
            key={cap}
            capability={cap}
            settings={settings}
            setSettings={setSettings}
            healthProviders={healthProviders}
          />
        )
      })}
    </>
  )
}
