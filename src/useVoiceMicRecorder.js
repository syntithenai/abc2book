import { useCallback, useEffect, useRef, useState } from 'react'
import {
  microphoneErrorMessage,
  openMicrophoneStream,
  stopMicrophoneStream,
} from './microphoneAccess'
import { createSilenceMonitor } from './voiceSilenceDetection'
import { getVoiceInputMode } from './voiceSettings'

const MIN_HOLD_MS = 300
const MAX_RECORD_MS = 12000

export default function useVoiceMicRecorder(options) {
  const enabled = options.enabled !== false
  const onAudioReady = options.onAudioReady
  const onError = options.onError
  const onHoldModeShortTap = options.onHoldModeShortTap
  const setKeyboardBlocked = options.setKeyboardBlocked
  const onBeforeStart = options.onBeforeStart

  const [recordingState, setRecordingState] = useState('idle')
  const [analyserNode, setAnalyserNode] = useState(null)
  const [inputMode, setInputMode] = useState(getVoiceInputMode)

  const mediaRecorderRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const audioContextRef = useRef(null)
  const chunksRef = useRef([])
  const holdTimerRef = useRef(null)
  const maxRecordTimerRef = useRef(null)
  const pointerActiveRef = useRef(false)
  const micStreamPromiseRef = useRef(null)
  const silenceMonitorRef = useRef(null)
  const recordingStateRef = useRef('idle')

  useEffect(function() {
    recordingStateRef.current = recordingState
  }, [recordingState])

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
    return function() {
      cleanupRecording()
    }
  }, [])

  const cleanupAnalyser = useCallback(function() {
    if (silenceMonitorRef.current) {
      silenceMonitorRef.current.stop()
      silenceMonitorRef.current = null
    }
    setAnalyserNode(null)
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(function() {})
      audioContextRef.current = null
    }
  }, [])

  const cleanupRecording = useCallback(function() {
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
      stopMicrophoneStream(mediaStreamRef.current)
      mediaStreamRef.current = null
    }
    micStreamPromiseRef.current = null
    pointerActiveRef.current = false
    cleanupAnalyser()
  }, [cleanupAnalyser])

  const beginMicrophoneAccess = useCallback(function() {
    if (micStreamPromiseRef.current) return micStreamPromiseRef.current
    micStreamPromiseRef.current = openMicrophoneStream({ audio: true }).catch(function(error) {
      micStreamPromiseRef.current = null
      throw error
    })
    return micStreamPromiseRef.current
  }, [])

  const releasePreparedMicrophone = useCallback(function() {
    if (!micStreamPromiseRef.current) return Promise.resolve()
    return Promise.resolve(micStreamPromiseRef.current).then(function(stream) {
      stopMicrophoneStream(stream)
    }).catch(function() {}).finally(function() {
      micStreamPromiseRef.current = null
    })
  }, [])

  const stopRecording = useCallback(function() {
    if (maxRecordTimerRef.current) {
      clearTimeout(maxRecordTimerRef.current)
      maxRecordTimerRef.current = null
    }
    if (silenceMonitorRef.current) {
      silenceMonitorRef.current.stop()
      silenceMonitorRef.current = null
    }
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state === 'recording') {
      try {
        recorder.stop()
      } catch (e) {
        cleanupRecording()
        setRecordingState('idle')
        if (setKeyboardBlocked) setKeyboardBlocked(false)
      }
    } else {
      cleanupRecording()
      setRecordingState('idle')
      if (setKeyboardBlocked) setKeyboardBlocked(false)
    }
  }, [cleanupRecording, setKeyboardBlocked])

  const startRecording = useCallback(async function() {
    if (!enabled || recordingStateRef.current !== 'idle') return

    if (typeof onBeforeStart === 'function') {
      onBeforeStart()
    }

    try {
      const stream = await beginMicrophoneAccess()
      if (recordingStateRef.current !== 'idle') {
        stopMicrophoneStream(stream)
        micStreamPromiseRef.current = null
        return
      }
      if (inputMode === 'hold' && !pointerActiveRef.current) {
        stopMicrophoneStream(stream)
        micStreamPromiseRef.current = null
        return
      }

      mediaStreamRef.current = stream
      micStreamPromiseRef.current = null
      chunksRef.current = []

      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      audioContextRef.current = audioContext
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      setAnalyserNode(analyser)

      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = function(event) {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data)
      }

      recorder.onstop = function() {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        })
        chunksRef.current = []
        if (mediaStreamRef.current) {
          stopMicrophoneStream(mediaStreamRef.current)
          mediaStreamRef.current = null
        }
        cleanupAnalyser()
        setRecordingState('idle')
        if (setKeyboardBlocked) setKeyboardBlocked(false)
        if (blob.size > 0 && typeof onAudioReady === 'function') {
          onAudioReady(blob)
        }
      }

      recorder.start()
      setRecordingState('recording')
      if (setKeyboardBlocked) setKeyboardBlocked(true)

      if (inputMode === 'tap') {
        silenceMonitorRef.current = createSilenceMonitor({
          analyser: analyser,
          onSilence: function() {
            stopRecording()
          },
        })
        silenceMonitorRef.current.start()
      }

      maxRecordTimerRef.current = setTimeout(function() {
        maxRecordTimerRef.current = null
        stopRecording()
      }, MAX_RECORD_MS)
    } catch (error) {
      cleanupRecording()
      setRecordingState('idle')
      if (setKeyboardBlocked) setKeyboardBlocked(false)
      if (typeof onError === 'function') {
        onError(error)
      }
    }
  }, [
    beginMicrophoneAccess,
    cleanupAnalyser,
    cleanupRecording,
    enabled,
    inputMode,
    onAudioReady,
    onBeforeStart,
    onError,
    setKeyboardBlocked,
    stopRecording,
  ])

  const handleClick = useCallback(function(event) {
    event.preventDefault()
    if (!enabled) return
    if (recordingStateRef.current === 'recording') {
      stopRecording()
      return
    }
    if (recordingStateRef.current !== 'idle') return
    startRecording()
  }, [enabled, startRecording, stopRecording])

  const handlePointerDown = useCallback(function(event) {
    event.preventDefault()
    if (!enabled || recordingStateRef.current !== 'idle') return
    if (typeof onBeforeStart === 'function') {
      onBeforeStart()
    }
    pointerActiveRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    beginMicrophoneAccess().catch(function(error) {
      if (!pointerActiveRef.current) return
      pointerActiveRef.current = false
      if (typeof onError === 'function') onError(error)
    })
    holdTimerRef.current = setTimeout(function() {
      holdTimerRef.current = null
      if (pointerActiveRef.current) startRecording()
    }, MIN_HOLD_MS)
  }, [beginMicrophoneAccess, enabled, onBeforeStart, onError, startRecording])

  const handlePointerUp = useCallback(function(event) {
    event.preventDefault()
    pointerActiveRef.current = false
    const wasShortTap = !!holdTimerRef.current
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
    if (recordingStateRef.current === 'recording') {
      stopRecording()
    } else if (recordingStateRef.current === 'idle') {
      if (setKeyboardBlocked) setKeyboardBlocked(false)
      if (wasShortTap) {
        releasePreparedMicrophone()
        if (typeof onHoldModeShortTap === 'function') onHoldModeShortTap()
      } else {
        releasePreparedMicrophone()
      }
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch (e) {
      // ignore
    }
  }, [onHoldModeShortTap, releasePreparedMicrophone, setKeyboardBlocked, stopRecording])

  const handlePointerCancel = useCallback(function(event) {
    handlePointerUp(event)
    cleanupRecording()
    setRecordingState('idle')
    if (setKeyboardBlocked) setKeyboardBlocked(false)
  }, [cleanupRecording, handlePointerUp, setKeyboardBlocked])

  return {
    recordingState,
    analyserNode,
    inputMode,
    isTapMode: inputMode === 'tap',
    handleClick,
    handlePointerDown,
    handlePointerUp,
    handlePointerCancel,
    stopRecording,
    cleanupRecording,
    microphoneErrorMessage,
  }
}
