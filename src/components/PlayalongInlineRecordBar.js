import { useEffect, useState } from 'react'
import { Button } from 'react-bootstrap'
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
import { REP_COLORS } from './PracticeWarmupPitchRoll'
import './PlayalongCompareOverlay.css'

function loadTakePitchPoints(take, pitchPointsById, blobById, tracking) {
  return resolvePlayalongTakePitchPoints(take, pitchPointsById, blobById, {
    getRecording: getRecording,
    tracking: tracking,
  })
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

  const takeKey = takes.map(function(take) { return take.recordingId }).join(',')
  const pitchKey = Object.keys(props.pitchPointsById || {}).sort().join(',')
  const blobKey = Object.keys(props.blobById || {}).sort().join(',')
  const trackingKey = playalongTrackingCacheKey(props.trackingSettings || loadPlayalongSettings())

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
        const summary = scorePlayalongTake(notes, points, {
          musicStartOffsetSeconds: take.musicStartOffsetSeconds,
          tempoBpm: take.tempoBpm,
          playbackSpeed: props.playbackSpeed,
        })
        return { recordingId: take.recordingId, pitchPct: summary.pitchPct, skippedSparse: !!summary.skippedSparse }
      })
    })).then(function(rows) {
      if (cancelled) return
      const next = {}
      rows.forEach(function(row) {
        next[row.recordingId] = row.skippedSparse ? 'skip' : row.pitchPct
      })
      setScores(next)
    })
    return function() { cancelled = true }
  }, [takeKey, pitchKey, blobKey, trackingKey, props.compareTune, props.tune, props.visualTranspose, props.playbackSpeed])

  return (
    <div className="playalong-inline-record-bar" data-testid="playalong-inline-record-bar">
      {takes.map(function(take, index) {
        const color = REP_COLORS[index % REP_COLORS.length]
        const pct = scores[take.recordingId]
        if (pct === 'skip') return null
        const outlined = !!hiddenTakeIds[take.recordingId]
        const label = pct != null
          ? ('Take ' + (index + 1) + ' score ' + pct + '%')
          : ('Take ' + (index + 1) + ' score')
        const actionLabel = outlined
          ? (label + ', hidden from piano roll. Show take.')
          : (label + '. Hide take from piano roll.')
        return (
          <button
            type="button"
            key={take.recordingId}
            className={'playalong-take-score-btn' + (outlined ? ' is-outlined' : '')}
            data-testid="playalong-take-score-button"
            aria-label={actionLabel}
            aria-pressed={outlined}
            title={actionLabel}
            style={outlined
              ? { color: color, borderColor: color }
              : { backgroundColor: color, color: contrastTextForHex(color), borderColor: color }}
            onClick={function() {
              if (props.onToggleTakeHidden) props.onToggleTakeHidden(take.recordingId)
            }}
          >
            {pct != null ? pct + '%' : '…'}
          </button>
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
