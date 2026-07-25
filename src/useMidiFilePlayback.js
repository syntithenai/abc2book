import { useCallback, useEffect, useRef } from 'react'
import MidiPlayer from 'midi-player-js'
import {
  loadMidiInstruments,
  stopInstrumentNotes,
} from './midiSoundfontProvider'

const DRUM_CHANNEL = 9

export default function useMidiFilePlayback(options) {
  const opts = options || {}
  const onLoading = opts.onLoading
  const onReady = opts.onReady
  const onEnded = opts.onEnded
  const onError = opts.onError
  const onTimeUpdate = opts.onTimeUpdate

  const playerRef = useRef(null)
  const instrumentsRef = useRef(null)
  const audioContextRef = useRef(null)
  const activeNotesRef = useRef({})
  const isReadyRef = useRef(false)
  const tempoRef = useRef(1)
  const midiDataRef = useRef(null)
  const timeUpdateTimerRef = useRef(null)

  function getAudioContext() {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    return audioContextRef.current
  }

  function stopActiveNotes() {
    const activeNotes = activeNotesRef.current || {}
    Object.keys(activeNotes).forEach(function(key) {
      const node = activeNotes[key]
      if (node && typeof node.stop === 'function') {
        try { node.stop() } catch (e) { /* ignore */ }
      }
    })
    activeNotesRef.current = {}
    if (instrumentsRef.current && instrumentsRef.current.list) {
      instrumentsRef.current.list.forEach(stopInstrumentNotes)
    }
  }

  function clearTimeUpdateTimer() {
    if (timeUpdateTimerRef.current) {
      clearInterval(timeUpdateTimerRef.current)
      timeUpdateTimerRef.current = null
    }
  }

  function startTimeUpdateTimer() {
    clearTimeUpdateTimer()
    timeUpdateTimerRef.current = setInterval(function() {
      if (onTimeUpdate && playerRef.current) {
        onTimeUpdate(currentTime())
      }
    }, 200)
  }

  function handlePlayerEvent(event) {
    const instruments = instrumentsRef.current
    if (!instruments || !event) return
    const ac = getAudioContext()
    const trackIndex = Math.max(0, (event.track || 1) - 1)
    const channel = event.channel != null ? event.channel : 0
    const program = Array.isArray(playerRef.current && playerRef.current.instruments)
      ? playerRef.current.instruments[trackIndex]
      : 0
    const instrument = channel === DRUM_CHANNEL
      ? instruments.resolve(0)
      : instruments.resolve(program)

    if (!instrument) return

    if (event.name === 'Note on' && event.velocity > 0) {
      const noteKey = trackIndex + '-' + channel + '-' + event.noteNumber
      activeNotesRef.current[noteKey] = instrument.play(event.noteNumber, ac.currentTime, {
        gain: Math.max(0, Math.min(1, event.velocity / 127)),
      })
    } else if (event.name === 'Note off' || (event.name === 'Note on' && event.velocity === 0)) {
      const noteKey = trackIndex + '-' + channel + '-' + event.noteNumber
      const node = activeNotesRef.current[noteKey]
      if (node && typeof node.stop === 'function') {
        try { node.stop() } catch (e) { /* ignore */ }
      }
      delete activeNotesRef.current[noteKey]
    }
  }

  const stop = useCallback(function() {
    clearTimeUpdateTimer()
    if (playerRef.current && playerRef.current.isPlaying()) {
      playerRef.current.pause()
    }
    stopActiveNotes()
  }, [])

  const init = useCallback(function(midiData) {
    midiDataRef.current = midiData
    return new Promise(function(resolve) {
      stop()
      isReadyRef.current = false
      playerRef.current = null
      instrumentsRef.current = null

      if (!midiData) {
        resolve()
        return
      }

      if (onLoading) onLoading(true)

      const ac = getAudioContext()
      const player = new MidiPlayer.Player(handlePlayerEvent)
      playerRef.current = player

      player.on('fileLoaded', function() {
        const programs = Array.isArray(player.instruments) ? player.instruments.slice() : [0]
        loadMidiInstruments(ac, programs).then(async function(instruments) {
          instrumentsRef.current = instruments
          isReadyRef.current = true
          const duration = typeof player.getSongTime === 'function' ? player.getSongTime() : 0
          if (ac.state === 'suspended') {
            try {
              await ac.resume()
            } catch (e) { /* ignore */ }
          }
          if (onReady) onReady(duration)
          if (onLoading) onLoading(false)
          if (ac.state !== 'running') {
            if (onError) onError('Tap play to start MIDI audio')
          }
          resolve()
        }).catch(function(err) {
          isReadyRef.current = false
          if (onLoading) onLoading(false)
          if (onError) onError(err && err.message ? err.message : 'Failed to load MIDI instruments')
          resolve()
        })
      })

      player.on('endOfFile', function() {
        clearTimeUpdateTimer()
        if (onEnded) onEnded()
      })

      try {
        if (midiData instanceof ArrayBuffer) {
          player.loadArrayBuffer(midiData)
        } else if (midiData && typeof midiData.arrayBuffer === 'function') {
          midiData.arrayBuffer().then(function(buffer) {
            player.loadArrayBuffer(buffer)
          }).catch(function() {
            if (onLoading) onLoading(false)
            if (onError) onError('Failed to read MIDI data')
            resolve()
          })
        } else {
          if (onLoading) onLoading(false)
          if (onError) onError('Invalid MIDI data')
          resolve()
        }
      } catch (e) {
        if (onLoading) onLoading(false)
        if (onError) onError(e && e.message ? e.message : 'Failed to load MIDI file')
        resolve()
      }
    })
  }, [onLoading, onReady, onEnded, onError, stop])

  const resumeAudioContextFromGesture = useCallback(function() {
    const ac = getAudioContext()
    if (ac.state === 'suspended') {
      ac.resume().catch(function() {})
    }
  }, [])

  const start = useCallback(async function() {
    const ac = getAudioContext()
    if (ac.state === 'suspended') {
      await ac.resume()
    }
    if (!isReadyRef.current || !playerRef.current) return false
    if (!playerRef.current.isPlaying()) {
      playerRef.current.play()
      startTimeUpdateTimer()
    }
    return true
  }, [])

  const pause = useCallback(function() {
    stop()
    return true
  }, [stop])

  const seek = useCallback(function(seconds) {
    if (!playerRef.current || !isReadyRef.current) return 0
    const wasPlaying = playerRef.current.isPlaying()
    stop()
    playerRef.current.skipToSeconds(seconds)
    if (wasPlaying) {
      playerRef.current.play()
      startTimeUpdateTimer()
    }
    return currentTime()
  }, [stop])

  const currentTime = useCallback(function() {
    if (!playerRef.current) return 0
    return playerRef.current.getSongTime() - playerRef.current.getSongTimeRemaining()
  }, [])

  const duration = useCallback(function() {
    if (!playerRef.current) return 0
    return playerRef.current.getSongTime()
  }, [])

  const setTempo = useCallback(function(tempo) {
    const next = Number(tempo)
    if (!Number.isFinite(next) || next <= 0) return
    tempoRef.current = next
    if (playerRef.current && typeof playerRef.current.setTempo === 'function') {
      playerRef.current.setTempo(next)
    }
  }, [])

  useEffect(function() {
    return function() {
      stop()
      clearTimeUpdateTimer()
    }
  }, [stop])

  return {
    init: init,
    start: start,
    pause: pause,
    stop: stop,
    seek: seek,
    currentTime: currentTime,
    duration: duration,
    setTempo: setTempo,
    resumeAudioContextFromGesture: resumeAudioContextFromGesture,
    playerRef: playerRef,
    isReadyRef: isReadyRef,
  }
}
