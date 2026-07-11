import './PracticeAccuracyOverlay.css'

function formatCents(cents) {
  if (cents == null || !Number.isFinite(cents)) return '—'
  const rounded = Math.round(cents)
  return (rounded > 0 ? '+' : '') + rounded + '¢'
}

function micStatusLabel(status) {
  if (status === 'requesting') return 'Requesting microphone…'
  if (status === 'denied') return 'Microphone blocked — allow access in browser settings'
  if (status === 'unavailable') return 'Microphone not available in this browser'
  if (status === 'error') return 'Microphone setup failed — try refreshing'
  return null
}

function micLevelPercent(level) {
  return Math.round(Math.max(0, Math.min(1, level || 0)) * 100)
}

export default function PracticeAccuracyOverlay(props) {
  const live = props.liveState || {}
  const repSummary = props.repSummary
  const aggregateSummary = props.aggregateSummary
  const showRepSummary = props.showRepSummary
  const resolverPending = props.resolverPending
  const accuracyHint = props.accuracyHint
  const micLevel = live.micLevel != null ? live.micLevel : 0
  const micPercent = micLevelPercent(micLevel)
  const micStatus = live.micStatus || 'idle'
  const statusMessage = micStatusLabel(micStatus)

  return (
    <div className="practice-accuracy-overlay" aria-live="polite">
      {props.enabled ? (
        <div className="practice-accuracy-live">
          <div className="practice-accuracy-mic-meter" aria-label={'Microphone level ' + micPercent + ' percent'}>
            <span className="practice-accuracy-mic-label">Mic</span>
            <div className="practice-accuracy-mic-track">
              <div
                className={'practice-accuracy-mic-fill' + (live.micHeard ? ' practice-accuracy-mic-fill--heard' : '')}
                style={{ width: micPercent + '%' }}
              />
            </div>
            <span className="practice-accuracy-mic-value">{micPercent}%</span>
          </div>

          <div className={'practice-accuracy-cents practice-accuracy-cents--' + (live.intonationBand || 'none')}>
            <span className="practice-accuracy-cents-label">Pitch</span>
            <span className="practice-accuracy-cents-value">{formatCents(live.pitchCents)}</span>
          </div>

          {statusMessage ? (
            <div className="practice-accuracy-mic-status practice-accuracy-mic-status--warn">{statusMessage}</div>
          ) : null}

          {!statusMessage && micStatus === 'active' && !live.micHeard ? (
            <div className="practice-accuracy-mic-status">Sing or play louder — mic is on but very quiet</div>
          ) : null}

          {live.timingHint ? (
            <div className={'practice-accuracy-timing practice-accuracy-timing--' + live.timingHint}>
              {live.timingHint === 'early' ? 'Early' : 'Late'}
            </div>
          ) : null}
          {accuracyHint ? (
            <div className="practice-accuracy-hint">{accuracyHint}</div>
          ) : null}
        </div>
      ) : null}

      {showRepSummary && repSummary ? (
        <div className="practice-accuracy-rep-summary">
          <div className="practice-accuracy-rep-title">
            Rep {repSummary.repIndex != null ? repSummary.repIndex + 1 : ''} pitch: {repSummary.pitchPct}%
            {repSummary.timingPct != null ? ' · timing: ' + repSummary.timingPct + '%' : ''}
            {repSummary.source === 'resolver' ? ' (analysed)' : ''}
          </div>
          {repSummary.missed > 0 ? (
            <div className="practice-accuracy-missed">{repSummary.missed} note(s) missed or unclear</div>
          ) : null}
          {resolverPending ? (
            <div className="practice-accuracy-resolver-pending">Analysing…</div>
          ) : null}
        </div>
      ) : null}

      {aggregateSummary && props.showAggregate ? (
        <div className="practice-accuracy-aggregate">
          <div>
            Average pitch: {aggregateSummary.average && aggregateSummary.average.pitchPct != null
              ? aggregateSummary.average.pitchPct + '%'
              : '—'}
            {aggregateSummary.best ? ' · Best: ' + aggregateSummary.best.pitchPct + '%' : ''}
          </div>
          {aggregateSummary.source === 'resolver' ? (
            <div className="practice-accuracy-resolver-badge">Resolver score</div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
