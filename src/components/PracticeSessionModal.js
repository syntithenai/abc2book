import { Modal, Button } from 'react-bootstrap'
import Abc from './Abc'
import PracticeTuneDisplay from './PracticeTuneDisplay'
import { getPracticeSessionCopy, formatPracticeTimeRemaining } from '../practiceSessionCopy'
import './PracticeSessionModal.css'

export default function PracticeSessionModal(props) {
  const phase = props.phase || 'idle'
  const isEnded = phase === 'ended'
  const plan = props.plan
  const currentStep = props.currentStep
  const copy = getPracticeSessionCopy(currentStep, {
    currentTempo: props.currentTempo,
    phase: isEnded ? 'ended' : 'running',
  })
  const stepCount = plan && plan.steps ? plan.steps.length : 0
  const stepNumber = props.stepIndex != null ? props.stepIndex + 1 : 0
  const tune = currentStep && currentStep.type === 'tune' && props.tunes
    ? props.tunes[String(currentStep.tuneId)]
    : null

  return (
    <Modal
      show={!!props.show}
      onHide={isEnded ? props.onClose : props.onStop}
      fullscreen={true}
      backdrop="static"
      className={'practice-session-modal' + (isEnded ? ' practice-session-ended' : '')}
      style={{ zIndex: 1200 }}
    >
      <Modal.Header className="practice-session-header">
        <Modal.Title>Practice</Modal.Title>
        <div className="practice-session-header-actions">
          {isEnded ? (
            <>
              <Button variant="primary" onClick={props.onNewSession}>New Session</Button>
              <Button variant="outline-secondary" onClick={props.onClose}>Close</Button>
            </>
          ) : (
            <Button variant="danger" onClick={props.onStop}>Stop</Button>
          )}
        </div>
      </Modal.Header>
      <Modal.Body className="practice-session-body">
        <div className={'practice-session-instruction' + (isEnded ? ' practice-session-instruction-complete' : '')}>
          <div className="practice-session-instruction-happening">{copy.happening}</div>
          <div className="practice-session-instruction-action">{copy.action}</div>
        </div>

        {!isEnded ? (
          <div className="practice-session-meta">
            <span>Time left: {formatPracticeTimeRemaining(props.secondsRemaining || 0)}</span>
            {currentStep && currentStep.type === 'tune' ? (
              <span>Tempo: {Math.round((props.currentTempo || 0.5) * 100)}%</span>
            ) : null}
            {stepCount > 0 ? <span>Step {stepNumber} of {stepCount}</span> : null}
            {plan && plan.practiceKey ? <span>Key: {plan.practiceKey}</span> : null}
            {plan && plan.skillLevel ? <span>Skill: {plan.skillLevel}</span> : null}
          </div>
        ) : null}

        {currentStep && currentStep.type === 'warmup' && currentStep.abc ? (
          <div className="practice-session-warmup-notation">
            <Abc
              key={'warmup-' + props.stepIndex}
              abc={currentStep.abc}
              tunebook={props.tunebook}
              autoPrime={true}
              practiceAutoPlay={true}
              repeat={1}
              hidePlayer={true}
              hideSvg={false}
              editableTempo={false}
              metronomeCountIn={true}
              metronomeCountInBeats={8}
              meter="4/4"
              onEnded={props.onWarmupEnded}
            />
          </div>
        ) : null}

        {currentStep && currentStep.type === 'tune' && tune ? (
          <div className="practice-session-tune-display">
            <PracticeTuneDisplay
              tune={tune}
              tunebook={props.tunebook}
              viewMode={props.practiceViewMode}
            />
          </div>
        ) : null}
      </Modal.Body>
    </Modal>
  )
}
