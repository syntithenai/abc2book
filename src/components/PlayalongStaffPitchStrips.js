import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import PlayalongPitchCompareRoll, { playalongRollHeight } from './PlayalongPitchCompareRoll'
import {
  buildPlayalongCompareLines,
  playalongLinesFromDisplayAbc,
  playalongLinesFromTune,
  playalongSoundingMapFromTune,
  transposePlayalongLines,
} from '../playalongLineNotes'
import { beatsPerBarFromMeter } from '../notation/beatGrid'
import {
  buildBeatAnchors,
  measureAbcjsLineLayout,
  mountSvgLineSlice,
} from '../playalongStaffLayout'
import { getRecording } from '../linkRecording'
import { normalizePlayalongTakes } from '../playalongTakes'
import {
  resolvePlayalongTakePitchPoints,
} from '../playalongWaveform'
import { loadPlayalongSettings, playalongTrackingCacheKey, playalongTrackingOptions, playalongTraceStyle } from '../playalongSettings'
import './PlayalongCompareOverlay.css'

const SLICED_CLASS = 'playalong-notation-stack--sliced'

function loadTakePitchPoints(take, pitchPointsById, blobById, tracking) {
  return resolvePlayalongTakePitchPoints(take, pitchPointsById, blobById, {
    getRecording: getRecording,
    tracking: tracking,
  })
}

function viewerStaffWidth() {
  if (typeof document === 'undefined') return 0
  const viewer = document.getElementById('abc_music_viewer')
  const svg = viewer ? viewer.querySelector('svg') : null
  if (!svg || typeof svg.getBoundingClientRect !== 'function') return 0
  return svg.getBoundingClientRect().width
}

function viewerSvg() {
  if (typeof document === 'undefined') return null
  const viewer = document.getElementById('abc_music_viewer')
  return viewer ? viewer.querySelector('svg') : null
}

function slotsLookSame(a, b) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (Math.abs((a[i].sliceTop || 0) - (b[i].sliceTop || 0)) > 0.6) return false
    if (Math.abs((a[i].sliceHeight || 0) - (b[i].sliceHeight || 0)) > 0.6) return false
    if (a[i].height !== b[i].height) return false
    const ax = a[i].barXs || []
    const bx = b[i].barXs || []
    if (ax.length !== bx.length) return false
    for (let j = 0; j < ax.length; j += 1) {
      if (Math.abs(ax[j] - bx[j]) > 0.6) return false
    }
  }
  return true
}

function PlayalongStaffSlice(props) {
  const hostRef = useRef(null)
  useLayoutEffect(function() {
    mountSvgLineSlice(hostRef.current, viewerSvg(), {
      sliceTop: props.sliceTop,
      sliceHeight: props.sliceHeight,
    })
    return function() {
      if (hostRef.current) hostRef.current.innerHTML = ''
    }
  }, [props.sliceTop, props.sliceHeight, props.revision])
  if (!(props.sliceHeight > 0)) return null
  return (
    <div
      ref={hostRef}
      className="playalong-staff-slice"
      style={{ height: props.sliceHeight + 'px' }}
    />
  )
}

export default function PlayalongStaffPitchStrips(props) {
  const tune = props.tune
  const compareTune = props.compareTune || tune
  const takes = normalizePlayalongTakes(props.takes || (tune && tune.playalongTakes))
  const pitchPointsById = props.pitchPointsById || {}
  const blobById = props.blobById || {}
  const visualTranspose = Number(props.visualTranspose) || 0
  const isRecording = !!props.isRecording
  const livePitchPoints = Array.isArray(props.livePitchPoints) ? props.livePitchPoints : []
  const liveTempoBpm = Number(props.liveTempoBpm) > 0 ? Number(props.liveTempoBpm) : 0
  const liveMusicStartOffsetSeconds = Number.isFinite(parseFloat(props.liveMusicStartOffsetSeconds))
    ? parseFloat(props.liveMusicStartOffsetSeconds)
    : 0
  const livePitchPointsRef = useRef(livePitchPoints)
  livePitchPointsRef.current = livePitchPoints
  const getLivePitchSnapshot = useMemo(function() {
    if (typeof props.getLivePitchSnapshot === 'function') return props.getLivePitchSnapshot
    if (!isRecording) return null
    return function() {
      return {
        points: livePitchPointsRef.current,
        musicStartOffsetSeconds: liveMusicStartOffsetSeconds,
        tempoBpm: liveTempoBpm > 0 ? liveTempoBpm : 100,
        version: livePitchPointsRef.current.length,
      }
    }
  }, [
    props.getLivePitchSnapshot,
    isRecording,
    liveMusicStartOffsetSeconds,
    liveTempoBpm,
    props.livePitchVersion,
  ])
  const overlayRef = useRef(null)
  const [decoded, setDecoded] = useState([])
  const decodedRef = useRef([])
  decodedRef.current = decoded
  const [displayLines, setDisplayLines] = useState(null)
  const [slots, setSlots] = useState([])
  const [sliceRevision, setSliceRevision] = useState(0)

  const fallbackLines = useMemo(function() {
    return transposePlayalongLines(playalongLinesFromTune(compareTune), visualTranspose)
  }, [compareTune, visualTranspose])
  const soundingMap = useMemo(function() {
    return playalongSoundingMapFromTune(compareTune)
  }, [compareTune])

  const extractedLines = (displayLines && displayLines.length) ? displayLines : fallbackLines
  const hiddenTakeIds = props.hiddenTakeIds && typeof props.hiddenTakeIds === 'object'
    ? props.hiddenTakeIds
    : {}
  const hiddenKey = Object.keys(hiddenTakeIds).filter(function(id) {
    return hiddenTakeIds[id]
  }).sort().join(',')

  const visibleDecoded = useMemo(function() {
    return decoded.filter(function(trace) {
      const id = trace && trace.take && trace.take.recordingId
      return !(id && hiddenTakeIds[id])
    })
  }, [decoded, hiddenKey])

  // Saved takes only — live tip is painted via rAF overlay, not rebuild.
  const compareLines = useMemo(function() {
    return buildPlayalongCompareLines(extractedLines, visibleDecoded, props.playbackSpeed, soundingMap)
  }, [extractedLines, visibleDecoded, props.playbackSpeed, soundingMap])

  const takeKey = takes.map(function(t) { return t.recordingId }).join(',')
  const pitchKey = Object.keys(pitchPointsById).sort().join(',')
  const blobKey = Object.keys(blobById).sort().join(',')
  const trackingKey = playalongTrackingCacheKey(props.trackingSettings || loadPlayalongSettings())
  const traceStyle = useMemo(function() {
    return playalongTraceStyle(props.trackingSettings || loadPlayalongSettings())
  }, [trackingKey])
  const compareKey = compareLines.map(function(line) {
    return [
      line.patternDurationBeats,
      playalongRollHeight(line.expectedNotes, line.repTraces),
      (line.barBeats || []).length,
      (line.expectedNotes || []).length,
    ].join(':')
  }).join('|')

  useLayoutEffect(function() {
    if (!props.displayAbc) {
      setDisplayLines(null)
      return undefined
    }
    function readLines() {
      const lines = playalongLinesFromDisplayAbc(props.displayAbc, {
        visualTranspose: visualTranspose,
        staffwidth: viewerStaffWidth(),
      })
      setDisplayLines(lines.length ? lines : null)
    }
    readLines()
    window.addEventListener('resize', readLines)
    return function() {
      window.removeEventListener('resize', readLines)
    }
  }, [props.displayAbc, visualTranspose])

  useEffect(function() {
    let cancelled = false
    if (!takes.length) {
      setDecoded([])
      decodedRef.current = []
      if (typeof props.onGraphLoadingChange === 'function') props.onGraphLoadingChange(false)
      return undefined
    }
    const tracking = playalongTrackingOptions(props.trackingSettings || loadPlayalongSettings())
    const prevById = {}
    decodedRef.current.forEach(function(trace) {
      const id = trace && trace.take && trace.take.recordingId
      if (id) prevById[id] = trace
    })
    const toLoad = []
    takes.forEach(function(take, index) {
      const id = take && take.recordingId != null ? String(take.recordingId) : ''
      if (!id) return
      const session = pitchPointsById[id]
      const prev = prevById[id]
      const sessionReady = Array.isArray(session) && session.length >= 8
      // Keep prior decode unless this take is new or live session points just arrived.
      if (prev && (!sessionReady || prev.points === session)) {
        prevById[id] = Object.assign({}, prev, { repIndex: index, take: take })
        return
      }
      toLoad.push({ take: take, index: index })
    })

    // Drop traces for removed takes immediately so the roll stays in sync.
    const kept = takes.map(function(take, index) {
      const id = take && take.recordingId != null ? String(take.recordingId) : ''
      const prev = id ? prevById[id] : null
      // Prefer already-decoded traces (including ones queued for refresh) so the
      // roll does not blank while a single new take loads.
      if (prev && Array.isArray(prev.points) && prev.points.length) {
        return Object.assign({}, prev, { repIndex: index, take: take })
      }
      return null
    }).filter(Boolean)
    setDecoded(kept)
    decodedRef.current = kept

    if (!toLoad.length) {
      if (typeof props.onGraphLoadingChange === 'function') props.onGraphLoadingChange(false)
      return undefined
    }

    // Graph loading is informational only — recording must not wait on it.
    const showLoading = kept.length === 0
    if (showLoading && typeof props.onGraphLoadingChange === 'function') {
      props.onGraphLoadingChange(true)
    }

    Promise.all(toLoad.map(function(item) {
      return loadTakePitchPoints(
        item.take,
        pitchPointsById,
        blobById,
        tracking
      ).then(function(points) {
        return {
          repIndex: item.index,
          take: item.take,
          points: points,
        }
      })
    })).then(function(loaded) {
      if (cancelled) return
      const byId = {}
      decodedRef.current.forEach(function(trace) {
        const id = trace && trace.take && trace.take.recordingId
        if (id) byId[id] = trace
      })
      loaded.forEach(function(trace) {
        const id = trace && trace.take && trace.take.recordingId
        if (id) byId[id] = trace
      })
      const next = takes.map(function(take, index) {
        const id = take && take.recordingId != null ? String(take.recordingId) : ''
        const trace = id ? byId[id] : null
        if (!trace) return null
        return Object.assign({}, trace, { repIndex: index, take: take })
      }).filter(Boolean)
      setDecoded(next)
      decodedRef.current = next
      if (typeof props.onGraphLoadingChange === 'function') props.onGraphLoadingChange(false)
    })
    return function() {
      cancelled = true
    }
  }, [takeKey, pitchKey, blobKey, trackingKey])

  useEffect(function() {
    return function() {
      if (typeof props.onGraphLoadingChange === 'function') props.onGraphLoadingChange(false)
    }
  }, [])

  useLayoutEffect(function() {
    const overlay = overlayRef.current
    const viewer = typeof document !== 'undefined' ? document.getElementById('abc_music_viewer') : null
    const stack = overlay && overlay.closest
      ? overlay.closest('.playalong-notation-stack')
      : null
    if (!overlay || !compareLines.length) {
      if (stack) stack.classList.remove(SLICED_CLASS)
      return undefined
    }

    function layout() {
      const svg = viewerSvg()
      if (!svg) {
        if (stack) stack.classList.remove(SLICED_CLASS)
        setSlots(function(prev) { return prev.length ? [] : prev })
        return
      }
      const measured = measureAbcjsLineLayout(svg, overlay)
      if (stack) stack.classList.add(SLICED_CLASS)
      const next = compareLines.map(function(line, index) {
        const height = playalongRollHeight(line.expectedNotes, line.repTraces)
        const slot = measured.find(function(item) {
          return item.lineIndex === (line.line && line.line.lineIndex != null ? line.line.lineIndex : index)
        }) || measured[index]
        const barXs = ((slot && slot.barXs) || []).filter(function(x) { return Number.isFinite(x) })
        const expectedNotes = line.expectedNotes || []
        const noteXs = (slot && slot.noteXs) || []
        const pairedNoteXs = noteXs.length >= expectedNotes.length
          ? noteXs.slice(0, expectedNotes.length)
          : []
        const startX = slot && slot.noteXs && slot.noteXs.length
          ? slot.noteXs[0]
          : (slot && Number.isFinite(slot.left) ? slot.left : null)
        const endX = slot && Number.isFinite(slot.right) ? slot.right : null
        const sliceTop = slot && Number.isFinite(slot.sliceTop) ? slot.sliceTop : 0
        const sliceHeight = slot && Number.isFinite(slot.sliceHeight) ? slot.sliceHeight : 0
        return {
          height: height,
          sliceTop: sliceTop,
          sliceHeight: sliceHeight,
          barXs: barXs,
          staffLeft: slot && Number.isFinite(slot.left) ? slot.left : null,
          staffRight: slot && Number.isFinite(slot.right) ? slot.right : null,
          beatAnchors: buildBeatAnchors({
            barBeats: line.barBeats,
            barXs: barXs,
            noteBeats: pairedNoteXs.length === expectedNotes.length
              ? expectedNotes.map(function(note) { return note.startBeat })
              : [],
            noteXs: pairedNoteXs,
            patternDurationBeats: line.patternDurationBeats,
            startX: startX,
            endX: endX,
          }),
        }
      })
      setSlots(function(prev) {
        return slotsLookSame(prev, next) ? prev : next
      })
    }

    layout()
    let frame = null
    function schedule() {
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(layout)
    }
    window.addEventListener('resize', schedule)
    let mutations = null
    if (viewer && typeof MutationObserver !== 'undefined') {
      mutations = new MutationObserver(function() {
        setSliceRevision(function(n) { return n + 1 })
        schedule()
      })
      mutations.observe(viewer, { childList: true })
    }
    return function() {
      window.removeEventListener('resize', schedule)
      if (frame) cancelAnimationFrame(frame)
      if (mutations) mutations.disconnect()
      if (stack) stack.classList.remove(SLICED_CLASS)
    }
  }, [compareKey, compareLines.length])

  if (props.showPianoRoll === false) return null
  if (!compareLines.length) return null

  const beatsPerBar = beatsPerBarFromMeter(compareTune && compareTune.meter)

  return (
    <div
      ref={overlayRef}
      className="playalong-staff-pitch-panel"
      data-testid="playalong-pitch-compare"
    >
      {compareLines.map(function(line, index) {
        const slot = slots[index] || {}
        return (
          <div
            key={'staff-pitch-' + (line.line && line.line.lineIndex != null ? line.line.lineIndex : index)}
            className="playalong-interleave-line"
            data-line-index={line.line && line.line.lineIndex != null ? line.line.lineIndex : index}
            data-slice-top={slot.sliceTop || 0}
            data-slice-height={slot.sliceHeight || 0}
          >
            <PlayalongStaffSlice
              sliceTop={slot.sliceTop || 0}
              sliceHeight={slot.sliceHeight || 0}
              revision={sliceRevision}
            />
            <PlayalongPitchCompareRoll
              expectedNotes={line.expectedNotes}
              patternDurationBeats={line.patternDurationBeats}
              barBeats={line.barBeats}
              barXs={slot.barXs}
              beatAnchors={slot.beatAnchors}
              staffLeft={slot.staffLeft}
              staffRight={slot.staffRight}
              beatsPerBar={beatsPerBar}
              repTraces={line.repTraces}
              fitWidth={true}
              height={slot.height || playalongRollHeight(line.expectedNotes, line.repTraces)}
              label={'Heard pitch for notation line ' + (index + 1)}
              liveOverlay={isRecording && !!getLivePitchSnapshot}
              getLivePitchSnapshot={getLivePitchSnapshot}
              line={line.line}
              playbackSpeed={props.playbackSpeed || 1}
              soundingMap={soundingMap}
              liveTempoBpm={liveTempoBpm}
              liveMusicStartOffsetSeconds={liveMusicStartOffsetSeconds}
              traceStyle={traceStyle}
            />
          </div>
        )
      })}
    </div>
  )
}
