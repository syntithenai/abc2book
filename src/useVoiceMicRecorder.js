import { useCallback, useEffect, useRef, useState } from 'react'
import {
  kickoffMicrophoneAccess,
  microphoneErrorMessage,
  openMicrophoneStream,
  stopMicrophoneStream,
} from './microphoneAccess'
import { createSilenceMonitor } from './voiceSilenceDetection'
import { getVoiceInputMode } from './voiceSettings'

const MIN_HOLD_MS = 300
const MAX_RECORD_MS = 12000

const RECORDER_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  '',
]

function createMediaRecorder(stream) {
  if (typeof MediaRecorder === 'undefined') {
    throw Object.assign(new Error('Recording not supported in this browser'), {
      name: 'NotSupportedError',
    })
  }
  for (let i = 0; i < RECORDER_MIME_TYPES.length; i += 1) {
    const mimeType = RECORDER_MIME_TYPES[i]
    try {
      if (mimeType && typeof MediaRecorder.isTypeSupported === 'function'
        && !MediaRecorder.isTypeSupported(mimeType)) {
        continue
      }
      return mimeType
        ? new MediaRecorder(stream, { mimeType: mimeType })
        : new MediaRecorder(stream)
    } catch (e) {
      // try next mime type
    }
  }
  return new MediaRecorder(stream)
}

function createAnalyserForStream(stream) {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)()
  const source = audioContext.createMediaStreamSource(stream)
  const analyser = audioContext.createAnalyser()
  analyser.fftSize = 256
  source.connect(analyser)
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(function() {})
  }
  return { audioContext: audioContext, analyser: analyser }
}

export default function useVoiceMicRecorder(options) {
  const enabled = options.enabled !== false
  const onAudioReady = options.onAudioReady
  const onError = options.onError
  const onHoldModeShortTap = options.onHoldModeShortTap
  const setKeyboardBlocked = options.setKeyboardBlocked
  const onBeforeStart = options.onBeforeStart
  const onRecordingStopping = options.onRecordingStopping
  const onEmptyRecording = options.onEmptyRecording

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
  const gestureStreamPromiseRef = useRef(null)
  const gestureStreamCancelledRef = useRef(false)
  const silenceMonitorRef = useRef(null)
  const recordingStateRef = useRef('idle')
  const inputModeRef = useRef(inputMode)
  const cleanupRecordingRef = useRef(function() {})

  useEffect(function() {
    recordingStateRef.current = recordingState
  }, [recordingState])

  useEffect(function() {
    inputModeRef.current = inputMode
  }, [inputMode])

  useEffect(function() {
    function handleSettingsChange() {
      setInputMode(getVoiceInputMode())
    }
    window.addEventListener('voiceSettingsChanged', handleSettingsChange)
    return function() {
      window.removeEventListener('voiceSettingsChanged', handleSettingsChange)
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
    mediaRecorderRef.current = null
    if (mediaStreamRef.current) {
      stopMicrophoneStream(mediaStreamRef.current)
      mediaStreamRef.current = null
    }
    pointerActiveRef.current = false
    gestureStreamPromiseRef.current = null
    gestureStreamCancelledRef.current = false
    cleanupAnalyser()
  }, [cleanupAnalyser])

  cleanupRecordingRef.current = cleanupRecording

  useEffect(function() {
    return function() {
      cleanupRecordingRef.current()
    }
  }, [])

  const reportError = useCallback(function(error) {
    if (typeof onError === 'function') onError(error)
  }, [onError])

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
      if (typeof onRecordingStopping === 'function') {
        onRecordingStopping()
      }
      try {
        if (typeof recorder.requestData === 'function') {
          recorder.requestData()
        }
        recorder.stop()
      } catch (e) {
        cleanupRecording()
        setRecordingState('idle')
        if (setKeyboardBlocked) setKeyboardBlocked(false)
      }
      return
    }
    cleanupRecording()
    setRecordingState('idle')
    if (setKeyboardBlocked) setKeyboardBlocked(false)
  }, [cleanupRecording, onRecordingStopping, setKeyboardBlocked])

  const attachRecorder = useCallback(function(stream, withAnalyser) {
    try {
    mediaStreamRef.current = stream
    chunksRef.current = []

    let analyser = null
    if (withAnalyser) {
      try {
        const analysis = createAnalyserForStream(stream)
        audioContextRef.current = analysis.audioContext
        analyser = analysis.analyser
        setAnalyserNode(analyser)
      } catch (e) {
        cleanupAnalyser()
      }
    }

    const recorder = createMediaRecorder(stream)
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
      mediaRecorderRef.current = null
      cleanupAnalyser()
      setRecordingState('idle')
      // #region agent log
      fetch('http://127.0.0.1:7543/ingest/714bef82-d1cf-4636-9283-79de04198120',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'552c4e'},body:JSON.stringify({sessionId:'552c4e',runId:'post-fix',location:'useVoiceMicRecorder.js:recorder.onstop',message:'recorder stopped',data:{blobSize:blob.size,mimeType:recorder.mimeType},timestamp:Date.now(),hypothesisId:'H10,H11'})}).catch(()=>{});
      // #endregion
      if (blob.size === 0) {
        if (typeof onEmptyRecording === 'function') {
          onEmptyRecording()
        }
        if (setKeyboardBlocked) setKeyboardBlocked(false)
        return
      }
      if (setKeyboardBlocked) setKeyboardBlocked(false)
      if (typeof onAudioReady === 'function') {
        onAudioReady(blob)
      }
    }

    recorder.start()
    setRecordingState('recording')
    if (setKeyboardBlocked) setKeyboardBlocked(true)

    if (withAnalyser && analyser) {
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
    // #region agent log
    fetch('http://127.0.0.1:7543/ingest/714bef82-d1cf-4636-9283-79de04198120',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'552c4e'},body:JSON.stringify({sessionId:'552c4e',location:'useVoiceMicRecorder.js:attachRecorder:success',message:'recorder attached',data:{withAnalyser:withAnalyser,mimeType:recorder.mimeType},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    } catch (attachError) {
      // #region agent log
      fetch('http://127.0.0.1:7543/ingest/714bef82-d1cf-4636-9283-79de04198120',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'552c4e'},body:JSON.stringify({sessionId:'552c4e',location:'useVoiceMicRecorder.js:attachRecorder:catch',message:'attachRecorder failed',data:{errorName:attachError&&attachError.name,errorMessage:attachError&&attachError.message,withAnalyser:withAnalyser},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
      // #endregion
      throw attachError
    }
  }, [cleanupAnalyser, onAudioReady, onEmptyRecording, setKeyboardBlocked, stopRecording])

  const startRecording = useCallback(async function(requirePointerHeld, streamPromise) {
    // #region agent log
    fetch('http://127.0.0.1:7543/ingest/714bef82-d1cf-4636-9283-79de04198120',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'552c4e'},body:JSON.stringify({sessionId:'552c4e',runId:'post-fix',location:'useVoiceMicRecorder.js:startRecording:entry',message:'startRecording called',data:{requirePointerHeld:requirePointerHeld,hasStreamPromise:!!streamPromise,enabled:enabled,recordingState:recordingStateRef.current,pointerActive:pointerActiveRef.current,inputMode:inputModeRef.current},timestamp:Date.now(),hypothesisId:'H4,H5,H6'})}).catch(()=>{});
    // #endregion
    if (!enabled || recordingStateRef.current !== 'idle') return
    if (requirePointerHeld && !pointerActiveRef.current) return

    try {
      const stream = await openMicrophoneStream({ audio: true }, streamPromise)
      // #region agent log
      fetch('http://127.0.0.1:7543/ingest/714bef82-d1cf-4636-9283-79de04198120',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'552c4e'},body:JSON.stringify({sessionId:'552c4e',location:'useVoiceMicRecorder.js:startRecording:afterStream',message:'stream obtained',data:{recordingState:recordingStateRef.current,pointerActive:pointerActiveRef.current,requirePointerHeld:requirePointerHeld,trackCount:stream.getAudioTracks?stream.getAudioTracks().length:0},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
      if (recordingStateRef.current !== 'idle') {
        stopMicrophoneStream(stream)
        return
      }
      if (requirePointerHeld && !pointerActiveRef.current) {
        // #region agent log
        fetch('http://127.0.0.1:7543/ingest/714bef82-d1cf-4636-9283-79de04198120',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'552c4e'},body:JSON.stringify({sessionId:'552c4e',location:'useVoiceMicRecorder.js:startRecording:pointerReleased',message:'discarding stream because pointer released',data:{requirePointerHeld:requirePointerHeld},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
        // #endregion
        stopMicrophoneStream(stream)
        return
      }

      if (typeof onBeforeStart === 'function') {
        onBeforeStart()
      }

      attachRecorder(stream, inputModeRef.current === 'tap')
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7543/ingest/714bef82-d1cf-4636-9283-79de04198120',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'552c4e'},body:JSON.stringify({sessionId:'552c4e',location:'useVoiceMicRecorder.js:startRecording:catch',message:'startRecording error',data:{errorName:error&&error.name,errorMessage:error&&error.message,audioInputCount:error&&error.audioInputCount,micPermissionState:error&&error.micPermissionState,friendlyMessage:microphoneErrorMessage(error)},timestamp:Date.now(),hypothesisId:'H2,H3,H8,H9'})}).catch(()=>{});
      // #endregion
      cleanupRecording()
      setRecordingState('idle')
      if (setKeyboardBlocked) setKeyboardBlocked(false)
      reportError(error)
    }
  }, [
    attachRecorder,
    cleanupRecording,
    enabled,
    onBeforeStart,
    reportError,
    setKeyboardBlocked,
  ])

  const handleTapPointerDown = useCallback(function(event, streamPromise) {
    if (event.button !== 0) return
    if (typeof event.isPrimary === 'boolean' && !event.isPrimary) return
    event.preventDefault()
    if (!enabled) return

    if (recordingStateRef.current === 'recording') {
      stopRecording()
      return
    }

    if (recordingStateRef.current !== 'idle') return

    const gesturePromise = streamPromise || kickoffMicrophoneAccess()
    startRecording(false, gesturePromise)
  }, [enabled, startRecording, stopRecording])

  const handleHoldPointerDown = useCallback(function(event, streamPromise) {
    event.preventDefault()
    if (!enabled || recordingStateRef.current !== 'idle') return
    pointerActiveRef.current = true
    gestureStreamCancelledRef.current = false
    gestureStreamPromiseRef.current = streamPromise || null
    event.currentTarget.setPointerCapture(event.pointerId)
    holdTimerRef.current = setTimeout(function() {
      holdTimerRef.current = null
      if (!pointerActiveRef.current) return
      startRecording(true, gestureStreamPromiseRef.current)
    }, MIN_HOLD_MS)
  }, [enabled, startRecording])

  const handlePointerDown = useCallback(function(event, streamPromise) {
    handleHoldPointerDown(event, streamPromise)
  }, [handleHoldPointerDown])

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
        gestureStreamCancelledRef.current = true
        const pending = gestureStreamPromiseRef.current
        gestureStreamPromiseRef.current = null
        if (pending) {
          Promise.resolve(pending).then(function(stream) {
            if (gestureStreamCancelledRef.current) stopMicrophoneStream(stream)
          }).catch(function() {})
        }
        if (typeof onHoldModeShortTap === 'function') onHoldModeShortTap()
      }
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch (e) {
      // ignore
    }
  }, [onHoldModeShortTap, setKeyboardBlocked, stopRecording])

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
    handleTapPointerDown,
    handleHoldPointerDown,
    handlePointerDown,
    handlePointerUp,
    handlePointerCancel,
    stopRecording,
    cleanupRecording,
    microphoneErrorMessage,
    kickoffMicrophoneAccess,
  }
}
