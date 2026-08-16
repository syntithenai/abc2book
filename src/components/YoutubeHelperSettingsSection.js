import { useCallback, useEffect, useState } from 'react'
import { Button, Form } from 'react-bootstrap'
import FormFieldHelp, { FieldHelpModal } from './FormFieldHelp'
import { SETTINGS_FIELD_HELP } from '../formFieldHelpText'
import { pingYoutubeExtension } from '../youtubeExtensionClient'
import { pingYoutubeNative } from '../youtubeNativeClient'
import { isAndroidApp } from '../platformUtils'
import { openBatteryOptimizationSettings } from '../androidNativePlayback'
import {
  isYoutubeHelperDisabled,
  setYoutubeHelperDisabled,
} from '../youtubeHelperSettings'
import AndroidLocalMediaSettingsSection from './AndroidLocalMediaSettingsSection'

export default function YoutubeHelperSettingsSection() {
  const [youtubeHelperStatus, setYoutubeHelperStatus] = useState({
    checking: true,
    ok: false,
    version: null,
    error: null,
  })
  const [showYoutubeHelperInstallHelp, setShowYoutubeHelperInstallHelp] = useState(false)
  const [youtubeHelperDisabled, setYoutubeHelperDisabledState] = useState(isYoutubeHelperDisabled)
  const youtubeHelperZipHref =
    (process.env.PUBLIC_URL || '') + '/downloads/tunebook-helper.zip'

  const refreshYoutubeHelperStatus = useCallback(function() {
    if (isAndroidApp()) {
      return pingYoutubeNative({ force: true }).then(function(result) {
        setYoutubeHelperStatus({
          checking: false,
          ok: !!result.ok,
          version: result.version || null,
          error: result.error || null,
          via: result.via || 'native',
        })
      })
    }
    if (isYoutubeHelperDisabled()) {
      setYoutubeHelperStatus({
        checking: false,
        ok: false,
        version: null,
        error: 'Disabled in settings',
      })
      return Promise.resolve({ ok: false, disabled: true })
    }
    setYoutubeHelperStatus(function(prev) {
      return Object.assign({}, prev, { checking: true })
    })
    return pingYoutubeExtension({ force: true }).then(function(result) {
      if (isYoutubeHelperDisabled()) {
        setYoutubeHelperStatus({
          checking: false,
          ok: false,
          version: null,
          error: 'Disabled in settings',
        })
        return { ok: false, disabled: true }
      }
      setYoutubeHelperStatus({
        checking: false,
        ok: !!result.ok,
        version: result.version || null,
        error: result.error || null,
      })
      return result
    })
  }, [])

  useEffect(function() {
    function onHelperSettingsChanged() {
      setYoutubeHelperDisabledState(isYoutubeHelperDisabled())
      refreshYoutubeHelperStatus()
    }
    window.addEventListener('youtubeHelperSettingsChanged', onHelperSettingsChanged)
    return function() {
      window.removeEventListener('youtubeHelperSettingsChanged', onHelperSettingsChanged)
    }
  }, [refreshYoutubeHelperStatus])

  useEffect(function() {
    refreshYoutubeHelperStatus()
  }, [refreshYoutubeHelperStatus])

  return (
    <div className="app-surface-panel App-settings-section">
      <h2>
        {isAndroidApp() ? 'Built-in YouTube fetch' : 'TuneBook Helper extension'}
        <FormFieldHelp
          title={SETTINGS_FIELD_HELP.youtubeHelper.title}
          body={SETTINGS_FIELD_HELP.youtubeHelper.body}
        />
      </h2>
      <p className="app-text-muted">
        {isAndroidApp()
          ? 'The Android app downloads YouTube audio on-device so pitch, filters, and caching work without a browser extension or resolver.'
          : 'Optional Chromium extension that loads audio in your browser so pitch, filters, and caching work without a resolver.'}
      </p>
      {isAndroidApp() ? (
        <>
          <p className="app-text-muted">
            {youtubeHelperStatus.checking
              ? 'Checking built-in YouTube fetch…'
              : youtubeHelperStatus.ok
                ? ('Built-in YouTube fetch: ready' +
                  (youtubeHelperStatus.version ? ' (v' + youtubeHelperStatus.version + ')' : ''))
                : 'Built-in YouTube fetch: unavailable'}
            {!youtubeHelperStatus.checking && !youtubeHelperStatus.ok && youtubeHelperStatus.error ? (
              <span> — {youtubeHelperStatus.error}</span>
            ) : null}
          </p>
          <div className="App-settings-actions" style={{ marginTop: '0.75rem' }}>
            <Button variant="outline-secondary" onClick={refreshYoutubeHelperStatus}>
              Refresh status
            </Button>
            <Button variant="outline-secondary" onClick={openBatteryOptimizationSettings}>
              Battery settings
            </Button>
          </div>
          <div style={{ marginTop: '1.25rem' }}>
            <AndroidLocalMediaSettingsSection />
          </div>
        </>
      ) : (
        <>
          <Form.Group className="mb-3">
            <Form.Check
              type="switch"
              id="youtube-helper-enabled"
              label="Use TuneBook Helper for media"
              checked={!youtubeHelperDisabled}
              onChange={function(e) {
                const enabled = e.target.checked
                setYoutubeHelperDisabled(!enabled)
                setYoutubeHelperDisabledState(!enabled)
              }}
            />
          </Form.Group>
          <div className="App-settings-resolver-status">
            <strong>
              {youtubeHelperDisabled
                ? 'TuneBook Helper: disabled in settings'
                : youtubeHelperStatus.checking
                  ? 'Checking TuneBook Helper…'
                  : youtubeHelperStatus.ok
                    ? ('TuneBook Helper: connected' +
                      (youtubeHelperStatus.version ? ' (v' + youtubeHelperStatus.version + ')' : ''))
                    : 'TuneBook Helper: not connected'}
            </strong>
            {!youtubeHelperDisabled && !youtubeHelperStatus.checking && !youtubeHelperStatus.ok && youtubeHelperStatus.error ? (
              <span className="app-text-muted"> — {youtubeHelperStatus.error}</span>
            ) : null}
          </div>
          <div className="App-settings-actions" style={{ marginTop: '0.75rem' }}>
            <Button variant="outline-secondary" onClick={refreshYoutubeHelperStatus} disabled={youtubeHelperDisabled}>
              Refresh Helper status
            </Button>
            <Button
              as="a"
              variant="primary"
              href={youtubeHelperZipHref}
              download="tunebook-helper.zip"
              style={{ color: '#fff', textDecoration: 'none' }}
            >
              Download TuneBook Helper
            </Button>
            <Button
              variant="outline-secondary"
              onClick={function() { setShowYoutubeHelperInstallHelp(true) }}
            >
              How to install
            </Button>
          </div>
          <FieldHelpModal
            show={showYoutubeHelperInstallHelp}
            title={SETTINGS_FIELD_HELP.youtubeHelperInstall.title}
            fields={SETTINGS_FIELD_HELP.youtubeHelperInstall.fields}
            onHide={function() { setShowYoutubeHelperInstallHelp(false) }}
          />
        </>
      )}
    </div>
  )
}
