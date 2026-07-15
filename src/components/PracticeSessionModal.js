import { useState, useEffect, useRef } from 'react'
import { Modal, Button } from 'react-bootstrap'
import Abc from './Abc'
import PracticeTuneDisplay from './PracticeTuneDisplay'
import PracticeSessionPlaybackHost from './PracticeSessionPlaybackHost'
import PracticePlaybackStatus from './PracticePlaybackStatus'
import PracticeAccuracyOverlay from './PracticeAccuracyOverlay'
import PracticeWarmupPitchRoll from './PracticeWarmupPitchRoll'
import { getPracticeSessionCopy, formatPracticeTimeRemaining } from '../practiceSessionCopy'
import { getPracticeInstrumentLabel, loadPracticeSettings } from '../practiceSessionSettings'
import PracticeTapToPlayPrompt from './PracticeTapToPlayPrompt'
import usePracticeAccuracyMonitor from '../usePracticeAccuracyMonitor'
import useMediaResolverHealth from '../useMediaResolverHealth'
import { analyzePracticeRecording } from '../practiceAccuracyClient'
import { noteEventsFromWarmupAbc, noteWindowsFromTimeline } from '../practiceExpectedTimeline'
import './PracticeSessionModal.css'

export const PRACTICE_WARMUP_REPEATS = 4

export default function PracticeSessionModal(props) {
  const phase = props.phase || 'idle'
  const isEnded = phase === 'ended'
  const plan = props.plan
  const currentStep = props.currentStep
  const [warmupStatus, setWarmupStatus] = useState('idle')
  const [warmupRun, setWarmupRun] = useState(0)
  const [userPaused, setUserPaused] = useState(false)
  const [sharedAudioContext, setSharedAudioContext] = useState(null)
  const [showRepSummary, setShowRepSummary] = useState(false)
  const [showStepAggregate, setShowStepAggregate] = useState(false)
  const [countInBeat, setCountInBeat] = useState(0)
  const [countInTotal, setCountInTotal] = useState(0)
  const warmupPlaybackRef = useRef(null)
  const prevWarmupRunRef = useRef(0)
  const [practiceSettings, setPracticeSettings] = useState(function() { return loadPracticeSettings() })
  const resolverHealth = useMediaResolverHealth()
  const accuracyEnabled = practiceSettings.accuracyCheckingEnabled
    && currentStep && currentStep.type === 'warmup'
  const referenceGain = practiceSettings.headphoneMode
    ? 1
    : (practiceSettings.practiceReferenceGain != null ? practiceSettings.practiceReferenceGain : 0.08)

  useEffect(function() {
    if (props.show) setPracticeSettings(loadPracticeSettings())
  }, [props.show, props.stepIndex])

  const accuracyMonitor = usePracticeAccuracyMonitor({
    enabled: !!accuracyEnabled && warmupStatus !== 'idle',
    abc: currentStep && currentStep.type === 'warmup' ? currentStep.abc : null,
    audioContext: sharedAudioContext,
    useOffMainThread: false,
    gapBeats: 1,
    resolverFeatures: resolverHealth.features,
  })
  const copy = getPracticeSessionCopy(currentStep, {
    phase: isEnded ? 'ended' : 'running',
    warmupRun: currentStep && currentStep.type === 'warmup' ? warmupRun + 1 : null,
    warmupRepeats: PRACTICE_WARMUP_REPEATS,
  })
  const stepCount = plan && plan.steps ? plan.steps.length : 0
  const stepNumber = props.stepIndex != null ? props.stepIndex + 1 : 0
  const tune = currentStep && currentStep.type === 'tune' && props.tunes
    ? props.tunes[String(currentStep.tuneId)]
    : null
  const canPausePlayback = !isEnded && currentStep && (currentStep.type === 'warmup' || currentStep.type === 'tune')
  const mediaTapToPlay = props.mediaController && props.mediaController.tapToPlay
  const showPauseControl = canPausePlayback && !mediaTapToPlay

  useEffect(function() {
    if (currentStep && currentStep.type === 'warmup') {
      setWarmupStatus('loading')
      setWarmupRun(0)
      prevWarmupRunRef.current = 0
      setShowRepSummary(false)
      setShowStepAggregate(false)
      setCountInBeat(0)
      setCountInTotal(0)
      accuracyMonitor.resetRepBuffers()
      if (accuracyMonitor.clearAllTraces) accuracyMonitor.clearAllTraces()
    } else {
      setWarmupStatus('idle')
      setWarmupRun(0)
      setShowStepAggregate(false)
      setCountInBeat(0)
      setCountInTotal(0)
    }
    setUserPaused(false)
  }, [currentStep, props.stepIndex])

  useEffect(function() {
    if (!accuracyEnabled || !currentStep || currentStep.type !== 'warmup') return undefined
    const timer = setInterval(function() {
      const ref = warmupPlaybackRef.current
      if (ref && ref.getAudioContext) {
        const ctx = ref.getAudioContext()
        if (ctx && ctx !== sharedAudioContext) setSharedAudioContext(ctx)
      }
    }, 200)
    return function() { clearInterval(timer) }
  }, [accuracyEnabled, currentStep, sharedAudioContext])

  useEffect(function() {
    if (!accuracyEnabled || !currentStep || currentStep.type !== 'warmup') return
    const run = warmupRun
    if (run > 0 && run !== prevWarmupRunRef.current && prevWarmupRunRef.current > 0) {
      const repIndex = prevWarmupRunRef.current - 1
      accuracyMonitor.onRepComplete(repIndex)
      setShowRepSummary(true)
      submitResolverAnalysis(repIndex)
      accuracyMonitor.resetRepBuffers()
    }
    prevWarmupRunRef.current = run
  }, [warmupRun, accuracyEnabled, currentStep])

  function buildExpectedMetadata() {
    if (!currentStep || !currentStep.abc) return {}
    const timeline = noteEventsFromWarmupAbc(currentStep.abc)
    const windows = noteWindowsFromTimeline(timeline.notes, timeline.tuneMeta, 0)
    return {
      expectedNotes: windows.map(function(w) {
        return {
          midi: w.midi,
          startSec: w.startMs / 1000,
          endSec: w.endMs / 1000,
        }
      }),
      tempo: timeline.tuneMeta.tempoBpm,
      meter: timeline.tuneMeta.meter,
    }
  }

  function submitResolverAnalysis(repIndex) {
    if (!resolverHealth.features || !resolverHealth.features.practiceAnalysis) return
    const blob = accuracyMonitor.getRecordingBlob()
    if (!blob) return
    accuracyMonitor.startResolverPending()
    analyzePracticeRecording(blob, buildExpectedMetadata())
      .then(function(result) {
        accuracyMonitor.applyResolverSummary(Object.assign({}, result, { repIndex: repIndex }))
      })
      .catch(function() {
        // keep browser score
      })
  }

  function handleWarmupEnded() {
    if (accuracyEnabled) {
      accuracyMonitor.onRepComplete(Math.max(0, warmupRun - 1))
      accuracyMonitor.onStepComplete()
      setShowStepAggregate(true)
      submitResolverAnalysis(Math.max(0, warmupRun - 1))
    }
    setWarmupRun(0)
    setWarmupStatus('idle')
    if (props.onWarmupEnded) props.onWarmupEnded()
  }

  useEffect(function() {
    if (!props.setSessionClockPaused || isEnded) return

    let autoPaused = true
    if (currentStep && currentStep.type === 'warmup') {
      autoPaused = warmupStatus !== 'playing'
    } else if (currentStep && currentStep.type === 'tune' && props.mediaController) {
      const mc = props.mediaController
      autoPaused = !mc.isPlaying
    }

    props.setSessionClockPaused(userPaused || autoPaused)
  }, [
    currentStep,
    warmupStatus,
    isEnded,
    userPaused,
    props.setSessionClockPaused,
    props.mediaController,
    props.mediaController && props.mediaController.isPlaying,
    props.mediaController && props.mediaController.isLoading,
    props.mediaController && props.mediaController.tapToPlay,
  ])

  function handleSkipWarmup() {
    if (props.armPlaybackGesture) props.armPlaybackGesture()
    setWarmupRun(0)
    setWarmupStatus('idle')
    if (props.onWarmupEnded) props.onWarmupEnded()
  }

  function handleSkipTune() {
    if (props.armPlaybackGesture) props.armPlaybackGesture()
    if (props.onSkipTune) props.onSkipTune()
  }

  function handleBlockTune() {
    if (props.armPlaybackGesture) props.armPlaybackGesture()
    if (props.onBlockTune) props.onBlockTune()
  }

  function togglePausePlayback() {
    if (!canPausePlayback) return
    if (userPaused) {
      setUserPaused(false)
      if (currentStep.type === 'warmup') {
        const warmupPlayback = warmupPlaybackRef.current
        if (warmupPlayback && warmupPlayback.resume) warmupPlayback.resume()
      } else if (props.mediaController && props.mediaController.playFromUserGesture) {
        props.mediaController.playFromUserGesture()
      } else if (props.mediaController && props.mediaController.play) {
        props.mediaController.play()
      }
      return
    }
    setUserPaused(true)
    if (currentStep.type === 'warmup') {
      const warmupPlayback = warmupPlaybackRef.current
      if (warmupPlayback && warmupPlayback.pause) warmupPlayback.pause()
    } else if (props.mediaController && props.mediaController.pause) {
      props.mediaController.pause()
    }
  }

  function handleModalHide() {
    if (isEnded) {
      if (props.onClose) props.onClose()
    } else if (props.onStop) {
      props.onStop()
    }
  }

  const icons = props.tunebook && props.tunebook.icons ? props.tunebook.icons : null
  const pauseButtonLabel = userPaused ? 'Play' : 'Pause'
  const pauseButtonIcon = icons
    ? (userPaused ? (icons.playwhite || icons.play) : icons.pause)
    : null

  function renderHeaderBtn(label, icon, className, variant, onClick) {
    return (
      <Button
        variant={variant}
        className={'practice-session-header-btn' + (className ? ' ' + className : '')}
        aria-label={label}
        title={label}
        onClick={onClick}
      >
        {icon ? (
          <span className="practice-session-header-btn-icon" aria-hidden="true">{icon}</span>
        ) : null}
        <span className="practice-session-header-btn-label">{label}</span>
      </Button>
    )
  }

  return (
    <Modal
      show={!!props.show}
      onHide={handleModalHide}
      fullscreen={true}
      backdrop="static"
      keyboard={false}
      className={'practice-session-modal' + (isEnded ? ' practice-session-ended' : '')}
      style={{ zIndex: 1200 }}
    >
      <Modal.Header className="practice-session-header">
        <div className="practice-session-header-toolbar">
          <div className="practice-session-header-left">
            <Modal.Title>Practice</Modal.Title>
            {!isEnded ? (
              <>
                {currentStep && currentStep.type === 'warmup' ? (
                  renderHeaderBtn(
                    'Skip warmup',
                    icons && icons.skipforward,
                    'practice-session-header-btn--skip',
                    undefined,
                    handleSkipWarmup
                  )
                ) : null}
                {currentStep && currentStep.type === 'tune' ? (
                  <>
                    {renderHeaderBtn(
                      'Block tune',
                      icons && icons.lock,
                      'practice-session-header-btn--block',
                      'warning',
                      handleBlockTune
                    )}
                    {renderHeaderBtn(
                      'Skip tune',
                      icons && icons.skipforward,
                      'practice-session-header-btn--skip',
                      undefined,
                      handleSkipTune
                    )}
                  </>
                ) : null}
              </>
            ) : null}
          </div>
          {!isEnded ? (
            <div className="practice-session-header-center">
              <div className="practice-session-header-title-row">
                <div className="practice-session-header-now-playing">{copy.happening}</div>
                <PracticePlaybackStatus
                  compact={true}
                  tunebook={props.tunebook}
                  stepType={currentStep ? currentStep.type : null}
                  currentStep={currentStep}
                  stepIndex={props.stepIndex}
                  warmupStatus={warmupStatus}
                  warmupRun={currentStep && currentStep.type === 'warmup' ? warmupRun + 1 : null}
                  warmupRepeats={PRACTICE_WARMUP_REPEATS}
                  countInBeat={countInBeat}
                  countInTotal={countInTotal}
                  mediaController={props.mediaController}
                  userPaused={userPaused}
                />
              </div>
              <div className="practice-session-header-meta">
                <span className="practice-session-meta-highlight">
                  Time left: {formatPracticeTimeRemaining(props.secondsRemaining || 0)}
                </span>
                {currentStep && currentStep.type === 'tune'
                  && currentStep.tempoStart != null
                  && currentStep.tempoEnd != null
                  && currentStep.tempoStart !== currentStep.tempoEnd ? (
                  <span className="practice-session-meta-highlight">
                    Tempo: {Math.round((props.currentTempo || 0.5) * 1000) / 10}%
                  </span>
                ) : null}
                {currentStep && currentStep.type === 'warmup' ? (
                  <span>Rep {warmupRun + 1} of {PRACTICE_WARMUP_REPEATS}</span>
                ) : null}
                {stepCount > 0 ? <span>Step {stepNumber} of {stepCount}</span> : null}
                {plan && plan.practiceKey ? <span>Key: {plan.practiceKey}</span> : null}
                {plan && plan.instrument ? <span>Instrument: {getPracticeInstrumentLabel(plan.instrument)}</span> : null}
                {plan && plan.skillLevel ? <span>Skill: {plan.skillLevel}</span> : null}
              </div>
            </div>
          ) : (
            <div className="practice-session-header-center">
              <div className="practice-session-header-now-playing">{copy.happening}</div>
            </div>
          )}
          <div className="practice-session-header-right">
            {!isEnded ? (
              <>
                {showPauseControl ? (
                  <Button
                    variant={userPaused ? 'success' : 'warning'}
                    className={'practice-session-playback-btn' + (userPaused ? ' practice-session-playback-btn--play' : '')}
                    aria-label={pauseButtonLabel}
                    title={pauseButtonLabel}
                    onClick={togglePausePlayback}
                  >
                    {pauseButtonIcon ? (
                      <span className="practice-session-playback-btn-icon" aria-hidden="true">{pauseButtonIcon}</span>
                    ) : null}
                    <span className="practice-session-playback-btn-label">{pauseButtonLabel}</span>
                  </Button>
                ) : null}
                {renderHeaderBtn(
                  'Quit',
                  icons && (icons.stopsmall || icons.stop),
                  'practice-session-header-btn--quit',
                  'danger',
                  props.onStop
                )}
              </>
            ) : (
              <>
                <Button variant="primary" onClick={props.onNewSession}>New Session</Button>
                <Button variant="outline-secondary" onClick={props.onClose}>Close</Button>
              </>
            )}
          </div>
        </div>
      </Modal.Header>
      {!isEnded ? (
        <PracticeTapToPlayPrompt
          tunebook={props.tunebook}
          mediaController={props.mediaController}
          stepType={currentStep ? currentStep.type : null}
          armPlaybackGesture={props.armPlaybackGesture}
        />
      ) : null}
      <Modal.Body className="practice-session-body">
        {isEnded || copy.action ? (
          <div className={'practice-session-instruction' + (isEnded ? ' practice-session-instruction-complete' : '')}>
            <div className="practice-session-instruction-action">{copy.action}</div>
          </div>
        ) : null}

        {currentStep && currentStep.type === 'warmup' && currentStep.abc ? (
          <div className="practice-session-warmup-notation">
            {warmupStatus === 'countIn' && countInTotal > 0 ? (
              <div className="practice-warmup-countin-overlay" aria-live="assertive">
                <div className="practice-warmup-countin-label">Count-in</div>
                <div className="practice-warmup-countin-beat">
                  {Math.max(1, countInTotal - countInBeat + 1)}
                </div>
                <div className="practice-warmup-countin-meta">
                  {countInBeat >= countInTotal ? 'Play!' : 'beats to go'}
                </div>
              </div>
            ) : null}
            {accuracyEnabled ? (
              <PracticeAccuracyOverlay
                enabled={warmupStatus !== 'idle'}
                liveState={accuracyMonitor.liveState}
                repSummary={accuracyMonitor.repSummary}
                aggregateSummary={accuracyMonitor.aggregateSummary}
                showRepSummary={showRepSummary}
                showAggregate={showStepAggregate}
                resolverPending={accuracyMonitor.resolverPending}
                accuracyHint={!practiceSettings.headphoneMode
                  ? 'Reference notes play quietly. Enable headphone mode for louder playback.'
                  : null}
              />
            ) : null}
            <Abc
              key={'warmup-' + props.stepIndex + (accuracyEnabled ? '-acc' : '')}
              abc={currentStep.abc}
              tunebook={props.tunebook}
              autoPrime={true}
              practiceAutoPlay={true}
              practiceReferenceGain={accuracyEnabled ? referenceGain : undefined}
              onPracticeBeat={accuracyEnabled ? accuracyMonitor.handlePracticeBeat : undefined}
              onCountInBeat={function(payload) {
                if (!payload) return
                setCountInBeat(payload.beat || 0)
                setCountInTotal(payload.totalBeats || 0)
                setWarmupStatus('countIn')
              }}
              consumePlaybackGesture={props.consumePlaybackGesture}
              hasPlaybackGesture={props.hasPlaybackGesture}
              playbackControlRef={warmupPlaybackRef}
              repeat={PRACTICE_WARMUP_REPEATS}
              repeatGapBeats={1}
              hidePlayer={true}
              hideSvg={false}
              editableTempo={false}
              metronomeCountIn={true}
              metronomeCountInBarOnly={true}
              metronomeCountInCueMidi={(function() {
                if (accuracyMonitor.expectedNotes && accuracyMonitor.expectedNotes[0]) {
                  return accuracyMonitor.expectedNotes[0].midi
                }
                if (!(currentStep && currentStep.abc)) return undefined
                try {
                  const timeline = noteEventsFromWarmupAbc(currentStep.abc)
                  return timeline.notes[0] ? timeline.notes[0].midi : undefined
                } catch (err) {
                  return undefined
                }
              })()}
              onStarted={function() {
                setWarmupStatus('playing')
                setWarmupRun(1)
                setCountInBeat(0)
                setCountInTotal(0)
              }}
              onRepeat={function(run) {
                setWarmupStatus('playing')
                setWarmupRun(run)
              }}
              onEnded={handleWarmupEnded}
            />
            {accuracyEnabled ? (
              <PracticeWarmupPitchRoll
                expectedNotes={accuracyMonitor.expectedNotes}
                patternDurationBeats={accuracyMonitor.patternDurationBeats}
                repTraces={accuracyMonitor.repTraces}
                playheadBeat={accuracyMonitor.playheadBeat}
              />
            ) : null}
          </div>
        ) : null}

        {currentStep && currentStep.type === 'tune' && tune ? (
          <div className="practice-session-tune-display">
            <PracticeTuneDisplay
              tune={tune}
              tunebook={props.tunebook}
              viewMode={props.practiceViewMode}
            />
            <PracticeSessionPlaybackHost
              active={!!props.show && !isEnded}
              tune={tune}
              currentStep={currentStep}
              stepIndex={props.stepIndex}
              sessionGeneration={props.sessionGeneration}
              mediaController={props.mediaController}
              tunebook={props.tunebook}
              onPlaybackStarted={props.onTunePlaybackStarted}
              consumePlaybackGesture={props.consumePlaybackGesture}
              hasPlaybackGesture={props.hasPlaybackGesture}
            />
          </div>
        ) : null}
      </Modal.Body>
    </Modal>
  )
}
