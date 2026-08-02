import { useCallback, useEffect, useRef } from 'react'
import { slotBeatIndex } from '../metronomeRhythmPresets'
import {
  EDITOR_SUBDIVISION_BEATS,
  beatGroupIsOn,
  setDrumBeatSteps,
} from '../rhythmGranularity'
import {
  cycleDrumStepSample,
  getDrumStepSample,
  getDrumStepVelocity,
  HAT_OPEN,
  setDrumStep,
  setDrumStepVelocity,
} from '../rhythmEngineTypes'
import { primeDrumKit, playDrumHit } from '../drumSampleKit'

export default function DrumPatternGrid(props) {
  const rhythm = props.rhythm
  const drumPattern = props.drumPattern
  const disabled = !!props.disabled
  const subdivision = props.subdivision
  const isBeatView = subdivision === EDITOR_SUBDIVISION_BEATS
  const totalSlots = props.totalSlots
  const activeSlot = props.activeSlot
  const selectedTrackIndex = props.selectedTrackIndex != null ? props.selectedTrackIndex : 0
  const selectedStep = props.selectedStep != null ? props.selectedStep : 0
  const showVelocityLanes = !!props.showVelocityLanes
  const flashSlot = props.flashSlot
  const containerRef = useRef(null)
  const paintRef = useRef(null)

  const gridColumnTemplate = '3.25rem repeat(' + totalSlots + ', 1.35rem)'

  const applyStep = useCallback(function(trackId, stepIndex, value) {
    if (!drumPattern || !props.onPatternChange) return
    props.onPatternChange(setDrumStep(drumPattern, trackId, stepIndex, value))
  }, [drumPattern, props.onPatternChange])

  const applyBeatStep = useCallback(function(trackId, beatIndex, value) {
    if (!drumPattern || !props.onPatternChange) return
    props.onPatternChange(setDrumBeatSteps(drumPattern, trackId, beatIndex, rhythm, value))
  }, [drumPattern, props.onPatternChange, rhythm])

  const cycleStep = useCallback(function(trackId, stepIndex) {
    if (!drumPattern || !props.onPatternChange) return
    props.onPatternChange(cycleDrumStepSample(drumPattern, trackId, stepIndex))
  }, [drumPattern, props.onPatternChange])

  function beginPaint(trackId, columnIndex, pointerType) {
    if (disabled || !drumPattern) return
    const track = drumPattern.tracks.find(function(t) { return t.id === trackId })
    if (!track) return

    if (isBeatView) {
      const paintOn = !beatGroupIsOn(track, rhythm, columnIndex)
      paintRef.current = { trackId: trackId, paintOn: paintOn, beatView: true }
      applyBeatStep(trackId, columnIndex, paintOn)
      if (props.onSelectionChange) props.onSelectionChange(trackId, columnIndex)
      return
    }

    const steps = track.steps || []
    const index = ((columnIndex % steps.length) + steps.length) % steps.length
    const paintOn = !steps[index]
    paintRef.current = { trackId: trackId, paintOn: paintOn, pointerType: pointerType || 'mouse' }
    if (pointerType === 'cycle' || (trackId === 'hat' && pointerType === 'alt')) {
      cycleStep(trackId, index)
      if (props.onSelectionChange) props.onSelectionChange(trackId, index)
      return
    }
    applyStep(trackId, index, paintOn)
    if (props.onSelectionChange) props.onSelectionChange(trackId, index)
  }

  function continuePaint(trackId, columnIndex) {
    if (disabled || !paintRef.current || paintRef.current.trackId !== trackId) return
    if (paintRef.current.beatView) {
      applyBeatStep(trackId, columnIndex, paintRef.current.paintOn)
      if (props.onSelectionChange) props.onSelectionChange(trackId, columnIndex)
      return
    }
    applyStep(trackId, columnIndex, paintRef.current.paintOn)
    if (props.onSelectionChange) props.onSelectionChange(trackId, columnIndex)
  }

  function endPaint() {
    paintRef.current = null
  }

  useEffect(function() {
    function onPointerUp() { endPaint() }
    window.addEventListener('mouseup', onPointerUp)
    window.addEventListener('touchend', onPointerUp)
    return function() {
      window.removeEventListener('mouseup', onPointerUp)
      window.removeEventListener('touchend', onPointerUp)
    }
  }, [])

  function auditionTrack(track) {
    if (!props.audioContext || !track) return
    primeDrumKit(props.audioContext).then(function() {
      playDrumHit(props.audioContext, props.audioContext.currentTime, track.sample, track.velocity, 0)
    }).catch(function() { /* ignore */ })
  }

  function cellClass(track, columnIndex, step) {
    const pulseIndex = isBeatView ? -1 : columnIndex
    const isPlayhead = isBeatView
      ? (activeSlot >= 0 && slotBeatIndex(rhythm, activeSlot) === columnIndex)
      : (columnIndex === activeSlot)
    const isSelected = props.tracks && props.tracks[selectedTrackIndex]
      && props.tracks[selectedTrackIndex].id === track.id
      && columnIndex === selectedStep
    const beatIndex = isBeatView ? columnIndex : slotBeatIndex(rhythm, columnIndex)
    const isBeatStart = isBeatView
      || columnIndex === 0
      || slotBeatIndex(rhythm, columnIndex - 1) !== beatIndex
    const sample = isBeatView ? null : getDrumStepSample(track, pulseIndex)
    const isOpenHat = step && track.id === 'hat' && sample === HAT_OPEN
    const isFlash = flashSlot
      && flashSlot.trackId === track.id
      && (isBeatView
        ? slotBeatIndex(rhythm, flashSlot.slotIndex) === columnIndex
        : flashSlot.slotIndex === columnIndex)
    return [
      'drum-pattern-editor__grid-cell',
      step ? ' is-on' : '',
      isOpenHat ? ' is-hat-open' : '',
      isPlayhead ? ' is-active' : '',
      isSelected ? ' is-selected' : '',
      isBeatStart ? ' is-beat-start' : '',
      isFlash ? ' is-flash' : '',
    ].join('')
  }

  if (!drumPattern) return null

  const tracks = drumPattern.tracks || []

  return (
    <div className="drum-pattern-editor__grid-wrap" ref={containerRef} tabIndex={0}>
      <div className="drum-pattern-editor__grid" role="grid" aria-label="Drum pattern">
        <div
          className="drum-pattern-editor__grid-header"
          role="row"
          style={{ gridTemplateColumns: gridColumnTemplate }}
        >
          <div className="drum-pattern-editor__grid-label-cell" role="columnheader" />
          {Array.from({ length: totalSlots }).map(function(_, columnIndex) {
            const beatIndex = isBeatView ? columnIndex : slotBeatIndex(rhythm, columnIndex)
            const isBeatStart = isBeatView
              || columnIndex === 0
              || slotBeatIndex(rhythm, columnIndex - 1) !== beatIndex
            const isPlayhead = isBeatView
              ? (activeSlot >= 0 && slotBeatIndex(rhythm, activeSlot) === columnIndex)
              : (columnIndex === activeSlot)
            return (
              <div
                key={'hdr-' + columnIndex}
                className={'drum-pattern-editor__grid-slot-header'
                  + (isBeatStart ? ' is-beat-start' : '')
                  + (isPlayhead ? ' is-active' : '')}
                role="columnheader"
              >
                {isBeatStart ? (beatIndex + 1) : ''}
              </div>
            )
          })}
        </div>
        {tracks.map(function(track) {
          return (
            <div key={track.id}>
              <div
                className="drum-pattern-editor__grid-row"
                role="row"
                style={{ gridTemplateColumns: gridColumnTemplate }}
              >
                <button
                  type="button"
                  className="drum-pattern-editor__grid-label-cell drum-pattern-editor__grid-label-button"
                  role="rowheader"
                  disabled={disabled}
                  title={'Audition ' + track.label}
                  onClick={function() {
                    auditionTrack(track)
                    if (props.onSelectionChange) props.onSelectionChange(track.id, selectedStep)
                  }}
                >
                  {track.label}
                </button>
                {Array.from({ length: totalSlots }).map(function(_, columnIndex) {
                  const step = isBeatView
                    ? beatGroupIsOn(track, rhythm, columnIndex)
                    : (track.steps || [])[columnIndex]
                  return (
                    <button
                      key={track.id + '-' + columnIndex}
                      type="button"
                      className={cellClass(track, columnIndex, step)}
                      disabled={disabled}
                      aria-label={track.label + ' ' + (isBeatView ? 'beat' : 'step') + ' ' + (columnIndex + 1)}
                      onMouseDown={function(e) {
                        e.preventDefault()
                        beginPaint(track.id, columnIndex, e.altKey ? 'alt' : 'mouse')
                      }}
                      onMouseEnter={function() { continuePaint(track.id, columnIndex) }}
                      onTouchStart={function(e) {
                        e.preventDefault()
                        beginPaint(track.id, columnIndex, 'touch')
                      }}
                      onTouchMove={function(e) {
                        const touch = e.touches[0]
                        if (!touch) return
                        const el = document.elementFromPoint(touch.clientX, touch.clientY)
                        if (el && el.dataset && el.dataset.trackId === track.id) {
                          continuePaint(track.id, parseInt(el.dataset.stepIndex, 10))
                        }
                      }}
                      data-track-id={track.id}
                      data-step-index={columnIndex}
                      onContextMenu={function(e) {
                        if (isBeatView || track.id !== 'hat') return
                        e.preventDefault()
                        beginPaint(track.id, columnIndex, 'cycle')
                      }}
                    />
                  )
                })}
              </div>
              {showVelocityLanes && !isBeatView ? (
                <VelocityLane
                  track={track}
                  totalSlots={totalSlots}
                  gridColumnTemplate={gridColumnTemplate}
                  rhythm={rhythm}
                  disabled={disabled}
                  onPatternChange={props.onPatternChange}
                  drumPattern={drumPattern}
                />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function VelocityLane(props) {
  const { track, totalSlots, gridColumnTemplate, rhythm, disabled, drumPattern } = props
  const laneRef = useRef(null)
  const dragRef = useRef(null)

  function setVelocity(stepIndex, value) {
    if (!drumPattern || !props.onPatternChange) return
    props.onPatternChange(setDrumStepVelocity(drumPattern, track.id, stepIndex, value))
  }

  function pointerToStep(clientX) {
    const lane = laneRef.current
    if (!lane) return 0
    const rect = lane.getBoundingClientRect()
    const labelWidth = 52
    const usable = rect.width - labelWidth
    const x = Math.max(0, Math.min(usable, clientX - rect.left - labelWidth))
    const stepWidth = usable / totalSlots
    return Math.max(0, Math.min(totalSlots - 1, Math.floor(x / stepWidth)))
  }

  function onPointerDown(e) {
    if (disabled) return
    const stepIndex = pointerToStep(e.clientX)
    dragRef.current = { stepIndex: stepIndex }
    const y = e.clientY
    const rect = laneRef.current.getBoundingClientRect()
    const value = Math.max(0, Math.min(1, 1 - (y - rect.top) / (rect.height || 1)))
    setVelocity(stepIndex, value)
  }

  function onPointerMove(e) {
    if (!dragRef.current) return
    const stepIndex = pointerToStep(e.clientX)
    dragRef.current.stepIndex = stepIndex
    const rect = laneRef.current.getBoundingClientRect()
    const value = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / (rect.height || 1)))
    setVelocity(stepIndex, value)
  }

  function onPointerUp() {
    dragRef.current = null
  }

  useEffect(function() {
    window.addEventListener('mouseup', onPointerUp)
    window.addEventListener('mousemove', onPointerMove)
    return function() {
      window.removeEventListener('mouseup', onPointerUp)
      window.removeEventListener('mousemove', onPointerMove)
    }
  })

  return (
    <div
      ref={laneRef}
      className="drum-pattern-editor__velocity-lane"
      style={{ gridTemplateColumns: gridColumnTemplate }}
      role="row"
    >
      <div className="drum-pattern-editor__grid-label-cell drum-pattern-editor__velocity-label">Vel</div>
      {Array.from({ length: totalSlots }).map(function(_, stepIndex) {
        const steps = track.steps || []
        const on = !!steps[stepIndex]
        const velocity = on ? getDrumStepVelocity(track, stepIndex) : 0
        const beatIndex = slotBeatIndex(rhythm, stepIndex)
        const isBeatStart = stepIndex === 0 || slotBeatIndex(rhythm, stepIndex - 1) !== beatIndex
        return (
          <div
            key={track.id + '-vel-' + stepIndex}
            className={'drum-pattern-editor__velocity-cell'
              + (isBeatStart ? ' is-beat-start' : '')
              + (on ? '' : ' is-off')}
          >
            {on ? (
              <div
                className="drum-pattern-editor__velocity-bar"
                style={{ height: Math.round(velocity * 100) + '%' }}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
