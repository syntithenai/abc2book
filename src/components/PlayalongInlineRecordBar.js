import { useEffect, useRef, useState } from 'react'
import { Button, ButtonGroup } from 'react-bootstrap'
import { getRecording } from '../linkRecording'
import { normalizePlayalongTakes } from '../playalongTakes'
import {
  resolvePlayalongTakePitchPoints,
} from '../playalongWaveform'
import { loadPlayalongSettings, playalongTrackingCacheKey, playalongTrackingOptions } from '../playalongSettings'
import {
  contrastTextForHex,
  expectedNotesFromPlayalongTune,
  scorePlayalongTake,
} from '../playalongTakeScore'
import { recordPlayalongTopScore } from '../playalongTopScores'
import { REP_COLORS } from './PracticeWarmupPitchRoll'
import utilsFunctions from '../utilsFunctions'
import './PlayalongCompareOverlay.css'

function tuneTitleForScore(tune) {
  if (!tune || typeof tune !== 'object') return ''
  if (tune.name) return String(tune.name).trim()
  if (tune.title) return String(tune.title).trim()
  return ''
}

const utils = utilsFunctions()

function loadTakePitchPoints(take, pitchPointsById, blobById, tracking) {
  return resolvePlayalongTakePitchPoints(take, pitchPointsById, blobById, {
    getRecording: getRecording,
    tracking: tracking,
  })
}

function resolveTakeAudioBlob(take, blobById) {
  const recordingId = take && take.recordingId != null ? String(take.recordingId) : ''
  if (!recordingId) return Promise.resolve(null)
  const sessionBlob = blobById && blobById[recordingId]
  if (sessionBlob) return Promise.resolve(sessionBlob)
  return getRecording(recordingId).then(function(recording) {
    if (!recording) return null
    if (recording.data instanceof Blob) return recording.data
    if (recording.data) {
      try {
        return utils.dataURItoBlob(recording.data, recording.type || 'audio/webm')
      } catch (e) {
        return null
      }
    }
    return null
  }).catch(function() {
    return null
  })
}

function decodeBlobToAudioBuffer(ctx, blob) {
  if (!ctx || !blob || typeof blob.arrayBuffer !== 'function') {
    return Promise.reject(new Error('decode unavailable'))
  }
  return blob.arrayBuffer().then(function(bytes) {
    // copy: decodeAudioData may detach the ArrayBuffer
    const copy = bytes.slice(0)
    return ctx.decodeAudioData(copy)
  })
}

function playBlobWithHtmlAudio(blob, onEnded, onError) {
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  audio.preload = 'auto'
  audio.onended = onEnded
  audio.onerror = onError
  const playPromise = audio.play()
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(onError)
  }
  return { audio: audio, objectUrl: url }
}

export default function PlayalongInlineRecordBar(props) {
  const takes = normalizePlayalongTakes(props.takes)
  const icons = props.tunebook && props.tunebook.icons ? props.tunebook.icons : {}
  const isRecording = !!props.isRecording
  const isWaiting = !!props.isWaiting && !isRecording
  const hiddenTakeIds = props.hiddenTakeIds && typeof props.hiddenTakeIds === 'object'
    ? props.hiddenTakeIds
    : {}
  const [scores, setScores] = useState({})
  const [playingTakeId, setPlayingTakeId] = useState(null)
  const audioRef = useRef(null)
  const objectUrlRef = useRef(null)
  const bufferSourceRef = useRef(null)
  const audioContextRef = useRef(null)
  const playRequestRef = useRef(0)
  const playingTakeIdRef = useRef(null)

  const takeKey = takes.map(function(take) { return take.recordingId }).join(',')
  const pitchKey = Object.keys(props.pitchPointsById || {}).sort().join(',')
  const blobKey = Object.keys(props.blobById || {}).sort().join(',')
  const trackingKey = playalongTrackingCacheKey(props.trackingSettings || loadPlayalongSettings())

  function stopTakePlayback() {
    playRequestRef.current += 1
    if (bufferSourceRef.current) {
      try { bufferSourceRef.current.onended = null } catch (e) {}
      try { bufferSourceRef.current.stop(0) } catch (e) {}
      try { bufferSourceRef.current.disconnect() } catch (e) {}
      bufferSourceRef.current = null
    }
    if (audioContextRef.current) {
      const ctx = audioContextRef.current
      audioContextRef.current = null
      try {
        if (typeof ctx.close === 'function' && ctx.state !== 'closed') ctx.close()
      } catch (e) {}
    }
    if (audioRef.current) {
      try { audioRef.current.pause() } catch (e) {}
      audioRef.current.onended = null
      audioRef.current.onerror = null
      try { audioRef.current.removeAttribute('src') } catch (e) {
        try { audioRef.current.src = '' } catch (e2) {}
      }
      audioRef.current = null
    }
    if (objectUrlRef.current) {
      try { URL.revokeObjectURL(objectUrlRef.current) } catch (e) {}
      objectUrlRef.current = null
    }
    playingTakeIdRef.current = null
    setPlayingTakeId(null)
  }

  function playTakeRecording(take) {
    const recordingId = take && take.recordingId != null ? String(take.recordingId) : ''
    if (!recordingId) return
    if (playingTakeIdRef.current === recordingId) {
      stopTakePlayback()
      return
    }
    stopTakePlayback()
    if (props.onPauseMedia && typeof props.onPauseMedia === 'function') {
      try { props.onPauseMedia() } catch (e) {}
    }
    const requestId = playRequestRef.current
    const resolveBlob = typeof props.resolveTakeAudioBlob === 'function'
      ? props.resolveTakeAudioBlob
      : resolveTakeAudioBlob
    resolveBlob(take, props.blobById).then(function(blob) {
      if (!blob || playRequestRef.current !== requestId) return

      function markPlaying() {
        playingTakeIdRef.current = recordingId
        setPlayingTakeId(recordingId)
      }

      function handleEndedOrError() {
        if (playRequestRef.current === requestId) stopTakePlayback()
      }

      const AudioCtx = typeof window !== 'undefined'
        ? (window.AudioContext || window.webkitAudioContext)
        : null
      if (AudioCtx) {
        const ctx = new AudioCtx()
        audioContextRef.current = ctx
        const resume = (ctx.state === 'suspended' && typeof ctx.resume === 'function')
          ? ctx.resume()
          : Promise.resolve()
        return resume.then(function() {
          return decodeBlobToAudioBuffer(ctx, blob)
        }).then(function(buffer) {
          if (playRequestRef.current !== requestId) {
            try { ctx.close() } catch (e) {}
            return
          }
          const source = ctx.createBufferSource()
          source.buffer = buffer
          source.connect(ctx.destination)
          source.onended = handleEndedOrError
          bufferSourceRef.current = source
          markPlaying()
          source.start(0)
        }).catch(function() {
          if (playRequestRef.current !== requestId) return
          try {
            if (audioContextRef.current === ctx) audioContextRef.current = null
            ctx.close()
          } catch (e) {}
          // Fallback for codecs decodeAudioData rejects (still play the file).
          const played = playBlobWithHtmlAudio(blob, handleEndedOrError, handleEndedOrError)
          audioRef.current = played.audio
          objectUrlRef.current = played.objectUrl
          markPlaying()
        })
      }

      const played = playBlobWithHtmlAudio(blob, handleEndedOrError, handleEndedOrError)
      audioRef.current = played.audio
      objectUrlRef.current = played.objectUrl
      markPlaying()
      return undefined
    })
  }

  useEffect(function() {
    let cancelled = false
    if (!takes.length) {
      setScores({})
      return undefined
    }
    const notes = expectedNotesFromPlayalongTune(props.compareTune || props.tune, props.visualTranspose)
    Promise.all(takes.map(function(take) {
      return loadTakePitchPoints(
        take,
        props.pitchPointsById,
        props.blobById,
        playalongTrackingOptions(props.trackingSettings || loadPlayalongSettings())
      ).then(function(points) {
        const settings = props.trackingSettings || loadPlayalongSettings()
        const summary = scorePlayalongTake(notes, points, {
          musicStartOffsetSeconds: take.musicStartOffsetSeconds,
          tempoBpm: take.tempoBpm,
          playbackSpeed: props.playbackSpeed,
          instrumentId: settings.instrumentId,
        })
        return { recordingId: take.recordingId, pitchPct: summary.pitchPct, skippedSparse: !!summary.skippedSparse }
      })
    })).then(function(rows) {
      if (cancelled) return
      const next = {}
      const scoreTune = props.compareTune || props.tune
      const title = tuneTitleForScore(scoreTune)
      const tuneId = scoreTune && scoreTune.id != null ? String(scoreTune.id) : ''
      rows.forEach(function(row) {
        next[row.recordingId] = row.skippedSparse ? 'skip' : row.pitchPct
        if (row.skippedSparse || row.pitchPct == null || !Number.isFinite(row.pitchPct)) return
        const take = takes.find(function(item) { return item.recordingId === row.recordingId })
        recordPlayalongTopScore({
          recordingId: row.recordingId,
          pitchPct: row.pitchPct,
          createdAt: take && take.createdAt ? take.createdAt : undefined,
          title: title,
          tuneId: tuneId,
        })
        if (typeof props.onTakeScored === 'function') {
          props.onTakeScored(row.recordingId, row.pitchPct)
        }
      })
      setScores(next)
    })
    return function() { cancelled = true }
  }, [takeKey, pitchKey, blobKey, trackingKey, props.compareTune, props.tune, props.visualTranspose, props.playbackSpeed])

  useEffect(function() {
    return function() {
      stopTakePlayback()
    }
  }, [])

  useEffect(function() {
    if (isRecording) stopTakePlayback()
  }, [isRecording])

  return (
    <div className="playalong-inline-record-bar" data-testid="playalong-inline-record-bar">
      {takes.map(function(take, index) {
        const color = REP_COLORS[index % REP_COLORS.length]
        const pct = scores[take.recordingId]
        if (pct === 'skip') return null
        const outlined = !!hiddenTakeIds[take.recordingId]
        const isPlaying = playingTakeId === take.recordingId
        const label = pct != null
          ? ('Take ' + (index + 1) + ' score ' + pct + '%')
          : ('Take ' + (index + 1) + ' score')
        const actionLabel = outlined
          ? (label + ', hidden from piano roll. Show take.')
          : (label + '. Hide take from piano roll.')
        const playLabel = isPlaying
          ? ('Stop take ' + (index + 1) + ' recording')
          : ('Play take ' + (index + 1) + ' recording')
        const chipStyle = outlined
          ? { color: color, borderColor: color }
          : { backgroundColor: color, color: contrastTextForHex(color), borderColor: color }
        return (
          <ButtonGroup
            key={take.recordingId}
            className="playalong-take-score-group"
            data-testid="playalong-take-score-group"
          >
            <button
              type="button"
              className={'playalong-take-score-btn' + (outlined ? ' is-outlined' : '')}
              data-testid="playalong-take-score-button"
              aria-label={actionLabel}
              aria-pressed={outlined}
              title={actionLabel}
              style={chipStyle}
              onClick={function() {
                if (props.onToggleTakeHidden) props.onToggleTakeHidden(take.recordingId)
              }}
            >
              {pct != null ? pct + '%' : '…'}
            </button>
            <button
              type="button"
              className={'playalong-take-play-btn' + (outlined ? ' is-outlined' : '') + (isPlaying ? ' is-playing' : '')}
              data-testid="playalong-take-play-button"
              aria-label={playLabel}
              aria-pressed={isPlaying}
              title={playLabel}
              style={chipStyle}
              onClick={function() {
                playTakeRecording(take)
              }}
            >
              <span className="playalong-take-play-btn-icon" aria-hidden="true">
                {isPlaying
                  ? (icons.stopsmall || icons.stop || '■')
                  : (icons.play || '▶')}
              </span>
            </button>
          </ButtonGroup>
        )
      })}
      <Button
        variant={isRecording ? 'danger' : 'success'}
        className="playalong-inline-record-btn"
        data-testid="playalong-inline-record-button"
        aria-label={isRecording ? 'Stop recording' : 'Record play-along'}
        title={isRecording ? 'Stop recording' : 'Record play-along'}
        aria-pressed={isRecording}
        aria-busy={isWaiting ? 'true' : undefined}
        onClick={function() {
          if (props.onRecordClick) props.onRecordClick()
        }}
      >
        <span
          className={'playalong-record-btn-icon' + (isWaiting ? ' is-waiting' : '')}
          aria-hidden="true"
        >
          {isWaiting
            ? (icons.waiting || '…')
            : (icons.recordcircle || icons.stopsmall || '●')}
        </span>
      </Button>
    </div>
  )
}
