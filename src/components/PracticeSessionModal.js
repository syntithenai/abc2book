import { useState, useEffect, useRef, useCallback } from 'react'
import { Button, ButtonGroup } from 'react-bootstrap'
import Abc from './Abc'
import PracticeTuneDisplay from './PracticeTuneDisplay'
import PracticeSessionPlaybackHost from './PracticeSessionPlaybackHost'
import PracticePlaybackStatus from './PracticePlaybackStatus'
import PracticeAccuracyOverlay from './PracticeAccuracyOverlay'
import PracticeWarmupPitchRoll from './PracticeWarmupPitchRoll'
import LyricsAutoscrollModal from './LyricsAutoscrollModal'
import ViewModeSelectorModal, { ViewModeVoiceControls } from './ViewModeSelectorModal'
import MediaPlayerOptionsModal from './MediaPlayerOptionsModal'
import {
  viewModeToDisplayFlags,
  resolveDisplayFlagsForTune,
} from '../viewModeUtils'
import { getTuneVoiceKeys } from '../abcVoiceViewSettings'
import { tuneHasExplicitChords } from '../timedLyricsChordsDisplay'
import useAbcjsParser from '../useAbcjsParser'
import { getPracticeSessionCopy, formatPracticeTimeRemaining } from '../practiceSessionCopy'
import { loadPracticeSettings, mergePracticeSettings, clampReferenceGain } from '../practiceSessionSettings'
import PracticeTapToPlayPrompt from './PracticeTapToPlayPrompt'
import usePracticeAccuracyMonitor from '../usePracticeAccuracyMonitor'
import useMediaResolverHealth from '../useMediaResolverHealth'
import { analyzePracticeRecording } from '../practiceAccuracyClient'
import { noteEventsFromWarmupAbc, noteWindowsFromTimeline } from '../practiceExpectedTimeline'
import { firstWarmupCueMidi } from '../countInPitchCue'
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
  const [tuneLayoutNeeds, setTuneLayoutNeeds] = useState({
    fitHeight: false,
    needsNotationScroll: false,
    hasLyrics: false,
    lyricLineCount: 0,
  })
  const [voiceSettingsVersion, setVoiceSettingsVersion] = useState(0)
  const handleTuneLayoutNeeds = useCallback(function(needs) {
    setTuneLayoutNeeds(function(prev) {
      const next = needs || {}
      if (
        prev.fitHeight === !!next.fitHeight
        && prev.needsNotationScroll === !!next.needsNotationScroll
        && prev.hasLyrics === !!next.hasLyrics
        && prev.lyricLineCount === (next.lyricLineCount || 0)
      ) {
        return prev
      }
      return {
        fitHeight: !!next.fitHeight,
        needsNotationScroll: !!next.needsNotationScroll,
        hasLyrics: !!next.hasLyrics,
        lyricLineCount: next.lyricLineCount || 0,
      }
    })
  }, [])
  const resolverHealth = useMediaResolverHealth()
  const abcjsParser = useAbcjsParser({ tunebook: props.tunebook })
  const accuracyEnabled = practiceSettings.accuracyCheckingEnabled
    && currentStep && currentStep.type === 'warmup'
  const referenceGain = practiceSettings.practiceReferenceGain != null
    ? practiceSettings.practiceReferenceGain
    : 0.12

  function handleReferenceVolumeChange(nextGain) {
    const gain = clampReferenceGain(nextGain)
    setPracticeSettings(function(prev) {
      return Object.assign({}, prev, {
        practiceReferenceGain: gain,
      })
    })
    mergePracticeSettings({
      practiceReferenceGain: gain,
    })
  }

  useEffect(function() {
    if (props.show) setPracticeSettings(loadPracticeSettings())
  }, [props.show, props.stepIndex])

  const accuracyMonitor = usePracticeAccuracyMonitor({
    enabled: !!accuracyEnabled && warmupStatus !== 'idle' && !userPaused,
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
  const tune = currentStep && currentStep.type === 'tune' && props.tunes
    ? props.tunes[String(currentStep.tuneId)]
    : null
  const canPausePlayback = !isEnded && currentStep && (currentStep.type === 'warmup' || currentStep.type === 'tune')
  const mediaTapToPlay = props.mediaController && props.mediaController.tapToPlay
  const showPauseControl = canPausePlayback && !mediaTapToPlay
  const togglePausePlaybackRef = useRef(null)

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
    if (run > 0 && run !== prevWarmupRunRef.current && accuracyMonitor.beginRep) {
      accuracyMonitor.beginRep(run - 1)
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
  togglePausePlaybackRef.current = togglePausePlayback

  function handleRestartStep() {
    if (!canPausePlayback) return
    if (props.armPlaybackGesture) props.armPlaybackGesture()
    setUserPaused(false)
    if (currentStep.type === 'warmup') {
      setCountInBeat(0)
      setCountInTotal(0)
      setWarmupRun(0)
      setWarmupStatus('countIn')
      setShowRepSummary(false)
      setShowStepAggregate(false)
      prevWarmupRunRef.current = 0
      if (accuracyMonitor && accuracyMonitor.resetRepBuffers) accuracyMonitor.resetRepBuffers()
      if (accuracyMonitor && accuracyMonitor.clearAllTraces) accuracyMonitor.clearAllTraces()
      const warmupPlayback = warmupPlaybackRef.current
      if (warmupPlayback && warmupPlayback.restart) {
        warmupPlayback.restart()
      }
      return
    }
    if (props.mediaController && props.mediaController.restartPlaybackFromStart) {
      props.mediaController.restartPlaybackFromStart()
    } else if (props.mediaController && props.mediaController.playFromUserGesture) {
      props.mediaController.playFromUserGesture({ restart: true })
    } else if (props.mediaController && props.mediaController.play) {
      props.mediaController.play({ restart: true })
    }
  }

  useEffect(function() {
    if (!props.show || isEnded || !canPausePlayback) return undefined
    function onKeyDown(e) {
      if (e.code !== 'Space' && e.key !== ' ') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target
      if (target) {
        const tag = String(target.tagName || '').toLowerCase()
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return
        if (target.isContentEditable) return
      }
      e.preventDefault()
      if (togglePausePlaybackRef.current) togglePausePlaybackRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return function() {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [props.show, isEnded, canPausePlayback])

  useEffect(function() {
    if (!props.show || typeof document === 'undefined') return undefined
    document.body.classList.add('practice-session-page-open')
    return function() {
      document.body.classList.remove('practice-session-page-open')
    }
  }, [props.show])

  useEffect(function() {
    if (!props.show) return undefined
    function onKeyDown(e) {
      if (e.key !== 'Escape') return
      e.preventDefault()
      handleModalHide()
    }
    window.addEventListener('keydown', onKeyDown)
    return function() {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [props.show, isEnded])

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
  const isTuneStep = !isEnded && currentStep && currentStep.type === 'tune' && !!tune
  const showAutoscroll = isTuneStep
    && (tuneLayoutNeeds.needsNotationScroll || tuneLayoutNeeds.lyricLineCount > 12)
  const tuneTranspose = tune ? (Number(tune.transpose) || 0) : 0
  const hasChords = !!(tune && tuneHasExplicitChords(tune, props.tunebook, abcjsParser))
  const practiceDisplayFlags = tune ? resolveDisplayFlagsForTune(
    viewModeToDisplayFlags(props.practiceViewMode || 'music'),
    tune,
    props.tunebook,
    { hasChords: hasChords }
  ) : null
  const showNotationControls = !!(practiceDisplayFlags && practiceDisplayFlags.notation !== 'off')
    && !!(tune && props.tunebook && props.tunebook.hasNotes && props.tunebook.hasNotes(tune))
    && getTuneVoiceKeys(tune).length > 1
  const mediaDropdownVariant = props.mediaController && props.mediaController.isLoading
    ? 'secondary'
    : (props.mediaController && props.mediaController.isPlaying ? 'warning' : 'success')

  function changeTuneTranspose(delta) {
    if (!tune || !props.tunebook) return
    const next = tuneTranspose + delta
    tune.transpose = next
    props.tunebook.saveTune(tune)
    if (props.forceRefresh) props.forceRefresh()
  }

  function handlePracticeViewModeChange(mode) {
    if (props.onPracticeViewModeChange) props.onPracticeViewModeChange(mode)
  }

  const transposeCapoBlock = tune ? (
    <div className="music-transpose-capo-block">
      <span className="music-transpose-capo-label">Transpose</span>
      <ButtonGroup size="sm" className="music-transpose-group">
        <Button variant="outline-secondary" onClick={function() { changeTuneTranspose(-1) }} aria-label="Transpose down">−</Button>
        <Button variant="outline-secondary" disabled>{tuneTranspose >= 0 ? '+' + tuneTranspose : tuneTranspose}</Button>
        <Button variant="outline-secondary" onClick={function() { changeTuneTranspose(1) }} aria-label="Transpose up">+</Button>
      </ButtonGroup>
    </div>
  ) : null

  function renderPlaybackControls(includeMediaDropdown) {
    if (!showPauseControl) return null
    const playButton = (
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
    )
    return (
      <>
        {renderHeaderBtn(
          'Restart',
          icons && (icons.skipback || icons.rewind),
          'practice-session-header-btn--restart',
          'outline-secondary',
          handleRestartStep
        )}
        {includeMediaDropdown ? (
          <ButtonGroup className="practice-session-playback-group">
            {playButton}
            <MediaPlayerOptionsModal
              mediaController={props.mediaController}
              tunebook={props.tunebook}
              tunes={props.tunes}
              contextTune={tune}
              suppressRouteNavigation={true}
              dialogZIndex={1300}
              buttonSize="lg"
              variant={mediaDropdownVariant}
            />
          </ButtonGroup>
        ) : playButton}
      </>
    )
  }

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

  if (!props.show) return null

  return (
    <div
      className={'practice-session-page' + (isEnded ? ' practice-session-ended' : '')}
      role="main"
      aria-label="Practice session"
    >
      <header className="practice-session-header">
        <div className="practice-session-header-toolbar">
          <div className="practice-session-header-left">
            <h1 className="practice-session-header-title">Practice</h1>
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
                  renderHeaderBtn(
                    'Skip tune',
                    icons && icons.skipforward,
                    'practice-session-header-btn--skip',
                    undefined,
                    handleSkipTune
                  )
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
                {renderPlaybackControls(isTuneStep)}
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
        {isTuneStep ? (
          <div className="practice-session-tune-toolbar">
            {showAutoscroll ? (
              <LyricsAutoscrollModal
                tune={tune}
                tunebook={props.tunebook}
                mediaController={props.mediaController}
                mediaLinkNumber={props.mediaController && props.mediaController.mediaLinkNumber != null
                  ? props.mediaController.mediaLinkNumber
                  : 0}
                musicSingleSelector=".practice-session-scroll-root"
                barLayout="gig-inline"
                buttonVariant="outline-secondary"
                buttonSize="sm"
              />
            ) : null}
            <ViewModeSelectorModal
              className="practice-session-view-mode-selector"
              viewMode={props.practiceViewMode}
              tune={tune}
              tunebook={props.tunebook}
              forceDropdown={true}
              hideInlineVoiceControls={true}
              onVoiceSettingsChange={function() {
                setVoiceSettingsVersion(function(v) { return v + 1 })
              }}
              extraMenuContent={transposeCapoBlock}
              onChange={handlePracticeViewModeChange}
            />
            {showNotationControls ? (
              <ViewModeVoiceControls
                inline={true}
                tune={tune}
                tuneId={tune.id}
                tunebook={props.tunebook}
                onChange={function() {
                  setVoiceSettingsVersion(function(v) { return v + 1 })
                }}
              />
            ) : null}
          </div>
        ) : null}
      </header>
      {!isEnded ? (
        <PracticeTapToPlayPrompt
          tunebook={props.tunebook}
          mediaController={props.mediaController}
          stepType={currentStep ? currentStep.type : null}
          armPlaybackGesture={props.armPlaybackGesture}
        />
      ) : null}
      <div className="practice-session-body">
        {isEnded || copy.action ? (
          <div className={'practice-session-instruction' + (isEnded ? ' practice-session-instruction-complete' : '')}>
            <div className="practice-session-instruction-action">{copy.action}</div>
          </div>
        ) : null}

        {currentStep && currentStep.type === 'warmup' && currentStep.abc ? (
          <div className="practice-session-warmup-notation">
            {accuracyEnabled ? (
              <PracticeAccuracyOverlay
                enabled={warmupStatus !== 'idle'}
                liveState={accuracyMonitor.liveState}
                repSummary={accuracyMonitor.repSummary}
                aggregateSummary={accuracyMonitor.aggregateSummary}
                showRepSummary={showRepSummary}
                showAggregate={showStepAggregate}
                resolverPending={accuracyMonitor.resolverPending}
                volume={referenceGain}
                onVolumeChange={handleReferenceVolumeChange}
              />
            ) : null}
            <div className="practice-session-warmup-score">
              {warmupStatus === 'countIn' && countInTotal > 0 ? (
                <div className="practice-warmup-countin-overlay" aria-live="assertive">
                  <div className="practice-warmup-countin-beat">
                    {countInBeat >= countInTotal
                      ? '!'
                      : Math.max(1, countInTotal - countInBeat + 1)}
                  </div>
                </div>
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
                metronomeCountInCueMidi={firstWarmupCueMidi(
                  currentStep && currentStep.abc,
                  currentStep && currentStep.firstMidi
                )}
                onStarted={function() {
                  setWarmupStatus('playing')
                  setWarmupRun(1)
                  setCountInBeat(0)
                  setCountInTotal(0)
                  if (accuracyMonitor.beginRep) accuracyMonitor.beginRep(0)
                }}
                onRepeat={function(run) {
                  setWarmupStatus('playing')
                  setWarmupRun(run)
                  if (accuracyMonitor.beginRep) accuracyMonitor.beginRep(Math.max(0, run - 1))
                }}
                onEnded={handleWarmupEnded}
              />
            </div>
            {accuracyEnabled ? (
              <div className="practice-session-warmup-pitch">
                <PracticeWarmupPitchRoll
                  expectedNotes={accuracyMonitor.expectedNotes}
                  patternDurationBeats={accuracyMonitor.patternDurationBeats}
                  repTraces={accuracyMonitor.repTraces}
                  playheadBeat={accuracyMonitor.playheadBeat}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {currentStep && currentStep.type === 'tune' && tune ? (
          <div
            className={
              'practice-session-tune-display practice-session-scroll-root'
              + (tuneLayoutNeeds.fitHeight ? ' practice-session-scroll-root--fit-height' : '')
              + ((tuneLayoutNeeds.needsNotationScroll || tuneLayoutNeeds.lyricLineCount > 12)
                ? ' practice-session-scroll-root--scrollable'
                : '')
            }
          >
            <PracticeTuneDisplay
              key={String(tune.id) + '-' + String(props.stepIndex) + '-' + String(props.practiceViewMode || 'music') + '-' + voiceSettingsVersion + '-' + tuneTranspose}
              tune={tune}
              tunebook={props.tunebook}
              mediaController={props.mediaController}
              viewMode={props.practiceViewMode}
              voiceSettingsVersion={voiceSettingsVersion}
              onLayoutNeeds={handleTuneLayoutNeeds}
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
      </div>
    </div>
  )
}
