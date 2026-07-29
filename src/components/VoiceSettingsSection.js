import { Form } from 'react-bootstrap'
import { useEffect, useState } from 'react'
import FormFieldHelp from './FormFieldHelp'
import { SETTINGS_FIELD_HELP } from '../formFieldHelpText'
import useMediaResolverHealth from '../useMediaResolverHealth'
import {
  loadVoiceSettings,
  saveVoiceSettings,
} from '../voiceSettings'

const INPUT_MODE_OPTIONS = [
  {
    value: 'tap',
    label: 'Tap to speak',
    description: 'Tap to start. Tap again or stop speaking to finish.',
  },
  {
    value: 'hold',
    label: 'Hold to speak',
    description: 'Hold the mic button while speaking.',
  },
]

export default function VoiceSettingsSection() {
  const { available: resolverAvailable, features } = useMediaResolverHealth()
  const [settings, setSettings] = useState(loadVoiceSettings)

  useEffect(function() {
    function handleChange() {
      setSettings(loadVoiceSettings())
    }
    window.addEventListener('voiceSettingsChanged', handleChange)
    return function() {
      window.removeEventListener('voiceSettingsChanged', handleChange)
    }
  }, [])

  function handleInputModeChange(mode) {
    setSettings(saveVoiceSettings({ inputMode: mode }))
  }

  return (
    <div className="app-surface-panel App-settings-section">
      <h2>
        Voice input
        <FormFieldHelp
          title={SETTINGS_FIELD_HELP.voiceInputMode.title}
          body={SETTINGS_FIELD_HELP.voiceInputMode.body}
        />
      </h2>
      <p className="app-text-muted">
        Choose how the microphone buttons work in the header and form fields.
        Voice commands need a resolver with Whisper enabled — configure that under Providers.
      </p>
      {!resolverAvailable || !features.whisper ? (
        <p className="app-text-muted small">
          Whisper is not available from your resolver right now, so voice buttons are hidden.
        </p>
      ) : null}
      <Form role="radiogroup" aria-label="Voice input mode">
        {INPUT_MODE_OPTIONS.map(function(option) {
          const selected = settings.inputMode === option.value
          return (
            <Form.Check
              key={option.value}
              type="radio"
              id={'voice-input-mode-' + option.value}
              name="voice-input-mode"
              label={(
                <span>
                  <strong>{option.label}</strong>
                  <span className="d-block small text-muted">{option.description}</span>
                </span>
              )}
              checked={selected}
              onChange={function() { handleInputModeChange(option.value) }}
              className="mb-2"
            />
          )
        })}
      </Form>
    </div>
  )
}
