import { useEffect, useMemo, useRef, useState } from 'react'
import PlayalongLineRoll from './PlayalongLineRoll'
import { playalongLinesFromTune, slicePeaksForLine } from '../playalongLineNotes'
import { decodePeaksFromBlob, peaksDurationSeconds, recordingDataToBlob } from '../playalongWaveform'
import { getRecording } from '../linkRecording'
import { normalizePlayalongTakes } from '../playalongTakes'
import './PlayalongCompareOverlay.css'

function fallbackLineFromTakes(takes, playbackSpeed) {
  const list = Array.isArray(takes) ? takes : []
  if (!list.length) return []
  const newest = list[list.length - 1] || {}
  const duration = parseFloat(newest.duration) || 0
  const offset = parseFloat(newest.musicStartOffsetSeconds) || 0
  const tempoBpm = parseFloat(newest.tempoBpm) > 0 ? parseFloat(newest.tempoBpm) : 100
  const speed = parseFloat(playbackSpeed) > 0 ? parseFloat(playbackSpeed) : 1
  const musicSeconds = Math.max(0.5, duration - offset)
  const endBeat = Math.max(1, (musicSeconds * tempoBpm * speed) / 60)
  return [{
    lineIndex: 0,
    startBeat: 0,
    endBeat: endBeat,
    notes: [],
    synthetic: true,
  }]
}

function loadTakePeaks(take, blobById, peaksById) {
  const sessionPeaks = peaksById && take.recordingId ? peaksById[take.recordingId] : null
  if (sessionPeaks && sessionPeaks.length) {
    return Promise.resolve({
      peaks: sessionPeaks,
      durationSeconds: take.durationSeconds || take.duration || peaksDurationSeconds(sessionPeaks),
    })
  }
  if (take.peaks && take.peaks.length) {
    return Promise.resolve({
      peaks: take.peaks,
      durationSeconds: take.durationSeconds || take.duration || peaksDurationSeconds(take.peaks),
    })
  }
  const cached = blobById && blobById[take.recordingId]
  return getRecording(take.recordingId).then(function(recording) {
    const stored = recording && Array.isArray(recording.waveformPeaks)
      ? recording.waveformPeaks
      : []
    if (stored.length) {
      return {
        peaks: stored,
        durationSeconds: recording.duration || take.duration || peaksDurationSeconds(stored),
      }
    }
    const blob = cached || recordingDataToBlob(recording)
    return decodePeaksFromBlob(blob)
  })
}

export default function PlayalongCompareOverlay(props) {
  const tune = props.tune
  const compareTune = props.compareTune || tune
  const takes = normalizePlayalongTakes(props.takes || (tune && tune.playalongTakes))
  const blobById = props.blobById || {}
  const peaksById = props.peaksById || {}
  const showPianoRoll = props.showPianoRoll !== false
  const showLineRows = props.showLineRows !== false
  const rootRef = useRef(null)
  const extractedLines = useMemo(function() {
    const primary = playalongLinesFromTune(compareTune)
    if (primary.length) return primary
    const fallbackSource = compareTune !== tune ? playalongLinesFromTune(tune) : []
    if (fallbackSource.length) return fallbackSource
    return fallbackLineFromTakes(takes, props.playbackSpeed)
  }, [compareTune, tune, takes, props.playbackSpeed])

  const [decoded, setDecoded] = useState([])

  useEffect(function() {
    const el = rootRef.current
    if (!el || typeof el.scrollIntoView !== 'function') return
    el.scrollIntoView({ block: 'nearest' })
  }, [takes.length, extractedLines.length])

  const takeKey = takes.map(function(t) { return t.recordingId }).join(',')
  const blobKey = Object.keys(blobById).sort().join(',')
  const peaksKey = Object.keys(peaksById).sort().join(',')

  useEffect(function() {
    let cancelled = false
    if (!takes.length) {
      setDecoded([])
      return undefined
    }
    Promise.all(takes.map(function(take) {
      return loadTakePeaks(take, blobById, peaksById).then(function(result) {
        return Object.assign({}, take, {
          peaks: result.peaks || [],
          durationSeconds: result.durationSeconds || take.duration || 0,
        })
      }).catch(function() {
        return Object.assign({}, take, { peaks: [], durationSeconds: take.duration || 0 })
      })
    })).then(function(next) {
      if (!cancelled) setDecoded(next)
    })
    return function() { cancelled = true }
  }, [takeKey, blobKey, peaksKey])

  const lineTakes = useMemo(function() {
    return extractedLines.map(function(line) {
      return decoded.map(function(take) {
        return Object.assign({}, take, {
          linePeaks: slicePeaksForLine(take.peaks, take.durationSeconds, {
            startBeat: line.startBeat,
            endBeat: line.endBeat,
            musicStartOffsetSeconds: take.musicStartOffsetSeconds,
            tempoBpm: take.tempoBpm || 100,
            playbackSpeed: props.playbackSpeed || 1,
          }),
        })
      })
    })
  }, [extractedLines, decoded, props.playbackSpeed])

  if (!takes.length) return null

  return (
    <div className="playalong-compare" data-testid="playalong-compare" ref={rootRef}>
      <div className="playalong-compare-header">
        <span className="playalong-compare-title">
          Audio compare · {takes.length} {takes.length === 1 ? 'take' : 'takes'}
          {props.isRecording && props.takeNumber > 0
            ? ' · recording ' + props.takeNumber + '/' + (props.takeMax || 10)
            : ''}
        </span>
      </div>
      {props.error ? (
        <div className="playalong-compare-error" role="status">{props.error}</div>
      ) : null}
      {showLineRows ? extractedLines.map(function(line, index) {
        return (
          <div key={'line-' + index} className="playalong-compare-line">
            <div className="playalong-compare-line-label">
              {line.synthetic ? 'Whole tune' : 'Line ' + (index + 1)}
            </div>
            {showPianoRoll ? (
              <PlayalongLineRoll
                notes={line.notes}
                startBeat={line.startBeat}
                endBeat={line.endBeat}
                takes={lineTakes[index] || []}
                label={'Piano roll for notation line ' + (index + 1)}
              />
            ) : (
              <div className="playalong-compare-hidden">Piano roll hidden</div>
            )}
          </div>
        )
      }) : null}
    </div>
  )
}
