import { useEffect, useState } from 'react'
import { Button, Form, Modal } from 'react-bootstrap'
import {
  SLEEP_TIMER_PRESETS_MINUTES,
  startPlaybackSleepTimer,
  cancelPlaybackSleepTimer,
  subscribePlaybackSleepTimer,
  getPlaybackSleepTimerState,
  formatSleepTimerCountdown,
  sleepTimerDurationFromParts,
} from '../playbackSleepTimer'

function formatPresetLabel(minutes) {
  if (minutes < 60) return minutes + ' min'
  if (minutes % 60 === 0) return (minutes / 60) + ' hr'
  return Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'm'
}

export default function SleepTimerModal(props) {
  const show = !!props.show
  const [timerState, setTimerState] = useState(getPlaybackSleepTimerState)
  const [hours, setHours] = useState('0')
  const [minutes, setMinutes] = useState('30')

  useEffect(function() {
    return subscribePlaybackSleepTimer(setTimerState)
  }, [])

  useEffect(function() {
    if (!show) return
    setTimerState(getPlaybackSleepTimerState())
  }, [show])

  useEffect(function() {
    if (typeof props.setBlockKeyboardShortcuts !== 'function') return undefined
    props.setBlockKeyboardShortcuts(!!show)
    return function() {
      props.setBlockKeyboardShortcuts(false)
    }
  }, [show, props.setBlockKeyboardShortcuts])

  const durationMs = sleepTimerDurationFromParts(hours, minutes)
  const canStart = durationMs != null

  function handleStart() {
    if (!canStart) return
    if (startPlaybackSleepTimer(durationMs)) {
      if (typeof props.onHide === 'function') props.onHide()
    }
  }

  function handlePreset(presetMinutes) {
    setHours(String(Math.floor(presetMinutes / 60)))
    setMinutes(String(presetMinutes % 60))
  }

  function handleCancelTimer() {
    cancelPlaybackSleepTimer()
  }

  return (
    <Modal
      show={show}
      onHide={props.onHide}
      centered
      size="sm"
      style={props.dialogZIndex ? { zIndex: props.dialogZIndex } : undefined}
      backdropClassName={props.dialogZIndex ? 'sleep-timer-modal-backdrop-elevated' : undefined}
    >
      <Modal.Header closeButton>
        <Modal.Title>Sleep Timer</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {timerState.active ? (
          <div className="sleep-timer-modal-active" data-testid="sleep-timer-active">
            <p className="sleep-timer-modal-countdown mb-3" aria-live="polite">
              Stops in <strong>{formatSleepTimerCountdown(timerState.remainingMs)}</strong>
            </p>
            <Button
              variant="outline-danger"
              className="w-100"
              data-testid="sleep-timer-cancel"
              onClick={handleCancelTimer}
            >
              Cancel timer
            </Button>
          </div>
        ) : (
          <div className="sleep-timer-modal-setup" data-testid="sleep-timer-setup">
            <p className="text-muted small mb-2">
              Playback will stop automatically after the time you set.
            </p>
            <div className="sleep-timer-modal-presets mb-3" role="group" aria-label="Sleep timer presets">
              {SLEEP_TIMER_PRESETS_MINUTES.map(function(preset) {
                return (
                  <Button
                    key={preset}
                    type="button"
                    size="sm"
                    variant="outline-secondary"
                    data-testid={'sleep-timer-preset-' + preset}
                    onClick={function() { handlePreset(preset) }}
                  >
                    {formatPresetLabel(preset)}
                  </Button>
                )
              })}
            </div>
            <div className="sleep-timer-modal-fields d-flex align-items-end gap-2 mb-3">
              <Form.Group controlId="sleep-timer-hours" className="mb-0 flex-fill">
                <Form.Label className="small mb-1">Hours</Form.Label>
                <Form.Control
                  type="number"
                  min="0"
                  max="12"
                  step="1"
                  value={hours}
                  data-testid="sleep-timer-hours"
                  onChange={function(e) { setHours(e.target.value) }}
                />
              </Form.Group>
              <Form.Group controlId="sleep-timer-minutes" className="mb-0 flex-fill">
                <Form.Label className="small mb-1">Minutes</Form.Label>
                <Form.Control
                  type="number"
                  min="0"
                  max="59"
                  step="1"
                  value={minutes}
                  data-testid="sleep-timer-minutes"
                  onChange={function(e) { setMinutes(e.target.value) }}
                />
              </Form.Group>
            </div>
            <Button
              variant="primary"
              className="w-100"
              disabled={!canStart}
              data-testid="sleep-timer-start"
              onClick={handleStart}
            >
              Start
            </Button>
          </div>
        )}
      </Modal.Body>
    </Modal>
  )
}
