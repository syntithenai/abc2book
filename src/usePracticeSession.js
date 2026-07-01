import { useCallback, useEffect, useRef, useState } from 'react'
import { buildPracticeSessionPlan } from './practiceSessionPlanner'
import { startPracticeTunePlayback } from './tunePlaybackActions'
import { savePracticeSettings } from './practiceSessionSettings'
import { getPlaybackSettings } from './pitchTempoUtils'
import { pickPracticeTuneViewMode } from './practiceTuneViewUtils'

function buildHelpers(tunebook) {
  return {
    hasLinks: tunebook.hasLinks.bind(tunebook),
    hasNotesOrChords: tunebook.hasNotesOrChords.bind(tunebook),
    filterSearch: tunebook.filterSearch.bind(tunebook),
  }
}

export default function usePracticeSession(options) {
  const tunebook = options.tunebook
  const tunes = options.tunes
  const mediaController = options.mediaController
  const setCurrentTune = options.setCurrentTune
  const setViewMode = options.setViewMode
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

  const rampTimerRef = useRef(null)
  const sessionTimerRef = useRef(null)
  const stepStartedAtRef = useRef(0)
  const savedPlaybackRef = useRef(null)
  const planRef = useRef(null)
  const stepIndexRef = useRef(0)
  const phaseRef = useRef('idle')

  useEffect(function() { planRef.current = plan }, [plan])
  useEffect(function() { stepIndexRef.current = stepIndex }, [stepIndex])
  useEffect(function() { phaseRef.current = phase }, [phase])

  const clearRampTimer = useCallback(function() {
    if (rampTimerRef.current) {
      clearInterval(rampTimerRef.current)
      rampTimerRef.current = null
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

  const stopSession = useCallback(function() {
    clearRampTimer()
    clearSessionTimer()
    if (mediaController) {
      if (mediaController.setPracticeSessionHandler) {
        mediaController.setPracticeSessionHandler(null)
      }
      mediaController.stop()
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
  }, [clearRampTimer, clearSessionTimer, mediaController, restorePlaybackSettings])

  const startNewSession = useCallback(function() {
    clearRampTimer()
    clearSessionTimer()
    if (mediaController) {
      if (mediaController.setPracticeSessionHandler) {
        mediaController.setPracticeSessionHandler(null)
      }
      mediaController.stop()
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
  }, [clearRampTimer, clearSessionTimer, mediaController, restorePlaybackSettings])

  const beginTempoRamp = useCallback(function(step, tune) {
    clearRampTimer()
    if (!step || step.type !== 'tune' || !mediaController) return
    const startTempo = step.tempoStart != null ? step.tempoStart : 0.5
    const endTempo = step.tempoEnd != null ? step.tempoEnd : 1.0
    const durationMs = Math.max(10000, (step.estimatedSeconds || 120) * 1000)
    stepStartedAtRef.current = Date.now()
    setCurrentTempo(startTempo)

    const settings = getPlaybackSettings(tune)
    const pitch = (settings.pitch || 0) + (step.pitchOffset || 0)
    mediaController.updateTunePlaybackSettings(startTempo, pitch, settings.fineTune || 0)

    rampTimerRef.current = setInterval(function() {
      const elapsed = Date.now() - stepStartedAtRef.current
      const ratio = Math.min(1, elapsed / durationMs)
      const tempo = startTempo + (endTempo - startTempo) * ratio
      setCurrentTempo(tempo)
      mediaController.updateTunePlaybackSettings(tempo, pitch, settings.fineTune || 0)
      if (ratio >= 1) {
        clearRampTimer()
      }
    }, 1000)
  }, [clearRampTimer, mediaController])

  const runTuneStep = useCallback(function(step) {
    const tuneList = tunesRef.current || tunes || {}
    const tune = tuneList[step.tuneId]
    if (!tune) {
      return false
    }
    const viewMode = pickPracticeTuneViewMode(tune, tunebook)
    setPracticeViewMode(viewMode)
    if (setViewModeRef.current) setViewModeRef.current(viewMode)
    if (setCurrentTune) setCurrentTune(step.tuneId)
    const settings = getPlaybackSettings(tune)
    savedPlaybackRef.current = {
      tempo: settings.tempo,
      pitch: settings.pitch,
      fineTune: settings.fineTune,
    }
    startPracticeTunePlayback(mediaController, tunebook, navigate, tune, step)
    beginTempoRamp(step, tune)
    return true
  }, [beginTempoRamp, mediaController, navigate, setCurrentTune, tunebook, tunes])

  const advanceStep = useCallback(function() {
    clearRampTimer()
    restorePlaybackSettings()

    const activePlan = planRef.current
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
  }, [clearRampTimer, restorePlaybackSettings, runTuneStep])

  const advanceStepRef = useRef(advanceStep)
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
      const built = buildPracticeSessionPlan({
        totalMinutes: config.totalMinutes,
        includeWarmups: config.includeWarmups,
        skillLevel: config.skillLevel,
        tunes: tunesRef.current || tunes,
        helpers,
        filters: {
          bookFilter: config.bookFilter ? String(config.bookFilter).trim() : '',
          tagFilter: (config.tagFilter || []).filter(function(t) { return t && String(t).trim().length > 0 }),
        },
      })

      if (built.error || !built.steps || built.steps.length === 0) {
        setPlanError(built.error || 'No practice steps could be planned.')
        return false
      }

      savePracticeSettings({
        totalMinutes: config.totalMinutes,
        includeWarmups: config.includeWarmups,
        skillLevel: config.skillLevel,
      })

      setPlan(built)
      setPlanError('')
      setConfigOpen(false)
      setSessionOpen(true)
      setPhase('running')
      setSecondsRemaining(built.totalMinutes * 60)

      if (mediaController && mediaController.setPracticeSessionHandler) {
        mediaController.setPracticeSessionHandler(function() {
          advanceStepRef.current()
        })
      }

      clearSessionTimer()
      sessionTimerRef.current = setInterval(function() {
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
  }, [clearSessionTimer, mediaController, restorePlaybackSettings, startStep, tunebook, tunes])

  const openConfig = useCallback(function() {
    setConfigOpen(true)
    setPlanError('')
  }, [])

  const closeConfig = useCallback(function() {
    setConfigOpen(false)
    setPlanError('')
  }, [])

  useEffect(function() {
    return function() {
      clearRampTimer()
      clearSessionTimer()
      if (mediaController && mediaController.setPracticeSessionHandler) {
        mediaController.setPracticeSessionHandler(null)
      }
    }
  }, [clearRampTimer, clearSessionTimer, mediaController])

  const currentStep = phase === 'ended' || phase === 'idle'
    ? null
    : (plan && plan.steps && plan.steps[stepIndex] ? plan.steps[stepIndex] : null)

  return {
    phase,
    plan,
    stepIndex,
    currentStep,
    practiceViewMode,
    currentTempo,
    secondsRemaining,
    configOpen,
    sessionOpen,
    planError,
    openConfig,
    closeConfig,
    startSession,
    stopSession,
    startNewSession,
    advanceStep,
  }
}
