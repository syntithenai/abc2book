import { useEffect, useRef, useState } from 'react'
import { Button } from 'react-bootstrap'
import { toast } from 'react-toastify'
import useMediaResolverHealth from '../useMediaResolverHealth'
import { submitVoiceCommand } from '../voiceCommandClient'

const MIN_HOLD_MS = 300
const MAX_RECORD_MS = 12000

/** Drop trailing sentence punctuation Whisper often appends (e.g. "Hello."). */
function stripTrailingPunctuation(value) {
  return String(value || '')
    .trim()
    .replace(/[.!?…,:;]+$/u, '')
    .trim()
}

function MicIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      role="img"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 352 512"
      style={{ width: '0.85em', height: '0.85em', verticalAlign: '-0.1em' }}
    >
      <path
        fill="currentColor"
        d="M176 352c53.02 0 96-42.98 96-96V96c0-53.02-42.98-96-96-96S80 42.98 80 96v160c0 53.02 42.98 96 96 96zm160-160h-16c-8.84 0-16 7.16-16 16v48c0 74.8-64.49 134.82-140.79 127.38C96.71 376.89 48 317.11 48 250.3V208c0-8.84-7.16-16-16-16H16c-8.84 0-16 7.16-16 16v40.16c0 89.64 63.97 169.55 152 181.69V464H96c-8.84 0-16 7.16-16 16v16c0 8.84 7.16 16 16 16h160c8.84 0 16-7.16 16-16v-16c0-8.84-7.16-16-16-16h-56v-33.77C285.71 418.47 352 344.9 352 256v-48c0-8.84-7.16-16-16-16z"
      />
    </svg>
  )
}

/**
 * Hold-to-speak mic that fills a single form field with the transcript (or
 * title/artist hint from the voice command response).
 */
export default function FieldVoiceFillButton(props) {
  const { available: resolverAvailable, features } = useMediaResolverHealth()
  const [state, setState] = useState('idle')
  const mediaRecorderRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const chunksRef = useRef([])
  const holdTimerRef = useRef(null)
  const maxRecordTimerRef = useRef(null)
  const abortRef = useRef(null)
  const pointerActiveRef = useRef(false)
  const fieldKind = props.fieldKind === 'composer'
    ? 'composer'
    : (props.fieldKind === 'search' ? 'search' : 'title')

  useEffect(function() {
    return function() {
      cleanupRecording()
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  function cleanupRecording() {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
    if (maxRecordTimerRef.current) {
      clearTimeout(maxRecordTimerRef.current)
      maxRecordTimerRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop()
      } catch (e) {
        // ignore
      }
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(function(track) {
        track.stop()
      })
      mediaStreamRef.current = null
    }
    pointerActiveRef.current = false
  }

  function setKeyboardBlocked(blocked) {
    if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(blocked)
  }

  async function startRecording() {
    if (!pointerActiveRef.current || state !== 'idle' || !resolverAvailable || !features.whisper) return
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast.error('Microphone not supported in this browser')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      chunksRef.current = []
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      recorder.ondataavailable = function(event) {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = function() {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        chunksRef.current = []
        cleanupRecording()
        processAudio(blob)
      }
      recorder.start()
      setState('recording')
      setKeyboardBlocked(true)
      maxRecordTimerRef.current = setTimeout(function() {
        maxRecordTimerRef.current = null
        stopRecording()
      }, MAX_RECORD_MS)
    } catch (error) {
      toast.error(error && error.message ? error.message : 'Could not open microphone')
      cleanupRecording()
      setState('idle')
      setKeyboardBlocked(false)
    }
  }

  function stopRecording() {
    if (maxRecordTimerRef.current) {
      clearTimeout(maxRecordTimerRef.current)
      maxRecordTimerRef.current = null
    }
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop()
      } catch (e) {
        cleanupRecording()
        setState('idle')
        setKeyboardBlocked(false)
      }
    }
  }

  async function processAudio(blob) {
    if (!blob || !blob.size) {
      setState('idle')
      setKeyboardBlocked(false)
      return
    }
    setState('processing')
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    abortRef.current = controller
    try {
      const result = await submitVoiceCommand({
        blob: blob,
        mode: 'playback',
        accessToken: props.token && props.token.access_token,
        signal: controller ? controller.signal : undefined,
      })
      let text = ''
      if (fieldKind === 'composer') {
        text = result.artist || result.transcript || ''
      } else if (fieldKind === 'search') {
        text = result.searchText || result.title || result.transcript || ''
      } else {
        text = result.title || result.searchText || result.transcript || ''
      }
      text = stripTrailingPunctuation(text)
      if (!text) {
        toast.info('No speech recognised')
      } else if (typeof props.onFill === 'function') {
        props.onFill(text)
      }
    } catch (error) {
      if (error && error.name === 'AbortError') return
      toast.error(error && error.message ? error.message : 'Voice fill failed')
    } finally {
      setState('idle')
      setKeyboardBlocked(false)
      abortRef.current = null
    }
  }

  function handlePointerDown(event) {
    event.preventDefault()
    if (state !== 'idle') return
    pointerActiveRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    holdTimerRef.current = setTimeout(function() {
      holdTimerRef.current = null
      if (pointerActiveRef.current) startRecording()
    }, MIN_HOLD_MS)
  }

  function handlePointerUp(event) {
    event.preventDefault()
    pointerActiveRef.current = false
    const wasShortTap = !!holdTimerRef.current
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
    if (state === 'recording') {
      stopRecording()
    } else if (state === 'idle' && wasShortTap) {
      toast.warning('Hold the mic button down while speaking')
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch (e) {
      // ignore
    }
  }

  if (!resolverAvailable || !features.whisper) return null

  const label = fieldKind === 'composer'
    ? 'Hold to speak composer'
    : (fieldKind === 'search' ? 'Hold to speak search' : 'Hold to speak title')
  const busy = state === 'recording' || state === 'processing'
  const buttonClassName = ['field-voice-fill-btn']
  if (props.className) buttonClassName.push(props.className)

  return (
    <Button
      type="button"
      variant={state === 'recording' ? 'danger' : 'outline-secondary'}
      size={props.size}
      className={buttonClassName.join(' ')}
      disabled={state === 'processing'}
      title={label}
      aria-label={label}
      aria-pressed={state === 'recording'}
      data-testid={props['data-testid'] || 'field-voice-fill'}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {busy && state === 'processing' ? '…' : <MicIcon />}
    </Button>
  )
}
