import './PracticeAccuracyOverlay.css'
import { isFarFromTarget } from '../tunerlib/tunerDisplayUtils'
import {
  referenceGainToSliderPercent,
  sliderPercentToReferenceGain,
  DEFAULT_PRACTICE_SETTINGS,
} from '../practiceSessionSettings'

const CENTS_DISPLAY_CAP = 99

function formatCents(cents) {
  if (cents == null || !Number.isFinite(cents)) return '—'
  const rounded = Math.round(cents)
  if (Math.abs(rounded) > CENTS_DISPLAY_CAP) {
    return (rounded > 0 ? '>+' : '<-') + CENTS_DISPLAY_CAP + '¢'
  }
  return (rounded > 0 ? '+' : '') + rounded + '¢'
}

function micStatusLabel(status) {
  if (status === 'requesting') return 'Requesting mic…'
  if (status === 'denied') return 'Mic blocked'
  if (status === 'unavailable') return 'Mic unavailable'
  if (status === 'error') return 'Mic failed'
  return null
}

function micLevelPercent(level) {
  return Math.round(Math.max(0, Math.min(1, level || 0)) * 100)
}

function buildMiddleStatus(props, statusMessage, quietHint) {
  const parts = []
  if (statusMessage) parts.push(statusMessage)
  else if (quietHint) parts.push(quietHint)
  if (props.accuracyHint) parts.push(props.accuracyHint)

  if (props.showRepSummary && props.repSummary) {
    const rep = props.repSummary
    let repText = 'Rep ' + (rep.repIndex != null ? rep.repIndex + 1 : '') + ' pitch ' + rep.pitchPct + '%'
    if (rep.timingPct != null) repText += ' · timing ' + rep.timingPct + '%'
    if (rep.missed > 0) repText += ' · ' + rep.missed + ' missed'
    if (props.resolverPending) repText += ' · analysing…'
    parts.push(repText.trim())
  } else if (props.resolverPending) {
    parts.push('Analysing…')
  }

  if (props.showAggregate && props.aggregateSummary) {
    const agg = props.aggregateSummary
    const avg = agg.average && agg.average.pitchPct != null ? agg.average.pitchPct + '%' : '—'
    parts.push('Avg pitch ' + avg)
  }

  return parts.filter(Boolean).join(' — ')
}

export default function PracticeAccuracyOverlay(props) {
  const live = props.liveState || {}
  const volume = props.volume != null ? props.volume : DEFAULT_PRACTICE_SETTINGS.practiceReferenceGain
  const onVolumeChange = props.onVolumeChange
  const micLevel = live.micLevel != null ? live.micLevel : 0
  const micPercent = micLevelPercent(micLevel)
  const micStatus = live.micStatus || 'idle'
  const statusMessage = micStatusLabel(micStatus)
  const quietHint = !statusMessage && micStatus === 'active' && !live.micHeard
    ? 'Sing louder'
    : null
  const far = isFarFromTarget(live.pitchCents)
  const middleStatus = buildMiddleStatus(props, statusMessage, quietHint)
  const volumePercent = referenceGainToSliderPercent(volume)
  const warnStatus = !!(statusMessage || quietHint)

  if (!props.enabled) return null

  return (
    <div className="practice-accuracy-overlay" aria-live="polite">
      <div className="practice-accuracy-live" title={middleStatus || undefined}>
        <div className="practice-accuracy-mic-meter" aria-label={'Microphone level ' + micPercent + ' percent'}>
          <span className="practice-accuracy-mic-label">Mic</span>
          <div className="practice-accuracy-mic-track">
            <div
              className={'practice-accuracy-mic-fill' + (live.micHeard ? ' practice-accuracy-mic-fill--heard' : '')}
              style={{ width: micPercent + '%' }}
            />
          </div>
        </div>

        <div className={'practice-accuracy-cents practice-accuracy-cents--' + (live.intonationBand || 'none')}>
          <span className="practice-accuracy-cents-label">Pitch</span>
          <span className="practice-accuracy-cents-value">{formatCents(live.pitchCents)}</span>
          {far ? <span className="practice-accuracy-cents-far">far</span> : null}
        </div>

        {live.timingHint ? (
          <span className={'practice-accuracy-timing practice-accuracy-timing--' + live.timingHint}>
            {live.timingHint === 'early' ? 'Early' : 'Late'}
          </span>
        ) : null}

        <span
          className={
            'practice-accuracy-inline-status'
            + (warnStatus ? ' practice-accuracy-inline-status--warn' : '')
            + (middleStatus ? '' : ' practice-accuracy-inline-status--empty')
          }
        >
          {middleStatus || '\u00a0'}
        </span>

        {typeof onVolumeChange === 'function' ? (
          <label className="practice-accuracy-volume" title={'Reference volume ' + volumePercent + '%'}>
            <span className="practice-accuracy-volume-label">Vol</span>
            <input
              type="range"
              className="practice-accuracy-volume-slider"
              min={0}
              max={100}
              step={1}
              value={volumePercent}
              aria-label="Reference playback volume"
              onChange={function(e) {
                onVolumeChange(sliderPercentToReferenceGain(e.target.value))
              }}
            />
          </label>
        ) : null}
      </div>
    </div>
  )
}
