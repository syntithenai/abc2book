import { useEffect, useMemo, useRef, useState } from 'react'
import { Form, InputGroup } from 'react-bootstrap'
import { icons } from '../Icons'
import {
  blurInputTarget,
  findAutosuggestOptionMatch,
  isAutosuggestOptionPick,
  isAutosuggestReplacementEvent,
} from '../autosuggestInputUtils'
import { buildComposerAutosuggestOptions } from '../composerDiscoveryUtils'
import useMusicBrainzArtistOptions from '../useMusicBrainzArtistOptions'
import VoiceFillInput from './VoiceFillInput'

/**
 * Plain editable composer text field with MusicBrainz datalist suggestions.
 */
export default function ComposerNameInput({
  value,
  onChange,
  controlId = 'composer',
  placeholder = 'Type composer name',
  token,
  setBlockKeyboardShortcuts,
  className,
}) {
  const text = value == null ? '' : String(value)
  const [searchDraft, setSearchDraft] = useState('')
  const [suggestSuppressed, setSuggestSuppressed] = useState(false)
  const typedLocallyRef = useRef(false)
  const datalistId = useMemo(function() {
    return controlId + '-composer-suggestions'
  }, [controlId])
  const musicBrainz = useMusicBrainzArtistOptions(searchDraft, {
    enabled: !suggestSuppressed && String(searchDraft || '').trim().length > 0,
  }) || { options: [], loading: false }
  const options = useMemo(function() {
    return buildComposerAutosuggestOptions(musicBrainz.options || [], searchDraft)
  }, [musicBrainz.options, searchDraft])

  useEffect(function() {
    if (typedLocallyRef.current) {
      typedLocallyRef.current = false
      return
    }
    setSearchDraft('')
    setSuggestSuppressed(true)
  }, [text])

  function commitPickedValue(e) {
    setSuggestSuppressed(true)
    setSearchDraft('')
    typedLocallyRef.current = false
    if (typeof onChange === 'function') onChange(e)
    blurInputTarget(e)
  }

  function handleChange(e) {
    const valueText = e.target.value
    const picked = findAutosuggestOptionMatch(valueText, options)
    const fromAutosuggest = isAutosuggestReplacementEvent(e)
      || isAutosuggestOptionPick(valueText, searchDraft, options)
    if (fromAutosuggest && picked) {
      commitPickedValue(e)
      return
    }
    typedLocallyRef.current = true
    setSuggestSuppressed(false)
    setSearchDraft(valueText)
    if (typeof onChange === 'function') onChange(e)
  }

  const inputProps = {
    type: 'text',
    placeholder: placeholder,
    value: text,
    list: options.length > 0 ? datalistId : undefined,
    onChange: handleChange,
    className: className,
  }

  const showLoading = musicBrainz.loading
    && !suggestSuppressed
    && String(searchDraft || '').trim().length > 0

  return (
    <>
      <InputGroup>
        {token ? (
          <VoiceFillInput
            {...inputProps}
            id={controlId}
            fieldKind="composer"
            token={token}
            setBlockKeyboardShortcuts={setBlockKeyboardShortcuts}
          />
        ) : (
          <Form.Control {...inputProps} id={controlId} />
        )}
        {showLoading ? (
          <InputGroup.Text
            className="select-input-loading-icon"
            aria-label="Loading suggestions"
            data-testid="composer-name-loading"
          >
            {icons.waiting}
          </InputGroup.Text>
        ) : null}
      </InputGroup>
      {options.length > 0 ? (
        <datalist id={datalistId}>
          {options.map(function(option) {
            return <option key={option} value={option} />
          })}
        </datalist>
      ) : null}
    </>
  )
}
