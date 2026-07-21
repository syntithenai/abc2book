import { useEffect, useRef } from 'react'
import abcjs from 'abcjs'

function hasRenderableNotes(abc) {
  return String(abc || '').split(/\n/).some(function(line) {
    const trimmed = String(line || '').trim()
    if (!trimmed) return false
    if (/^[A-Za-z]:/.test(trimmed)) return false
    return true
  })
}

/**
 * Full-height abcjs render for theory lesson examples (no bar clipping).
 */
export default function TheoryLessonNotation(props) {
  const hostRef = useRef(null)
  const abc = String(props.abc || '').trim()
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
      const width = Math.max(280, (host.parentElement && host.parentElement.clientWidth) || 320)
      try {
        abcjs.renderAbc(host, abc, {
          add_classes: true,
          selectTypes: false,
          staffwidth: width,
          scale: props.compact ? 0.92 : 1,
          paddingtop: 6,
          paddingbottom: 8,
          paddingleft: 4,
          paddingright: 4,
          wrap: {
            minSpacing: 1.6,
            maxSpacing: 2.8,
            preferredMeasuresPerLine: props.measuresPerLine || 4,
            lastLineLimit: 2,
          },
        })
        const svg = host.querySelector('svg')
        if (svg) {
          svg.style.maxWidth = '100%'
          svg.style.width = '100%'
          svg.style.height = 'auto'
          svg.style.display = 'block'
        }
      } catch (e) {
        host.textContent = 'Unable to render notation'
      }
    })
    return function() {
      cancelled = true
      window.cancelAnimationFrame(raf)
    }
  }, [abc, canRender, props.compact, props.measuresPerLine])

  return (
    <div
      className={'theory-lesson-notation' + (canRender ? '' : ' theory-lesson-notation--empty text-muted small')}
      data-testid="theory-lesson-notation"
      ref={hostRef}
    />
  )
}
