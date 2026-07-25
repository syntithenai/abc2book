import { useEffect, useRef, useState } from 'react'
import { Button, Form, Modal } from 'react-bootstrap'
import abcjs from 'abcjs'
import { fitNotationToWidth } from '../gigNotationFit'
import { applyBarSlotHighlights } from '../notationPreviewBarHighlights'

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

export function buildAbcFromTune(tune) {
  if (!tune) return ''
  const metadata = {
    meter: tune.meter || '4/4',
    noteLength: tune.noteLength || '1/8',
    key: tune.key || 'C',
  }
  if (tune.voices && typeof tune.voices === 'object' && Object.keys(tune.voices).length) {
    return buildAbcFromChoice({ value: { voices: tune.voices } }, metadata)
  }
  if (tune.notes != null && String(tune.notes).trim()) {
    return buildAbcFromChoice({ preview: String(tune.notes) }, metadata)
  }
  return ''
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

export function NotationPreview(props) {
  const wrapperRef = useRef(null)
  const hostRef = useRef(null)
  const abc = props.abc || ''
  const fitWidth = props.fitWidth !== false
  const wrapToWidth = props.wrapToWidth === true
  const maxHeight = props.maxHeight === undefined ? '50vh' : props.maxHeight
  const canRender = hasRenderableNotes(abc)
  const wrapClassName = props.className ? (' ' + props.className) : ''
  const mergePreviewHighlights = props.mergePreviewHighlights
  const highlightTune = props.highlightTune
  const highlightMeasuresPerLine = props.highlightMeasuresPerLine || 4

  useEffect(function() {
    const wrapper = wrapperRef.current
    const host = hostRef.current
    if (!wrapper || !host) return undefined
    host.innerHTML = ''
    if (!canRender) {
      host.textContent = 'No notation preview'
      return undefined
    }

    let lastWidth = 0
    let resizeRaf = null
    let cancelled = false

    function measureAvailWidth() {
      let el = wrapper
      for (let depth = 0; depth < 5 && el; depth += 1) {
        const measured = el.clientWidth
        if (measured >= 160) return Math.max(120, measured - 24)
        el = el.parentElement
      }
      return Math.max(120, wrapper.clientWidth - 24)
    }

    function renderAndFit() {
      if (cancelled) return
      host.innerHTML = ''
      const availW = Math.max(120, measureAvailWidth())
      const staffWidth = fitWidth ? availW : Math.max(480, availW)
      const renderOptions = {
        add_classes: true,
        selectTypes: false,
        staffwidth: staffWidth,
        scale: 1,
        paddingtop: wrapToWidth ? 12 : 10,
        paddingbottom: wrapToWidth ? 28 : 10,
        paddingleft: wrapToWidth ? 8 : 4,
        paddingright: wrapToWidth ? 16 : 4,
      }
      if (wrapToWidth) {
        renderOptions.wrap = {
          minSpacing: 1.6,
          maxSpacing: 2.8,
          preferredMeasuresPerLine: 4,
          lastLineLimit: 2,
        }
      }
      try {
        abcjs.renderAbc(host, abc, renderOptions)
        const svg = host.querySelector('svg')
        if (svg && wrapToWidth) {
          svg.style.maxWidth = '100%'
          svg.style.height = 'auto'
          svg.style.display = 'block'
          svg.style.overflow = 'visible'
        } else if (svg && fitWidth && availW > 0) {
          fitNotationToWidth(svg, host, availW)
        }
        if (mergePreviewHighlights && highlightTune) {
          applyBarSlotHighlights(host, mergePreviewHighlights, highlightTune, {
            measuresPerLine: highlightMeasuresPerLine,
          })
        }
        lastWidth = availW
      } catch (e) {
        host.textContent = 'Unable to render notation.'
      }
    }

    function scheduleRenderAndFit() {
      if (resizeRaf) cancelAnimationFrame(resizeRaf)
      resizeRaf = requestAnimationFrame(function() {
        resizeRaf = requestAnimationFrame(function() {
          resizeRaf = null
          const availW = Math.max(120, measureAvailWidth())
          if (Math.abs(availW - lastWidth) < 1) return
          renderAndFit()
        })
      })
    }

    if (wrapToWidth) {
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          if (!cancelled) renderAndFit()
        })
      })
    } else {
      renderAndFit()
    }

    if ((!fitWidth && !wrapToWidth) || typeof ResizeObserver === 'undefined') {
      return function() {
        cancelled = true
        if (resizeRaf) cancelAnimationFrame(resizeRaf)
      }
    }
    const observer = new ResizeObserver(function() {
      scheduleRenderAndFit()
    })
    observer.observe(wrapper)
    if (wrapper.parentElement) observer.observe(wrapper.parentElement)
    return function() {
      cancelled = true
      if (resizeRaf) cancelAnimationFrame(resizeRaf)
      observer.disconnect()
    }
  }, [abc, canRender, fitWidth, wrapToWidth, mergePreviewHighlights, highlightTune, highlightMeasuresPerLine])

  return (
    <div
      ref={wrapperRef}
      className={'suggestion-preview-notation-wrap' + wrapClassName}
      style={{ maxWidth: '100%', minWidth: 0, width: wrapToWidth ? '100%' : undefined }}
    >
      <div
        className={'suggestion-preview-notation' + (wrapToWidth ? ' suggestion-preview-notation--wrap' : '')}
        style={{
          overflowX: wrapToWidth ? 'visible' : 'hidden',
          overflowY: maxHeight ? 'auto' : (wrapToWidth ? 'visible' : 'visible'),
          maxHeight: maxHeight || undefined,
          minHeight: wrapToWidth ? '12rem' : '8rem',
          maxWidth: '100%',
          width: wrapToWidth ? '100%' : undefined,
          border: '1px solid #ced4da',
          borderRadius: '0.375rem',
          padding: '0.5rem',
          background: '#fff',
          boxSizing: 'border-box',
        }}
        ref={hostRef}
        aria-label="Notation preview"
      />
    </div>
  )
}

/**
 * Preview dialog before applying lyrics or notation suggestion choices.
 * Lyrics are editable; confirming uses the draft text for the review decision.
 */
export default function SuggestionPreviewDialog(props) {
  const kind = props.kind === 'notation' ? 'notation' : 'lyrics'
  const choice = props.choice
  const show = !!props.show && !!choice
  const [lyricsDraft, setLyricsDraft] = useState('')
  const lyricsRef = useRef(null)

  useEffect(function() {
    if (!show || kind !== 'lyrics') return
    setLyricsDraft(lyricsTextFromChoice(choice))
  }, [show, kind, choice])

  useEffect(function() {
    if (!show || kind !== 'lyrics') return undefined
    const timer = setTimeout(function() {
      if (lyricsRef.current) lyricsRef.current.focus()
    }, 50)
    return function() { clearTimeout(timer) }
  }, [show, kind, choice])

  const title = kind === 'notation' ? 'Preview notation' : 'Preview lyrics'
  const body = kind === 'notation'
    ? (
      <NotationPreview
        abc={buildAbcFromChoice(choice, props.metadata)}
      />
    )
    : (
      <Form.Control
        as="textarea"
        ref={lyricsRef}
        className="suggestion-preview-lyrics"
        aria-label="Edit lyrics"
        value={lyricsDraft}
        onChange={function(event) { setLyricsDraft(event.target.value) }}
        rows={16}
        style={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: '50vh',
          fontFamily: 'inherit',
          resize: 'vertical',
        }}
      />
    )

  function handleConfirm() {
    if (typeof props.onConfirm !== 'function') return
    if (kind === 'lyrics') {
      props.onConfirm(lyricsDraft)
      return
    }
    props.onConfirm()
  }

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
        <Button variant="primary" onClick={handleConfirm}>Use this value</Button>
      </Modal.Footer>
    </Modal>
  )
}

export { buildAbcFromChoice, lyricsTextFromChoice }
