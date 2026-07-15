import { useState } from 'react'
import { Button, Form } from 'react-bootstrap'

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
 */
export default function TuneChipListField(props) {
  const items = normalizeItems(props.value)
  const onChange = props.onChange
  const controlId = props.controlId || 'chip-list'
  const className = props.className || 'mb-3'
  const label = props.label
  const placeholder = props.placeholder || 'Type a value and press Enter'
  const addLabel = props.addLabel || 'Add'
  const [draft, setDraft] = useState('')

  function emit(next) {
    if (typeof onChange === 'function') onChange(next)
  }

  function commitDraft() {
    const nextItems = splitDraftText(draft)
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
        <Form.Control
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
        <Button
          type="button"
          variant="outline-secondary"
          className="tune-chip-list-add"
          disabled={!String(draft || '').trim()}
          onClick={commitDraft}
        >
          {addLabel}
        </Button>
      </div>
    </Form.Group>
  )
}
