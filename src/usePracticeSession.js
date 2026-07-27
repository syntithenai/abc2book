import { useCallback, useEffect, useRef, useState } from 'react'
import { getPracticeList, allPracticeListTuneIds } from './practiceListStore'
import { buildPracticeSessionPlan } from './practiceSessionPlanner'
import { configurePracticeTunePlayback } from './tunePlaybackActions'
import { mergePracticeSettings } from './practiceSessionSettings'
import { recordPracticedTune } from './practiceRecentHistory'
import { getPlaybackSettings } from './pitchTempoUtils'
import { pickPracticeTuneViewMode } from './practiceTuneViewUtils'
import { getPracticePlaybackRampRatio, interpolatePracticeTempo } from './practiceSessionRamp'
import * as mediaCacheQueue from './mediaCacheQueue'

function buildHelpers(tunebook) {
  return {
    hasLinks: tunebook.hasLinks.bind(tunebook),
    hasNotesOrChords: tunebook.hasNotesOrChords.bind(tunebook),
    hasNotes: tunebook.hasNotes.bind(tunebook),
    filterSearch: tunebook.filterSearch.bind(tunebook),
  }
}

function incrementTuneConfidence(tunebook, tune) {
  if (!tunebook || !tune || !tune.id) return
  const current = parseInt(tune.boost, 10)
  const next = Number.isFinite(current) ? Math.min(20, current + 1) : 1
  tunebook.saveTune(Object.assign({}, tune, { boost: next }))
}

export default function usePracticeSession(options) {
  const tunebook = options.tunebook
  const tunes = options.tunes
  const mediaController = options.mediaController
  const setCurrentTune = options.setCurrentTune
  const setViewMode = options.setViewMode
  const suspendNowPlayingQueue = options.suspendNowPlayingQueue
  const navigate = tunebook && tunebook.navigate ? tunebook.navigate.bind(tunebook) : options.navigate

  const tunesRef = useRef(tunes)
  useEffect(function() { tunesRef.current = tunes }, [tunes])

  const setViewModeRef = useRef(setViewMode)
  useEffect(function() { setViewModeRef.current = setViewMode }, [setViewMode])

  const [phase, setPhase] = useState('idle')
  const [plan, setPlan] = useState(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [currentTempo, setCurrentTempo] = useState(0.5)
  const [secondsRemaining, setSecondsRemaining] = useState(0)
  const [configOpen, setConfigOpen] = useState(false)
  const [sessionOpen, setSessionOpen] = useState(false)
  const [planError, setPlanError] = useState('')
  const [practiceViewMode, setPracticeViewMode] = useState('music')

  const changePracticeViewMode = useCallback(function(mode) {
    setPracticeViewMode(mode || 'music')
  }, [])

  const rampTimerRef = useRef(null)
  const sessionTimerRef = useRef(null)
  const savedPlaybackRef = useRef(null)
  const planRef = useRef(null)
  const stepIndexRef = useRef(0)
  const phaseRef = useRef('idle')
  const rampStartedRef = useRef(false)
  const mediaControllerRef = useRef(mediaController)
  const sessionClockPausedRef = useRef(true)
  const [sessionGeneration, setSessionGeneration] = useState(0)

  useEffect(function() { planRef.current = plan }, [plan])
  useEffect(function() { stepIndexRef.current = stepIndex }, [stepIndex])
  useEffect(function() { phaseRef.current = phase }, [phase])
  useEffect(function() { mediaControllerRef.current = mediaController }, [mediaController])

  const clearRampTimer = useCallback(function() {
    if (rampTimerRef.current) {
      clearInterval(rampTimerRef.current)
      rampTimerRef.current = null
      rampStartedRef.current = false
    }
  }, [])

  const clearSessionTimer = useCallback(function() {
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current)
      sessionTimerRef.current = null
    }
  }, [])

  const restorePlaybackSettings = useCallback(function() {
    const saved = savedPlaybackRef.current
    if (saved && mediaController && mediaController.updateTunePlaybackSettings) {
      mediaController.updateTunePlaybackSettings(saved.tempo, saved.pitch, saved.fineTune)
    }
    savedPlaybackRef.current = null
  }, [mediaController])

  const resetPracticeMedia = useCallback(function() {
    if (mediaController && mediaController.resetPracticeMediaPlayback) {
      mediaController.resetPracticeMediaPlayback()
    }
  }, [mediaController])

  const setSessionClockPaused = useCallback(function(paused) {
    sessionClockPausedRef.current = !!paused
  }, [])

  const stopSession = useCallback(function() {
    clearRampTimer()
    clearSessionTimer()
    if (mediaController) {
      if (mediaController.setPracticeSessionActive) {
        mediaController.setPracticeSessionActive(false)
      }
      if (mediaController.setPracticeSessionHandler) {
        mediaController.setPracticeSessionHandler(null)
      }
      mediaController.stop()
      if (mediaController.destroyExternalMedia) {
        mediaController.destroyExternalMedia()
      }
      resetPracticeMedia()
    }
    restorePlaybackSettings()
    setPhase('idle')
    setPlan(null)
    setStepIndex(0)
    setCurrentTempo(0.5)
    setSecondsRemaining(0)
    setSessionOpen(false)
    setConfigOpen(false)
    setPlanError('')
    setPracticeViewMode('music')
  }, [clearRampTimer, clearSessionTimer, mediaController, restorePlaybackSettings, resetPracticeMedia])

  const startNewSession = useCallback(function() {
    clearRampTimer()
    clearSessionTimer()
    if (mediaController) {
      if (mediaController.setPracticeSessionActive) {
        mediaController.setPracticeSessionActive(false)
      }
      if (mediaController.setPracticeSessionHandler) {
        mediaController.setPracticeSessionHandler(null)
      }
      mediaController.stop()
      if (mediaController.destroyExternalMedia) {
        mediaController.destroyExternalMedia()
      }
      resetPracticeMedia()
    }
    restorePlaybackSettings()
    setPhase('idle')
    setPlan(null)
    setStepIndex(0)
    setCurrentTempo(0.5)
    setSecondsRemaining(0)
    setSessionOpen(false)
    setPracticeViewMode('music')
    setConfigOpen(true)
    setPlanError('')
  }, [clearRampTimer, clearSessionTimer, mediaController, restorePlaybackSettings, resetPracticeMedia])

  const beginTempoRamp = useCallback(function(step, tune) {
    clearRampTimer()
    if (!step || step.type !== 'tune' || !mediaController) return
    if (rampStartedRef.current) return
    const startTempo = step.tempoStart != null ? step.tempoStart : 0.5
    const endTempo = step.tempoEnd != null ? step.tempoEnd : 1.0
    rampStartedRef.current = true

    const settings = getPlaybackSettings(tune)
    const pitch = (settings.pitch || 0) + (step.pitchOffset || 0)
    const applyLive = mediaController.applyLivePlaybackSettings || mediaController.updateTunePlaybackSettings
    const liveOptions = { liveTempoOnly: true }

    function applyRampRatio(ratio) {
      const tempo = interpolatePracticeTempo(startTempo, endTempo, ratio)
      applyLive(tempo, pitch, settings.fineTune || 0, liveOptions)
    }

    if (startTempo === endTempo) {
      applyRampRatio(1)
      rampStartedRef.current = false
      return
    }

    applyRampRatio(0)

    let lastAppliedTempoPct = null
    rampTimerRef.current = setInterval(function() {
      const controller = mediaControllerRef.current
      const ratio = controller ? getPracticePlaybackRampRatio(controller) : null
      if (ratio == null) return
      const tempo = interpolatePracticeTempo(startTempo, endTempo, ratio)
      const tempoPct = Math.round(tempo * 1000) / 10
      if (tempoPct === lastAppliedTempoPct) return
      lastAppliedTempoPct = tempoPct
      setCurrentTempo(tempo)
      applyLive(tempo, pitch, settings.fineTune || 0, liveOptions)
      if (ratio >= 1) {
        clearRampTimer()
      }
    }, 500)
  }, [clearRampTimer, mediaController])

  const runTuneStep = useCallback(function(step) {
    const tuneList = tunesRef.current || tunes || {}
    const tune = tuneList[step.tuneId]
    if (!tune) {
      return false
    }
    const viewMode = pickPracticeTuneViewMode(tune, tunebook)
    setPracticeViewMode(viewMode)
    const settings = getPlaybackSettings(tune)
    const pitch = (settings.pitch || 0) + (step.pitchOffset || 0)
    const startTempo = step.tempoStart != null ? step.tempoStart : 0.5
    setCurrentTempo(startTempo)
    savedPlaybackRef.current = {
      tempo: settings.tempo,
      pitch: settings.pitch,
      fineTune: settings.fineTune,
    }
    configurePracticeTunePlayback(mediaController, tunebook, tune, step)
    const mediaLiveOpts = step.route === 'media' ? { liveTempoOnly: true } : undefined
    if (mediaController.applyLivePlaybackSettings) {
      mediaController.applyLivePlaybackSettings(startTempo, pitch, settings.fineTune || 0, mediaLiveOpts)
    } else if (mediaController.updateTunePlaybackSettings) {
      mediaController.updateTunePlaybackSettings(startTempo, pitch, settings.fineTune || 0)
    }
    rampStartedRef.current = false
    return true
  }, [mediaController, tunebook, tunes])

  const startPendingTempoRamp = useCallback(function() {
    if (rampStartedRef.current) return
    const activePlan = planRef.current
    const step = activePlan && activePlan.steps
      ? activePlan.steps[stepIndexRef.current]
      : null
    if (!step || step.type !== 'tune') return
    if (step.tempoStart != null && step.tempoEnd != null && step.tempoStart === step.tempoEnd) {
      return
    }
    const tuneList = tunesRef.current || tunes || {}
    const tune = tuneList[step.tuneId]
    if (!tune) return
    beginTempoRamp(step, tune)
  }, [beginTempoRamp, tunes])

  const advanceStep = useCallback(function(options) {
    if (phaseRef.current === 'ended' || phaseRef.current === 'idle') return
    const fromPlayback = !!(options && options.fromPlayback)
    const fromBlock = !!(options && options.fromBlock)
    const activePlan = planRef.current
    const currentStep = activePlan && activePlan.steps
      ? activePlan.steps[stepIndexRef.current]
      : null
    if (currentStep && currentStep.type === 'tune') {
      const tuneList = tunesRef.current || tunes || {}
      const completedTune = tuneList[currentStep.tuneId]
      if (completedTune) {
        if (fromPlayback) {
          incrementTuneConfidence(tunebook, completedTune)
        }
        if (!fromBlock) {
          recordPracticedTune(completedTune.id)
        }
      }
    }
    clearRampTimer()
    rampStartedRef.current = false
    sessionClockPausedRef.current = true
    if (mediaController && mediaController.stop) {
      mediaController.stop()
    }
    if (mediaController && mediaController.destroyExternalMedia) {
      mediaController.destroyExternalMedia()
    }
    resetPracticeMedia()
    restorePlaybackSettings()

    if (!activePlan || !activePlan.steps) {
      setPhase('ended')
      return
    }

    const nextIndex = stepIndexRef.current + 1
    if (nextIndex >= activePlan.steps.length) {
      setPhase('ended')
      setStepIndex(nextIndex)
      if (mediaController) {
        mediaController.stop()
        if (mediaController.setPracticeSessionHandler) {
          mediaController.setPracticeSessionHandler(null)
        }
      }
      restorePlaybackSettings()
      return
    }

    setStepIndex(nextIndex)
    const nextStep = activePlan.steps[nextIndex]
    if (nextStep.type === 'tune') {
      setPhase('tune')
      runTuneStep(nextStep)
    } else {
      setPhase('warmup')
      setCurrentTempo(0.5)
    }
  }, [clearRampTimer, restorePlaybackSettings, runTuneStep, mediaController, tunebook, tunes, resetPracticeMedia])

  const pendingPlaybackGestureRef = useRef(false)
  const advanceStepRef = useRef(advanceStep)

  const armPlaybackGesture = useCallback(function() {
    pendingPlaybackGestureRef.current = true
  }, [])

  const hasPlaybackGesture = useCallback(function() {
    return !!pendingPlaybackGestureRef.current
  }, [])

  const consumePlaybackGesture = useCallback(function() {
    const hadGesture = pendingPlaybackGestureRef.current
    pendingPlaybackGestureRef.current = false
    return hadGesture
  }, [])
  useEffect(function() { advanceStepRef.current = advanceStep }, [advanceStep])

  const startStep = useCallback(function(index, activePlan) {
    const step = activePlan.steps[index]
    if (!step) {
      setPhase('ended')
      return
    }
    setStepIndex(index)
    if (step.type === 'warmup') {
      setPhase('warmup')
      setCurrentTempo(0.5)
      return
    }
    setPhase('tune')
    runTuneStep(step)
  }, [runTuneStep])

  const startSession = useCallback(function(config) {
    try {
      const helpers = buildHelpers(tunebook)
      const practiceListTuneIds = config.practiceListId
        ? (function() {
            const practiceList = getPracticeList(config.practiceListId)
            return practiceList && Array.isArray(practiceList.tuneIds)
              ? practiceList.tuneIds.slice()
              : []
          })()
        : allPracticeListTuneIds()
      const built = buildPracticeSessionPlan({
        totalMinutes: config.totalMinutes,
        includeWarmups: config.includeWarmups,
        skillLevel: config.skillLevel,
        instrument: config.instrument,
        vocalRangeLow: config.vocalRangeLow,
        vocalRangeHigh: config.vocalRangeHigh,
        tunes: tunesRef.current || tunes,
        helpers,
        filters: {
          practiceListTuneIds: practiceListTuneIds,
        },
      })

      if (built.error || !built.steps || built.steps.length === 0) {
        setPlanError(built.error || 'No practice steps could be planned.')
        return false
      }

      if (suspendNowPlayingQueue) {
        suspendNowPlayingQueue()
      }

      mergePracticeSettings({
        instrument: config.instrument,
        totalMinutes: config.totalMinutes,
        includeWarmups: config.includeWarmups,
        skillLevel: config.skillLevel,
        accuracyCheckingEnabled: config.accuracyCheckingEnabled,
        practiceReferenceGain: config.practiceReferenceGain,
        vocalRangeLow: config.vocalRangeLow,
        vocalRangeHigh: config.vocalRangeHigh,
        recentInstruments: config.recentInstruments,
      })

      setPlan(built)
      setPlanError('')
      setConfigOpen(false)
      setSessionOpen(true)
      setSessionGeneration(function(n) { return n + 1 })
      pendingPlaybackGestureRef.current = true
      setPhase('running')
      setSecondsRemaining(built.totalMinutes * 60)
      sessionClockPausedRef.current = true

      if (mediaController && mediaController.setPracticeSessionActive) {
        mediaController.setPracticeSessionActive(true)
      }

      if (mediaController && mediaController.setPracticeSessionHandler) {
        mediaController.setPracticeSessionHandler(function() {
          advanceStepRef.current({ fromPlayback: true })
        })
      }

      clearSessionTimer()
      sessionTimerRef.current = setInterval(function() {
        if (sessionClockPausedRef.current) return
        setSecondsRemaining(function(prev) {
          const next = prev - 1
          if (next <= 0) {
            clearSessionTimer()
            setPhase('ended')
            if (mediaController) {
              mediaController.stop()
              if (mediaController.setPracticeSessionHandler) {
                mediaController.setPracticeSessionHandler(null)
              }
            }
            restorePlaybackSettings()
            return 0
          }
          return next
        })
      }, 1000)

      startStep(0, built)
      return true
    } catch (err) {
      console.error('Practice session failed to start', err)
      setPlanError(err && err.message ? err.message : 'Practice session failed to start.')
      return false
    }
  }, [clearSessionTimer, mediaController, restorePlaybackSettings, startStep, suspendNowPlayingQueue, tunebook, tunes])

  const openConfig = useCallback(function() {
    setConfigOpen(true)
    setPlanError('')
  }, [])

  const closeConfig = useCallback(function() {
    setConfigOpen(false)
    setPlanError('')
  }, [])

  useEffect(function() {
    if (!mediaController || !mediaController.setPracticeSessionActive) return
    const active = sessionOpen && phase !== 'idle'
    mediaController.setPracticeSessionActive(active)
    if (active) {
      mediaCacheQueue.stop()
    }
  }, [sessionOpen, phase, mediaController])

  useEffect(function() {
    return function() {
      clearRampTimer()
      clearSessionTimer()
      const controller = mediaControllerRef.current
      if (controller && controller.setPracticeSessionHandler) {
        controller.setPracticeSessionHandler(null)
      }
      if (controller && controller.setPracticeSessionActive) {
        controller.setPracticeSessionActive(false)
      }
    }
  }, [clearRampTimer, clearSessionTimer])

  const currentStep = phase === 'ended' || phase === 'idle'
    ? null
    : (plan && plan.steps && plan.steps[stepIndex] ? plan.steps[stepIndex] : null)

  return {
    phase,
    plan,
    stepIndex,
    currentStep,
    practiceViewMode,
    setPracticeViewMode: changePracticeViewMode,
    currentTempo,
    secondsRemaining,
    configOpen,
    sessionOpen,
    planError,
    sessionGeneration,
    setSessionClockPaused,
    openConfig,
    closeConfig,
    startSession,
    stopSession,
    startNewSession,
    advanceStep,
    startPendingTempoRamp,
    consumePlaybackGesture,
    hasPlaybackGesture,
    armPlaybackGesture,
  }
}
