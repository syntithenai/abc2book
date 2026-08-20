import { useLocation, useNavigate } from 'react-router-dom'
import PracticeSessionConfigModal from './PracticeSessionConfigModal'
import PracticeSessionModal from './PracticeSessionModal'
import { isPracticeRoute, leavePracticeRoute } from '../usePracticeRouteSync'

/**
 * Renders practice config and the full-page session at app root so they stay
 * mounted when the header dropdown closes (otherwise the session clock and
 * tempo UI freeze).
 */
export default function PracticeSessionModals(props) {
  const practice = props.practiceSession || {}
  const location = useLocation()
  const navigate = useNavigate()

  function handleStart(config) {
    if (props.mediaController && props.mediaController.preparePlaybackFromUserGesture) {
      // Unlock audio for warmup autoplay without arming shared playing intent.
      // Arming here made leaving practice look like the previous tune was playing.
      props.mediaController.preparePlaybackFromUserGesture({ armIntent: false })
    }
    if (typeof practice.armPlaybackGesture === 'function') {
      practice.armPlaybackGesture()
    }
    if (typeof practice.startSession !== 'function') return
    practice.startSession(config)
  }

  function handleCloseConfig() {
    if (typeof practice.closeConfig === 'function') practice.closeConfig()
    if (isPracticeRoute(location.pathname) && !practice.sessionOpen) {
      leavePracticeRoute(navigate)
    }
  }

  function handleStopSession() {
    if (typeof practice.stopSession === 'function') practice.stopSession()
    if (isPracticeRoute(location.pathname)) {
      leavePracticeRoute(navigate)
    }
  }

  function handleNewSession() {
    if (typeof practice.startNewSession === 'function') practice.startNewSession()
  }

  return (
    <>
      <PracticeSessionConfigModal
        show={!!practice.configOpen}
        onHide={handleCloseConfig}
        onStart={handleStart}
        error={practice.planError || ''}
        tunebook={props.tunebook}
        forceRefresh={props.forceRefresh}
        setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
      />

      <PracticeSessionModal
        show={!!practice.sessionOpen}
        onStop={handleStopSession}
        onClose={handleStopSession}
        onNewSession={handleNewSession}
        tunebook={props.tunebook}
        tunes={props.tunes || {}}
        plan={practice.plan}
        phase={practice.phase}
        currentStep={practice.currentStep}
        stepIndex={practice.stepIndex}
        practiceViewMode={practice.practiceViewMode}
        onPracticeViewModeChange={practice.setPracticeViewMode}
        forceRefresh={props.forceRefresh}
        currentTempo={practice.currentTempo}
        secondsRemaining={practice.secondsRemaining}
        mediaController={props.mediaController}
        onWarmupEnded={practice.advanceStep}
        onSkipTune={practice.advanceStep}
        onTunePlaybackStarted={practice.startPendingTempoRamp}
        consumePlaybackGesture={practice.consumePlaybackGesture}
        hasPlaybackGesture={practice.hasPlaybackGesture}
        armPlaybackGesture={practice.armPlaybackGesture}
        sessionGeneration={practice.sessionGeneration}
        setSessionClockPaused={practice.setSessionClockPaused}
      />
    </>
  )
}
