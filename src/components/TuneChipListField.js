import { useMemo, useState } from 'react'
import { Button, Form, FormControl, InputGroup } from 'react-bootstrap'
import { icons } from '../Icons'
import useMusicBrainzArtistOptions from '../useMusicBrainzArtistOptions'
import FieldSearchResultsCaret from './FieldSearchResultsCaret'

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

/**
 * Free-text chip list: type a value, press Enter (or click Add) to create a
 * labeled chip with a delete control. onChange always receives a string[].
 *
 * MusicBrainz (and optional searchResults string[]) feed the datalist for typing
 * discovery only. Cached field-search hits reopen via FieldSearchResultsCaret
 * when searchResultCandidates + onOpenSearchResults are provided.
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
  // Typing discovery only (e.g. MusicBrainz). Do not inject field-search cache here.
  const searchResults = Array.isArray(props.searchResults) ? props.searchResults : []
  const searchResultCandidates = Array.isArray(props.searchResultCandidates)
    ? props.searchResultCandidates
    : null
  const onOpenSearchResults = typeof props.onOpenSearchResults === 'function'
    ? props.onOpenSearchResults
    : null
  const onSelectItem = typeof props.onSelectItem === 'function' ? props.onSelectItem : null
  const [draft, setDraft] = useState('')
  const datalistId = useMemo(function() {
    return controlId + '-suggestions'
  }, [controlId])
  const musicBrainz = useMusicBrainzArtistOptions(draft, { enabled: musicBrainzSuggest })
  const mbOptions = musicBrainz.options || []
  const suggestLoading = !!(props.loading || musicBrainz.loading)
  const autosuggestOptions = []
  const seenOpts = {}
  items.forEach(function(item) {
    seenOpts[item.toLowerCase()] = true
  })
  searchResults.concat(mbOptions).forEach(function(option) {
    const text = String(option || '').trim()
    if (!text) return
    const key = text.toLowerCase()
    if (seenOpts[key]) return
    seenOpts[key] = true
    autosuggestOptions.push(text)
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

  function applySearchCandidate(candidate) {
    const name = typeof candidate === 'string'
      ? candidate
      : String((candidate && (candidate.artist || candidate.alias || candidate.title)) || '').trim()
    if (!name) return
    if (typeof onOpenSearchResults === 'function') {
      onOpenSearchResults([candidate])
      return
    }
    commitDraft(name)
  }

  const searchCaret = (Array.isArray(searchResultCandidates) && searchResultCandidates.length > 0)
    ? (
      <FieldSearchResultsCaret
        candidates={searchResultCandidates}
        className="chip-list-options-dropdown"
        onSelect={applySearchCandidate}
        aria-label="Cached search results"
        data-testid="chip-list-search-results-caret"
      />
    )
    : null

  return (
    <Form.Group className={className} controlId={controlId}>
      {label ? <Form.Label>{label}</Form.Label> : null}
      {items.length > 0 ? (
        <div className="tune-chip-list" role="list" aria-label={label || 'Selected values'}>
          {items.map(function(item, index) {
            return (
              <span key={item + ':' + index} className="tune-chip-list-item" role="listitem">
                {onSelectItem ? (
                  <button
                    type="button"
                    className="tune-chip-list-label tune-chip-list-label-button"
                    title={'Search YouTube for ' + item}
                    data-testid="chip-list-select-item"
                    onClick={function() { onSelectItem(item, index) }}
                  >
                    {item}
                  </button>
                ) : (
                  <span className="tune-chip-list-label">{item}</span>
                )}
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
            list={autosuggestOptions.length > 0 ? datalistId : undefined}
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
          {suggestLoading ? (
            <InputGroup.Text
              className="select-input-loading-icon"
              aria-label="Loading suggestions"
              data-testid="chip-list-loading"
            >
              {icons.waiting}
            </InputGroup.Text>
          ) : null}
          {autosuggestOptions.length > 0 ? (
            <datalist id={datalistId}>
              {autosuggestOptions.map(function(option) {
                return <option key={option} value={option} />
              })}
            </datalist>
          ) : null}
          {searchCaret}
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
