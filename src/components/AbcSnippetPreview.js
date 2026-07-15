import { useEffect, useRef } from 'react'
import abcjs from 'abcjs'
import { abcFromPickerItem, buildAbcSnippet } from '../abcSnippetPreview'

function hasRenderableNotes(abc) {
  return String(abc || '').split(/\n/).some(function(line) {
    const trimmed = String(line || '').trim()
    if (!trimmed) return false
    if (/^[A-Za-z]:/.test(trimmed)) return false
    return true
  })
}

/**
 * Compact one-line abcjs staff for picker cards.
 */
export default function AbcSnippetPreview(props) {
  const hostRef = useRef(null)
  const abc = props.abc
    ? buildAbcSnippet(props.abc, { maxBars: props.maxBars || 8, metadata: props.metadata })
    : abcFromPickerItem(props.item, props.metadata)
  const canRender = hasRenderableNotes(abc)

  useEffect(function() {
    const host = hostRef.current
    if (!host) return undefined
    host.innerHTML = ''
    if (!canRender) {
      host.textContent = 'No preview'
      return undefined
    }
    let cancelled = false
    const raf = window.requestAnimationFrame(function() {
      if (cancelled || !hostRef.current) return
      const width = Math.max(180, (host.parentElement && host.parentElement.clientWidth) || 240)
      try {
        abcjs.renderAbc(host, abc, {
          add_classes: true,
          selectTypes: false,
          staffwidth: Math.max(280, width * 1.4),
          scale: 0.85,
          paddingtop: 2,
          paddingbottom: 2,
          paddingleft: 2,
          paddingright: 2,
        })
        const svg = host.querySelector('svg')
        if (svg) {
          svg.style.maxWidth = '100%'
          svg.style.height = 'auto'
          svg.style.display = 'block'
        }
      } catch (e) {
        host.textContent = 'Unable to render'
      }
    })
    return function() {
      cancelled = true
      window.cancelAnimationFrame(raf)
    }
  }, [abc, canRender])

  return (
    <div
      className={'abc-snippet-preview' + (canRender ? '' : ' abc-snippet-preview--empty text-muted small')}
      ref={hostRef}
      aria-hidden="true"
    />
  )
}
