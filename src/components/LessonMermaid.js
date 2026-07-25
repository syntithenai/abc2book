import { useEffect, useRef } from 'react'

const MERMAID_SCRIPT = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js'
let mermaidPromise = null

function loadMermaid() {
  if (typeof window !== 'undefined' && window.mermaid) {
    return Promise.resolve(window.mermaid)
  }
  if (!mermaidPromise) {
    mermaidPromise = new Promise(function(resolve, reject) {
      if (typeof document === 'undefined') {
        reject(new Error('Mermaid requires a browser environment'))
        return
      }
      const existing = document.querySelector('script[data-lesson-mermaid="1"]')
      if (existing) {
        existing.addEventListener('load', function() { resolve(window.mermaid) })
        existing.addEventListener('error', reject)
        return
      }
      const script = document.createElement('script')
      script.src = MERMAID_SCRIPT
      script.async = true
      script.dataset.lessonMermaid = '1'
      script.onload = function() {
        if (window.mermaid) {
          window.mermaid.initialize({
            startOnLoad: false,
            theme: 'neutral',
            securityLevel: 'strict',
          })
          resolve(window.mermaid)
          return
        }
        reject(new Error('Mermaid failed to load'))
      }
      script.onerror = function() {
        reject(new Error('Mermaid script failed to load'))
      }
      document.head.appendChild(script)
    })
  }
  return mermaidPromise
}

export default function LessonMermaid(props) {
  const containerRef = useRef(null)
  const chart = String(props.chart || '').trim()
  const renderId = useRef('lesson-mermaid-' + Math.random().toString(36).slice(2))

  useEffect(function() {
    if (!chart || !containerRef.current) return
    let cancelled = false
    loadMermaid().then(function(mermaid) {
      if (cancelled || !containerRef.current) return
      return mermaid.render(renderId.current, chart)
    }).then(function(result) {
      if (cancelled || !containerRef.current || !result) return
      containerRef.current.innerHTML = result.svg
    }).catch(function() {
      if (!cancelled && containerRef.current) {
        containerRef.current.textContent = chart
      }
    })
    return function() {
      cancelled = true
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [chart])

  if (!chart) return null
  return <div className="lesson-mermaid" ref={containerRef} data-testid="lesson-mermaid" />
}
