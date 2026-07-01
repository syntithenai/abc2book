import { Button } from 'react-bootstrap'
import PracticeSessionConfigModal from './PracticeSessionConfigModal'
import PracticeSessionModal from './PracticeSessionModal'

export default function PracticeSessionButton(props) {
  const practice = props.practiceSession || {}

  function handleStart(config) {
    if (typeof practice.startSession !== 'function') return
    practice.startSession(config)
  }

  function handleOpenConfig() {
    if (typeof practice.openConfig === 'function') practice.openConfig()
  }

  return (
    <>
      <Button
        variant="primary"
        size={props.buttonSize}
        className={props.buttonClassName || 'header-dropdown-btn'}
        title="Practice session"
        onClick={handleOpenConfig}
      >
        <span className="header-dropdown-btn-label">
          {props.tunebook.icons.reviewsmall}
          <span>Practice</span>
        </span>
      </Button>

      <PracticeSessionConfigModal
        show={!!practice.configOpen}
        onHide={practice.closeConfig}
        onStart={handleStart}
        error={practice.planError || ''}
        tunebook={props.tunebook}
        forceRefresh={props.forceRefresh}
        setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
      />

      <PracticeSessionModal
        show={!!practice.sessionOpen}
        onStop={practice.stopSession}
        onClose={practice.stopSession}
        onNewSession={practice.startNewSession}
        tunebook={props.tunebook}
        tunes={props.tunes || {}}
        plan={practice.plan}
        phase={practice.phase}
        currentStep={practice.currentStep}
        stepIndex={practice.stepIndex}
        practiceViewMode={practice.practiceViewMode}
        currentTempo={practice.currentTempo}
        secondsRemaining={practice.secondsRemaining}
        onWarmupEnded={practice.advanceStep}
      />
    </>
  )
}
