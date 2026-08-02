import { useEffect, useRef, useState } from 'react'
import { Button } from 'react-bootstrap'
import { toast } from 'react-toastify'
import VoiceInputWaveform from './VoiceInputWaveform'
import useMediaResolverHealth from '../useMediaResolverHealth'
import useVoiceMicRecorder from '../useVoiceMicRecorder'
import { kickoffMicrophoneAccess } from '../microphoneAccess'
import { submitVoiceCommand } from '../voiceCommandClient'
import { isTapVoiceInputMode } from '../voiceSettings'

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
 * Mic button that fills a single form field with the transcript (or
 * title/artist hint from the voice command response).
 */
export default function FieldVoiceFillButton(props) {
  const { available: resolverAvailable, features } = useMediaResolverHealth()
  const [processing, setProcessing] = useState(false)
  const abortRef = useRef(null)
  const fieldKind = props.fieldKind === 'composer'
    ? 'composer'
    : (props.fieldKind === 'search' ? 'search' : 'title')

  useEffect(function() {
    return function() {
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  function setKeyboardBlocked(blocked) {
    if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(blocked)
  }

  async function processAudio(blob) {
    if (!blob || !blob.size) return
    setProcessing(true)
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    abortRef.current = controller
    let timedOut = false
    const timeoutId = controller ? setTimeout(function() {
      timedOut = true
      controller.abort()
    }, 120000) : null
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
      } else if (fieldKind === 'transcript') {
        text = result.transcript || ''
      } else {
        text = result.title || result.searchText || result.transcript || ''
      }
      text = stripTrailingPunctuation(text)
      if (!text) {
        if (!isTapVoiceInputMode()) {
          toast.info('No speech recognised')
        }
      } else if (typeof props.onFill === 'function') {
        props.onFill(text)
      }
    } catch (error) {
      if (error && error.name === 'AbortError') {
        if (timedOut) {
          toast.error('Voice fill timed out — check that the media resolver is running')
        }
        return
      }
      toast.error(error && error.message ? error.message : 'Voice fill failed')
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
      setProcessing(false)
      setKeyboardBlocked(false)
      abortRef.current = null
    }
  }

  const {
    recordingState,
    analyserNode,
    isTapMode,
    handleTapPointerDown,
    handlePointerDown,
    handlePointerUp,
    handlePointerCancel,
    microphoneErrorMessage,
  } = useVoiceMicRecorder({
    enabled: resolverAvailable && features.whisper,
    onRecordingStopping: function() {
      setProcessing(true)
    },
    onEmptyRecording: function() {
      setProcessing(false)
    },
    onAudioReady: processAudio,
    onError: function(error) {
      toast.error(microphoneErrorMessage(error))
    },
    onHoldModeShortTap: function() {
      toast.warning('Hold the mic button down while speaking')
    },
    setKeyboardBlocked: setKeyboardBlocked,
  })

  function onMicPointerDown(event) {
    if (isTapMode) {
      const streamPromise = kickoffMicrophoneAccess()
      handleTapPointerDown(event, streamPromise)
    } else {
      handlePointerDown(event)
    }
  }

  if (!resolverAvailable || !features.whisper) return null

  const state = processing ? 'processing' : recordingState
  const isRecording = state === 'recording'
  const label = fieldKind === 'composer'
    ? (isTapMode ? 'Tap to speak composer' : 'Hold to speak composer')
    : (fieldKind === 'search'
      ? (isTapMode ? 'Tap to speak search' : 'Hold to speak search')
      : (fieldKind === 'transcript'
        ? (isTapMode ? 'Tap to speak' : 'Hold to speak')
        : (isTapMode ? 'Tap to speak title' : 'Hold to speak title')))
  const busy = isRecording || state === 'processing'
  const buttonClassName = ['field-voice-fill-btn']
  if (props.className) buttonClassName.push(props.className)

  const buttonProps = isTapMode
    ? { onPointerDown: onMicPointerDown }
    : {
      onPointerDown: onMicPointerDown,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp,
    }

  return (
    <span className="field-voice-fill-wrap">
      {isTapMode && isRecording ? (
        <VoiceInputWaveform analyserNode={analyserNode} variant="field" />
      ) : null}
      <Button
        type="button"
        variant={isRecording ? 'danger' : 'outline-secondary'}
        size={props.size}
        className={buttonClassName.join(' ')}
        disabled={state === 'processing'}
        title={label}
        aria-label={label}
        aria-pressed={isRecording}
        data-testid={props['data-testid'] || 'field-voice-fill'}
        {...buttonProps}
      >
        {busy && state === 'processing' ? '…' : <MicIcon />}
      </Button>
    </span>
  )
}
