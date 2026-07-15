import { useState } from 'react'
import { Button, Dropdown, DropdownButton, Form, FormControl, InputGroup } from 'react-bootstrap'
import useMusicBrainzArtistOptions from '../useMusicBrainzArtistOptions'

function normalizeItems(value) {
  if (!Array.isArray(value)) return []
  return value.map(function(item) {
    return String(item || '').trim()
  }).filter(Boolean)
}

function splitDraftText(text) {
  return String(text || '')
    .split(',')
    .map(function(item) { return item.trim() })
    .filter(Boolean)
}

function mergeUnique(existing, nextItems) {
  const result = existing.slice()
  const seen = {}
  result.forEach(function(item) {
    seen[item.toLowerCase()] = true
  })
  nextItems.forEach(function(item) {
    const key = item.toLowerCase()
    if (seen[key]) return
    seen[key] = true
    result.push(item)
  })
  return result
}

const CARET_TITLE = (
  <span aria-hidden="true" style={{ display: 'inline-block', lineHeight: 1 }}>▾</span>
)

/**
 * Free-text chip list: type a value, press Enter (or click Add) to create a
 * labeled chip with a delete control. onChange always receives a string[].
 */
export default function TuneChipListField(props) {
  const items = normalizeItems(props.value)
  const onChange = props.onChange
  const controlId = props.controlId || 'chip-list'
  const className = props.className || 'mb-3'
  const label = props.label
  const placeholder = props.placeholder || 'Type a value and press Enter'
  const addLabel = props.addLabel || 'Add'
  const musicBrainzSuggest = !!props.musicBrainzSuggest
  const endAppend = props.endAppend || null
  const suggestOptions = Array.isArray(props.suggestOptions) ? props.suggestOptions : []
  const [draft, setDraft] = useState('')
  const mbOptions = useMusicBrainzArtistOptions(draft, { enabled: musicBrainzSuggest })
  const dropdownOptions = []
  const seenOpts = {}
  suggestOptions.concat(mbOptions).forEach(function(option) {
    const text = String(option || '').trim()
    if (!text) return
    const key = text.toLowerCase()
    if (seenOpts[key]) return
    seenOpts[key] = true
    dropdownOptions.push(text)
  })

  function emit(next) {
    if (typeof onChange === 'function') onChange(next)
  }

  function commitDraft(text) {
    const nextItems = splitDraftText(text != null ? text : draft)
    if (nextItems.length === 0) return
    emit(mergeUnique(items, nextItems))
    setDraft('')
  }

  function removeItem(index) {
    emit(items.filter(function(_item, i) { return i !== index }))
  }

  return (
    <Form.Group className={className} controlId={controlId}>
      {label ? <Form.Label>{label}</Form.Label> : null}
      {items.length > 0 ? (
        <div className="tune-chip-list" role="list" aria-label={label || 'Selected values'}>
          {items.map(function(item, index) {
            return (
              <span key={item + ':' + index} className="tune-chip-list-item" role="listitem">
                <span className="tune-chip-list-label">{item}</span>
                <button
                  type="button"
                  className="tune-chip-list-remove"
                  aria-label={'Remove ' + item}
                  onClick={function() { removeItem(index) }}
                >
                  ×
                </button>
              </span>
            )
          })}
        </div>
      ) : null}
      <div className="tune-chip-list-input-row">
        <InputGroup>
          <FormControl
            value={draft}
            placeholder={placeholder}
            onChange={function(e) { setDraft(e.target.value) }}
            onKeyDown={function(e) {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitDraft()
                return
              }
              if (e.key === 'Backspace' && !draft && items.length > 0) {
                e.preventDefault()
                removeItem(items.length - 1)
              }
            }}
            onBlur={function() {
              if (String(draft || '').trim()) commitDraft()
            }}
            onPaste={function(e) {
              const pasted = e.clipboardData && e.clipboardData.getData('text')
              if (!pasted || pasted.indexOf(',') < 0) return
              e.preventDefault()
              const nextItems = splitDraftText(draft + pasted)
              if (nextItems.length === 0) return
              emit(mergeUnique(items, nextItems))
              setDraft('')
            }}
          />
          {dropdownOptions.length > 0 ? (
            <DropdownButton
              variant="outline-secondary"
              className="chip-list-options-dropdown"
              title={CARET_TITLE}
              align="end"
              onSelect={function(option) { commitDraft(option) }}
              aria-label="Artist suggestions"
              data-testid="chip-list-musicbrainz-dropdown"
            >
              {dropdownOptions.map(function(option) {
                return (
                  <Dropdown.Item key={option} eventKey={option}>
                    {option}
                  </Dropdown.Item>
                )
              })}
            </DropdownButton>
          ) : null}
          {endAppend}
          <Button
            type="button"
            variant="outline-secondary"
            className="tune-chip-list-add"
            disabled={!String(draft || '').trim()}
            onClick={function() { commitDraft() }}
          >
            {addLabel}
          </Button>
        </InputGroup>
      </div>
    </Form.Group>
  )
}
