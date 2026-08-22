import { Form } from 'react-bootstrap'
import { useEffect, useState } from 'react'
import FormFieldHelp from './FormFieldHelp'
import { SETTINGS_FIELD_HELP } from '../formFieldHelpText'
import useMediaResolverHealth from '../useMediaResolverHealth'
import { useCreditAffordance } from '../useCreditAffordance'
import { openCreditSettings } from '../resolverCreditAccess'
import { formatEstimateCents } from '../creditAffordabilityClient'
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

export default function VoiceSettingsSection(props) {
  const accessToken = props.accessToken || null
  const { available: resolverAvailable, features, status: resolverStatus } = useMediaResolverHealth()
  const ttsAffordance = useCreditAffordance(accessToken, 'tts_speech')
  const [settings, setSettings] = useState(loadVoiceSettings)
  const ttsAvailable = resolverAvailable && features.tts
  const billingEnabled = !!(resolverStatus && resolverStatus.billingEnabled)
  const cannotAffordTts = billingEnabled
    && ttsAffordance.checked
    && !ttsAffordance.creditUnlimited
    && !ttsAffordance.affordable

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

  function handleSpeakSongTitlesChange(event) {
    const checked = event.target.checked
    if (checked && cannotAffordTts) {
      openCreditSettings()
      return
    }
    setSettings(saveVoiceSettings({
      speakSongTitles: checked,
      speakArtistNames: checked ? settings.speakArtistNames : false,
    }))
  }

  function handleSpeakArtistNamesChange(event) {
    setSettings(saveVoiceSettings({ speakArtistNames: event.target.checked }))
  }

  return (
    <>
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

      <div className="app-surface-panel App-settings-section">
        <h2>
          Playlist announcements
          <FormFieldHelp
            title={SETTINGS_FIELD_HELP.speakSongTitles.title}
            body={SETTINGS_FIELD_HELP.speakSongTitles.body}
          />
        </h2>
        <p className="app-text-muted">
          Speak track titles while a playlist is playing.
        </p>
        {!ttsAvailable ? (
          <p className="app-text-muted small">
            Text-to-speech is not available from your resolver right now.
          </p>
        ) : null}
        {ttsAvailable && cannotAffordTts ? (
          <p className="app-text-muted small">
            Insufficient prepaid credit for title announcements
            {ttsAffordance.estimateCents != null
              ? ' (about ' + formatEstimateCents(ttsAffordance.estimateCents) + ' per announcement)'
              : ''}.
            <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={openCreditSettings}>
              Buy credit
            </button>
          </p>
        ) : null}
        <Form.Check
          type="checkbox"
          id="voice-speak-song-titles"
          label="Speak song titles"
          checked={settings.speakSongTitles === true}
          disabled={!ttsAvailable}
          onChange={handleSpeakSongTitlesChange}
          className="mb-2"
        />
        <Form.Check
          type="checkbox"
          id="voice-speak-artist-names"
          label="Speak artist names"
          checked={settings.speakArtistNames === true}
          disabled={settings.speakSongTitles !== true}
          onChange={handleSpeakArtistNamesChange}
        />
      </div>
    </>
  )
}
