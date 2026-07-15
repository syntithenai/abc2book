import { useEffect, useRef } from 'react'
import { Button, Modal } from 'react-bootstrap'
import abcjs from 'abcjs'

function hasRenderableNotes(abc) {
  return String(abc || '').split(/\n/).some(function(line) {
    const trimmed = String(line || '').trim()
    if (!trimmed) return false
    if (/^[A-Za-z]:/.test(trimmed)) return false
    return true
  })
}

function buildAbcFromChoice(choice, metadata) {
  if (!choice) return ''
  const value = choice.value
  if (typeof value === 'string' && value.indexOf('X:') >= 0) return value
  if (value && typeof value === 'object') {
    if (typeof value.abc === 'string' && value.abc.trim()) return value.abc
    if (value.voices) {
      const meta = metadata || {}
      const lines = [
        'X:1',
        'M:' + (meta.meter || '4/4'),
        'L:' + (meta.noteLength || '1/8'),
        'K:' + (meta.key || 'C'),
      ]
      Object.keys(value.voices).sort().forEach(function(key) {
        const voice = value.voices[key] || {}
        const notes = Array.isArray(voice.notes) ? voice.notes.join('\n') : String(voice.notes || '')
        if (Object.keys(value.voices).length > 1) {
          lines.push('V:' + key + (voice.meta ? ' ' + voice.meta : ''))
        }
        String(notes || '').split(/\r?\n/).forEach(function(line) {
          if (String(line || '').trim()) lines.push(line)
        })
      })
      return lines.join('\n')
    }
  }
  if (typeof choice.preview === 'string' && choice.preview.indexOf('|') >= 0) {
    const meta = metadata || {}
    return [
      'X:1',
      'M:' + (meta.meter || '4/4'),
      'L:' + (meta.noteLength || '1/8'),
      'K:' + (meta.key || 'C'),
      String(choice.preview),
    ].join('\n')
  }
  return typeof choice.preview === 'string' ? choice.preview : ''
}

function lyricsTextFromChoice(choice) {
  if (!choice) return ''
  const value = choice.value
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.join('\n')
  if (value && typeof value === 'object') {
    if (typeof value.text === 'string') return value.text
    if (Array.isArray(value.lines)) return value.lines.join('\n')
  }
  return choice.preview != null ? String(choice.preview) : ''
}

function NotationPreview(props) {
  const hostRef = useRef(null)
  const abc = props.abc || ''
  const canRender = hasRenderableNotes(abc)

  useEffect(function() {
    const host = hostRef.current
    if (!host) return undefined
    host.innerHTML = ''
    if (!canRender) {
      host.textContent = 'No notation preview'
      return undefined
    }
    try {
      abcjs.renderAbc(host, abc, {
        add_classes: true,
        selectTypes: false,
        staffwidth: Math.max(480, (host.parentElement && host.parentElement.clientWidth) || 480),
        scale: 1,
        paddingtop: 10,
        paddingbottom: 10,
        paddingleft: 4,
        paddingright: 4,
      })
    } catch (e) {
      host.textContent = 'Unable to render notation.'
    }
    return undefined
  }, [abc, canRender])

  return (
    <div
      className="suggestion-preview-notation"
      style={{ overflow: 'auto', maxHeight: '50vh', minHeight: '8rem', border: '1px solid #ced4da', borderRadius: '0.375rem', padding: '0.5rem', background: '#fff' }}
      ref={hostRef}
      aria-label="Notation preview"
    />
  )
}

/**
 * Preview dialog before applying lyrics or notation suggestion choices.
 */
export default function SuggestionPreviewDialog(props) {
  const kind = props.kind === 'notation' ? 'notation' : 'lyrics'
  const choice = props.choice
  const show = !!props.show && !!choice

  const title = kind === 'notation' ? 'Preview notation' : 'Preview lyrics'
  const body = kind === 'notation'
    ? (
      <NotationPreview
        abc={buildAbcFromChoice(choice, props.metadata)}
      />
    )
    : (
      <pre
        className="suggestion-preview-lyrics"
        style={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: '50vh',
          overflow: 'auto',
          margin: 0,
          padding: '0.75rem',
          border: '1px solid #ced4da',
          borderRadius: '0.375rem',
          background: '#f8f9fa',
        }}
      >
        {lyricsTextFromChoice(choice) || '(empty)'}
      </pre>
    )

  return (
    <Modal show={show} onHide={props.onCancel} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {choice && choice.source ? (
          <div className="text-muted small mb-2">Source: {String(choice.source)}</div>
        ) : null}
        {choice && choice.label ? (
          <div className="fw-semibold mb-2">{String(choice.label)}</div>
        ) : null}
        {body}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={props.onCancel}>Cancel</Button>
        <Button variant="primary" onClick={props.onConfirm}>Use this value</Button>
      </Modal.Footer>
    </Modal>
  )
}

export { buildAbcFromChoice, lyricsTextFromChoice }
