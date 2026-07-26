import { useMemo, useRef, useState } from 'react'
import { Button, Form, FormControl, InputGroup } from 'react-bootstrap'
import { icons } from '../Icons'
import {
  blurInputTarget,
  findAutosuggestOptionMatch,
  isAutosuggestOptionPick,
  isAutosuggestReplacementEvent,
} from '../autosuggestInputUtils'
import useMusicBrainzArtistOptions from '../useMusicBrainzArtistOptions'
import CollapsibleButtonRow from './CollapsibleButtonRow'
import FieldSearchResultsCaret from './FieldSearchResultsCaret'

const DEFAULT_VISIBLE_CHIPS = 2

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

function prependUnique(existing, nextItems) {
  const result = []
  const seen = {}
  nextItems.forEach(function(item) {
    const key = item.toLowerCase()
    if (seen[key]) return
    seen[key] = true
    result.push(item)
  })
  existing.forEach(function(item) {
    const key = item.toLowerCase()
    if (seen[key]) return
    seen[key] = true
    result.push(item)
  })
  return result
}

function candidateLabel(candidate) {
  if (typeof candidate === 'string') return candidate
  return String(
    (candidate && (candidate.artist || candidate.alias || candidate.album || candidate.genre || candidate.title))
    || ''
  ).trim()
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
  const visibleChipLimit = typeof props.visibleChipLimit === 'number'
    ? props.visibleChipLimit
    : DEFAULT_VISIBLE_CHIPS
  const searchResults = Array.isArray(props.searchResults) ? props.searchResults : []
  const searchResultCandidates = Array.isArray(props.searchResultCandidates)
    ? props.searchResultCandidates
    : null
  const onOpenSearchResults = typeof props.onOpenSearchResults === 'function'
    ? props.onOpenSearchResults
    : null
  const onSelectItem = typeof props.onSelectItem === 'function' ? props.onSelectItem : null
  const [draft, setDraft] = useState('')
  const [searchDraft, setSearchDraft] = useState('')
  const [suggestSuppressed, setSuggestSuppressed] = useState(false)
  const inputRef = useRef(null)
  const datalistId = useMemo(function() {
    return controlId + '-suggestions'
  }, [controlId])
  const musicBrainz = useMusicBrainzArtistOptions(searchDraft, {
    enabled: musicBrainzSuggest && !suggestSuppressed && String(searchDraft || '').trim().length > 0,
  })
  const mbOptions = musicBrainz.options || []
  const suggestLoading = !!(props.loading || (musicBrainz.loading
    && !suggestSuppressed
    && String(searchDraft || '').trim().length > 0))
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

  function clearDraftInput() {
    setDraft('')
    setSearchDraft('')
    setSuggestSuppressed(true)
  }

  function addItemsImmediately(nextItems) {
    const cleaned = nextItems.map(function(item) { return String(item || '').trim() }).filter(Boolean)
    if (!cleaned.length) return
    emit(prependUnique(items, cleaned))
    clearDraftInput()
    if (inputRef.current && typeof inputRef.current.blur === 'function') {
      inputRef.current.blur()
    }
  }

  function commitDraft(text) {
    addItemsImmediately(splitDraftText(text != null ? text : draft))
  }

  function removeItem(index) {
    emit(items.filter(function(_item, i) { return i !== index }))
  }

  function applySearchCandidate(candidate) {
    const name = candidateLabel(candidate)
    if (!name) return
    addItemsImmediately([name])
    if (typeof onOpenSearchResults === 'function') {
      onOpenSearchResults([candidate])
    }
  }

  function handleDraftChange(e) {
    const value = e.target.value
    const matched = findAutosuggestOptionMatch(value, autosuggestOptions)
    const fromAutosuggest = isAutosuggestReplacementEvent(e)
      || isAutosuggestOptionPick(value, searchDraft, autosuggestOptions)
    if (fromAutosuggest && matched) {
      addItemsImmediately([matched])
      blurInputTarget(e)
      return
    }
    setSuggestSuppressed(false)
    setDraft(value)
    setSearchDraft(value)
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
        <div role="list" aria-label={label || 'Selected values'}>
          <CollapsibleButtonRow
            className="tune-chip-list"
            items={items}
            limit={visibleChipLimit}
          renderItem={function(item, index) {
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
          }}
          />
        </div>
      ) : null}
      <div className="tune-chip-list-input-row">
        <InputGroup>
          <FormControl
            ref={inputRef}
            value={draft}
            placeholder={placeholder}
            list={autosuggestOptions.length > 0 ? datalistId : undefined}
            onChange={handleDraftChange}
            onKeyDown={function(e) {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitDraft()
                return
              }
              if (e.key === 'Backspace' && !draft && items.length > 0) {
                e.preventDefault()
                removeItem(0)
              }
            }}
            onPaste={function(e) {
              const pasted = e.clipboardData && e.clipboardData.getData('text')
              if (!pasted || pasted.indexOf(',') < 0) return
              e.preventDefault()
              addItemsImmediately(splitDraftText(draft + pasted))
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
