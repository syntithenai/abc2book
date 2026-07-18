import { useEffect, useRef, useState } from 'react'
import useMusicBrainz from './useMusicBrainz'

/**
 * Debounced MusicBrainz artist name labels for caret typeaheads.
 * Returns { options: string[], loading: boolean }.
 */
export default function useMusicBrainzArtistOptions(query, options) {
  const opts = options || {}
  const enabled = opts.enabled !== false
  const delayMs = typeof opts.delayMs === 'number' ? opts.delayMs : 500
  const musicBrainz = useMusicBrainz()
  const [labels, setLabels] = useState([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef(null)
  const requestIdRef = useRef(0)

  useEffect(function() {
    if (!enabled) {
      setLabels([])
      setLoading(false)
      return undefined
    }
    const text = String(query || '').trim()
    if (!text) {
      setLabels([])
      setLoading(false)
      return undefined
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setLoading(true)
    timerRef.current = setTimeout(function() {
      musicBrainz.artistOptions(text).then(function(raw) {
        if (requestIdRef.current !== requestId) return
        const next = Array.isArray(raw)
          ? raw.map(function(item) { return item && item.label ? item.label : '' }).filter(Boolean)
          : []
        setLabels(next)
        setLoading(false)
      }).catch(function() {
        if (requestIdRef.current !== requestId) return
        setLabels([])
        setLoading(false)
      })
    }, delayMs)
    return function() {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // musicBrainz methods are recreated each render; query/enabled/delay drive refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, enabled, delayMs])

  return { options: labels, loading: loading }
}
