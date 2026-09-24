import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addAndroidVoiceListenListener,
  cancelAndroidVoiceListen,
  ensureAndroidVoiceListenPermission,
  isAndroidVoiceListenReady,
  isNativeTranscriptGoodEnough,
  listenAndroidVoice,
  rmsDbToLevel,
  stopAndroidVoiceListen,
} from './androidVoiceListen'
import { isAndroidApp } from './platformUtils'
import useVoiceMicRecorder from './useVoiceMicRecorder'
import { getVoiceInputMode } from './voiceSettings'
import { microphoneErrorMessage } from './microphoneAccess'

const MIN_HOLD_MS = 300
const NATIVE_MAX_MS = 12000

/**
 * Unified voice capture: prefer Android SpeechRecognizer when available and
 * good enough; otherwise MediaRecorder audio for Whisper upload.
 *
 * onCaptureReady(result) where result is:
 *   { kind: 'transcript', transcript, confidence? }
 *   { kind: 'audio', blob }
 */
export default function useVoiceCapture(options) {
  const enabled = options.enabled !== false
  const preferNative = options.preferNative === true
  const audioFallbackEnabled = options.audioFallbackEnabled === true
  const onCaptureReady = options.onCaptureReady
  const onError = options.onError
  const onHoldModeShortTap = options.onHoldModeShortTap
  const setKeyboardBlocked = options.setKeyboardBlocked
  const onBeforeStart = options.onBeforeStart
  const onCaptureStopping = options.onCaptureStopping
  const onEmptyCapture = options.onEmptyCapture
  const onNativeSoftFail = options.onNativeSoftFail

  const [nativeReady, setNativeReady] = useState(false)
  const [nativeChecked, setNativeChecked] = useState(false)
  const [recordingState, setRecordingState] = useState('idle')
  const [inputMode, setInputMode] = useState(getVoiceInputMode)
  const [forceAudio, setForceAudio] = useState(false)
  const [inputLevel, setInputLevel] = useState(null)

  const recordingStateRef = useRef('idle')
  const pointerActiveRef = useRef(false)
  const holdTimerRef = useRef(null)
  const listenInFlightRef = useRef(false)
  const forceAudioRef = useRef(false)

  useEffect(function() {
    recordingStateRef.current = recordingState
  }, [recordingState])

  useEffect(function() {
    forceAudioRef.current = forceAudio
  }, [forceAudio])

  useEffect(function() {
    function handleSettingsChange() {
      setInputMode(getVoiceInputMode())
    }
    window.addEventListener('voiceSettingsChanged', handleSettingsChange)
    return function() {
      window.removeEventListener('voiceSettingsChanged', handleSettingsChange)
    }
  }, [])

  useEffect(function() {
    let cancelled = false
    if (!preferNative || !isAndroidApp()) {
      setNativeReady(false)
      setNativeChecked(true)
      return undefined
    }
    isAndroidVoiceListenReady().then(function(ready) {
      if (!cancelled) {
        // eslint-disable-next-line no-console
        console.log('[TunebookVoice] nativeReady=', ready)
        setNativeReady(ready)
        setNativeChecked(true)
      }
    })
    return function() {
      cancelled = true
    }
  }, [preferNative])

  const useNativeNow = preferNative && nativeReady && !forceAudio
  const audioEnabled = enabled && (!useNativeNow || audioFallbackEnabled)

  const emitCapture = useCallback(function(result) {
    if (typeof onCaptureReady === 'function') onCaptureReady(result)
  }, [onCaptureReady])

  const handleAudioReady = useCallback(function(blob) {
    setForceAudio(false)
    emitCapture({ kind: 'audio', blob: blob })
  }, [emitCapture])

  const mic = useVoiceMicRecorder({
    enabled: audioEnabled && (!useNativeNow || forceAudio),
    onAudioReady: handleAudioReady,
    onError: onError,
    onHoldModeShortTap: onHoldModeShortTap,
    setKeyboardBlocked: setKeyboardBlocked,
    onBeforeStart: onBeforeStart,
    onRecordingStopping: onCaptureStopping,
    onEmptyRecording: onEmptyCapture,
  })

  const finishNativeIdle = useCallback(function() {
    listenInFlightRef.current = false
    setRecordingState('idle')
    setInputLevel(null)
    if (setKeyboardBlocked) setKeyboardBlocked(false)
  }, [setKeyboardBlocked])

  useEffect(function() {
    if (!(preferNative && nativeReady)) return undefined
    let removed = false
    let handle = null
    addAndroidVoiceListenListener('rms', function(event) {
      if (removed) return
      const rmsdB = event && typeof event.rmsdB === 'number' ? event.rmsdB : 0
      setInputLevel(rmsDbToLevel(rmsdB))
    }).then(function(listener) {
      handle = listener
      if (removed && listener && typeof listener.remove === 'function') {
        listener.remove()
      }
    })
    return function() {
      removed = true
      if (handle && typeof handle.remove === 'function') {
        handle.remove()
      }
    }
  }, [preferNative, nativeReady])

  const handleNativeResult = useCallback(function(result) {
    const transcript = result && typeof result.transcript === 'string'
      ? result.transcript.trim()
      : ''
    const confidence = result && typeof result.confidence === 'number'
      ? result.confidence
      : undefined
    const reason = result && result.reason ? result.reason : ''
    // eslint-disable-next-line no-console
    console.log('[TunebookVoice] result', {
      len: transcript.length,
      confidence: confidence,
      reason: reason,
      recognizer: result && result.recognizer,
      preview: transcript.slice(0, 80),
    })

    if (isNativeTranscriptGoodEnough(transcript, confidence)) {
      setForceAudio(false)
      if (typeof onCaptureStopping === 'function') onCaptureStopping()
      finishNativeIdle()
      emitCapture({
        kind: 'transcript',
        transcript: transcript,
        confidence: confidence,
      })
      return
    }

    finishNativeIdle()
    if (audioFallbackEnabled) {
      setForceAudio(true)
      if (typeof onNativeSoftFail === 'function') {
        onNativeSoftFail(reason || 'low_confidence')
      }
      return
    }
    if (typeof onEmptyCapture === 'function') onEmptyCapture()
    if (typeof onNativeSoftFail === 'function') {
      onNativeSoftFail(reason || (transcript ? 'low_confidence' : 'empty'))
    }
  }, [
    audioFallbackEnabled,
    emitCapture,
    finishNativeIdle,
    onCaptureStopping,
    onEmptyCapture,
    onNativeSoftFail,
  ])

  const startNativeListen = useCallback(async function() {
    if (!enabled || !useNativeNow) return
    if (recordingStateRef.current !== 'idle' || listenInFlightRef.current) return

    listenInFlightRef.current = true
    try {
      const granted = await ensureAndroidVoiceListenPermission()
      if (!granted) {
        listenInFlightRef.current = false
        if (typeof onError === 'function') {
          onError(Object.assign(new Error('Microphone permission denied'), {
            name: 'NotAllowedError',
          }))
        }
        return
      }
      if (typeof onBeforeStart === 'function') onBeforeStart()
      setRecordingState('recording')
      setInputLevel(0)
      if (setKeyboardBlocked) setKeyboardBlocked(true)

      const result = await listenAndroidVoice({ maxMs: NATIVE_MAX_MS })
      if (!listenInFlightRef.current && recordingStateRef.current === 'idle') {
        // cancelled
        return
      }
      handleNativeResult(result || { transcript: '', reason: 'empty' })
    } catch (error) {
      finishNativeIdle()
      if (audioFallbackEnabled) {
        setForceAudio(true)
        if (typeof onNativeSoftFail === 'function') {
          onNativeSoftFail('error')
        }
        return
      }
      if (typeof onError === 'function') onError(error)
    }
  }, [
    audioFallbackEnabled,
    enabled,
    finishNativeIdle,
    handleNativeResult,
    onBeforeStart,
    onError,
    onNativeSoftFail,
    setKeyboardBlocked,
    useNativeNow,
  ])

  const stopNativeListen = useCallback(function() {
    if (!listenInFlightRef.current && recordingStateRef.current !== 'recording') return
    if (typeof onCaptureStopping === 'function') onCaptureStopping()
    // Soft stop so onResults can still deliver the final transcript.
    stopAndroidVoiceListen().catch(function() {})
  }, [onCaptureStopping])

  useEffect(function() {
    return function() {
      cancelAndroidVoiceListen().catch(function() {})
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
    }
  }, [])

  const handleTapPointerDown = useCallback(function(event, streamPromise) {
    if (useNativeNow && !forceAudioRef.current) {
      if (event.button !== 0) return
      if (typeof event.isPrimary === 'boolean' && !event.isPrimary) return
      event.preventDefault()
      if (!enabled) return
      if (recordingStateRef.current === 'recording') {
        stopNativeListen()
        return
      }
      if (recordingStateRef.current !== 'idle') return
      startNativeListen()
      return
    }
    mic.handleTapPointerDown(event, streamPromise)
  }, [enabled, mic, startNativeListen, stopNativeListen, useNativeNow])

  const handlePointerDown = useCallback(function(event, streamPromise) {
    if (useNativeNow && !forceAudioRef.current) {
      event.preventDefault()
      if (!enabled || recordingStateRef.current !== 'idle') return
      pointerActiveRef.current = true
      event.currentTarget.setPointerCapture(event.pointerId)
      holdTimerRef.current = setTimeout(function() {
        holdTimerRef.current = null
        if (!pointerActiveRef.current) return
        startNativeListen()
      }, MIN_HOLD_MS)
      return
    }
    mic.handlePointerDown(event, streamPromise)
  }, [enabled, mic, startNativeListen, useNativeNow])

  const handlePointerUp = useCallback(function(event) {
    if (useNativeNow && !forceAudioRef.current) {
      event.preventDefault()
      pointerActiveRef.current = false
      const wasShortTap = !!holdTimerRef.current
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current)
        holdTimerRef.current = null
      }
      if (recordingStateRef.current === 'recording') {
        stopNativeListen()
      } else if (recordingStateRef.current === 'idle' && wasShortTap) {
        if (typeof onHoldModeShortTap === 'function') onHoldModeShortTap()
      }
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch (e) {
        // ignore
      }
      return
    }
    mic.handlePointerUp(event)
  }, [mic, onHoldModeShortTap, stopNativeListen, useNativeNow])

  const handlePointerCancel = useCallback(function(event) {
    if (useNativeNow && !forceAudioRef.current) {
      handlePointerUp(event)
      cancelAndroidVoiceListen().catch(function() {})
      finishNativeIdle()
      return
    }
    mic.handlePointerCancel(event)
  }, [finishNativeIdle, handlePointerUp, mic, useNativeNow])

  const activeRecordingState = useNativeNow && !forceAudio
    ? recordingState
    : mic.recordingState

  return {
    recordingState: activeRecordingState,
    analyserNode: useNativeNow && !forceAudio ? null : mic.analyserNode,
    inputLevel: useNativeNow && !forceAudio ? inputLevel : null,
    inputMode: inputMode,
    isTapMode: inputMode === 'tap',
    nativeReady: nativeReady,
    nativeChecked: nativeChecked,
    usingNativeStt: useNativeNow && !forceAudio,
    handleTapPointerDown: handleTapPointerDown,
    handlePointerDown: handlePointerDown,
    handlePointerUp: handlePointerUp,
    handlePointerCancel: handlePointerCancel,
    microphoneErrorMessage: microphoneErrorMessage,
    kickoffMicrophoneAccess: mic.kickoffMicrophoneAccess,
  }
}
