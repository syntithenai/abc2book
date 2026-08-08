import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Spinner } from 'react-bootstrap'
import { fetchViaMediaProxy } from '../mediaProxyClient'
import { getActiveResolverAccessToken } from '../mediaResolverHealthStore'
import { resolveResolverAccessToken } from '../resolverAccessToken'
import { clearActiveCollectionPlayer, registerActiveCollectionPlayer } from '../musicCollectionStreamPlayerState'
import { musicCollectionPlaybackProxyPathFromUri } from '../musicCollectionLinkUtils'

function buildProxyPath(path) {
  const rel = String(path || '').trim()
  if (!rel) return ''
  const base = rel.indexOf('/music-collection/') === 0
    ? rel
    : '/music-collection/' + rel.split('/').map(encodeURIComponent).join('/')
  return musicCollectionPlaybackProxyPathFromUri(base)
}

export default function MusicCollectionStreamPlayer(props) {
  const path = String(props.path || '').trim()
  const compact = props.compact !== false
  const [src, setSrc] = useState('')
  const [loading, setLoading] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState('')
  const audioRef = useRef(null)
  const objectUrlRef = useRef('')

  const stopPlayback = useCallback(function() {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    setPlaying(false)
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = ''
    }
    setSrc('')
    setLoading(false)
  }, [])

  useEffect(function() {
    return function() {
      clearActiveCollectionPlayer(stopPlayback)
      stopPlayback()
    }
  }, [stopPlayback])

  useEffect(function() {
    stopPlayback()
    setError('')
  }, [path, stopPlayback])

  async function handlePlay() {
    if (!path) return
    if (src && audioRef.current) {
      registerActiveCollectionPlayer(stopPlayback)
      try {
        await audioRef.current.play()
        setPlaying(true)
      } catch (e) {
        setError('Playback blocked')
      }
      return
    }
    setLoading(true)
    setError('')
    const proxyPath = buildProxyPath(path)
    const token = resolveResolverAccessToken(props.token) || getActiveResolverAccessToken() || ''
    try {
      const response = await fetchViaMediaProxy(proxyPath, token)
      const blob = await response.blob()
      if (!blob || !blob.size) throw new Error('Empty audio')
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      const objectUrl = URL.createObjectURL(blob)
      objectUrlRef.current = objectUrl
      setSrc(objectUrl)
      registerActiveCollectionPlayer(stopPlayback)
      setTimeout(function() {
        const audio = audioRef.current
        if (!audio) return
        audio.play().then(function() {
          setPlaying(true)
        }).catch(function() {
          setError('Playback blocked')
        })
      }, 0)
    } catch (e) {
      setError(e && e.message ? e.message : 'Could not load audio')
    } finally {
      setLoading(false)
    }
  }

  function handleStop() {
    clearActiveCollectionPlayer(stopPlayback)
    stopPlayback()
  }

  if (!path) return null

  if (compact) {
    return (
      <div className="d-flex align-items-center gap-2" style={props.style}>
        {loading ? <Spinner animation="border" size="sm" /> : null}
        {!playing ? (
          <Button size="sm" variant="outline-secondary" disabled={loading} onClick={handlePlay}>
            Play
          </Button>
        ) : (
          <Button size="sm" variant="outline-secondary" onClick={handleStop}>
            Stop
          </Button>
        )}
        {error ? <span className="small text-danger">{error}</span> : null}
        {src ? (
          <audio
            ref={audioRef}
            preload="none"
            src={src}
            onEnded={handleStop}
            style={{ display: 'none' }}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div style={props.style}>
      {src ? (
        <audio
          ref={audioRef}
          controls
          preload="none"
          src={src}
          onEnded={function() { setPlaying(false) }}
          style={{ width: '100%' }}
        />
      ) : (
        <Button size="sm" variant="outline-secondary" disabled={loading} onClick={handlePlay}>
          {loading ? 'Loading…' : 'Load & play'}
        </Button>
      )}
      {error ? <div className="small text-danger mt-1">{error}</div> : null}
    </div>
  )
}
