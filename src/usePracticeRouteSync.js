import { useEffect, useRef } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { loadPracticeSettings } from './practiceSessionSettings'
import { PRACTICE_MODE_ENABLED } from './practiceModeEnabled'
import { isPath } from './routeSyncUtils'

export const PRACTICE_PATH = '/practice'

export function isPracticeRoute(pathname) {
  return isPath(pathname, 'practice')
}

export function leavePracticeRoute(navigate) {
  navigate('/tunes', { replace: true })
}

export function shouldClosePracticeForPath(pathname, sessionOpen, configOpen) {
  if (isPracticeRoute(pathname)) return false
  return !!(sessionOpen || configOpen)
}

function buildAutoStartConfig(searchParams) {
  const saved = loadPracticeSettings()
  const config = {
    instrument: saved.instrument,
    totalMinutes: saved.totalMinutes,
    includeWarmups: saved.includeWarmups,
    skillLevel: saved.skillLevel,
    accuracyCheckingEnabled: saved.accuracyCheckingEnabled,
    practiceReferenceGain: saved.practiceReferenceGain,
    vocalRangeLow: saved.vocalRangeLow,
    vocalRangeHigh: saved.vocalRangeHigh,
    practiceListId: saved.lastPracticeListId || '',
  }

  if (!searchParams) return config

  const minutes = searchParams.get('minutes')
  if (minutes) config.totalMinutes = parseInt(minutes, 10)

  const instrument = searchParams.get('instrument')
  if (instrument) config.instrument = instrument

  const skill = searchParams.get('skill')
  if (skill) config.skillLevel = parseInt(skill, 10)

  const warmups = searchParams.get('warmups')
  if (warmups != null) config.includeWarmups = warmups !== '0' && warmups !== 'false'

  const list = searchParams.get('list')
  if (list) config.practiceListId = list

  return config
}

/**
 * Opens practice config or auto-starts when the user navigates to /practice.
 */
export default function usePracticeRouteSync(practiceSession) {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const onPracticeRoute = isPracticeRoute(location.pathname)
  const entryKeyRef = useRef('')
  const dismissPendingRef = useRef(false)

  useEffect(function() {
    if (!PRACTICE_MODE_ENABLED && onPracticeRoute) {
      leavePracticeRoute(navigate)
      return
    }
    if (!practiceSession || !onPracticeRoute) {
      entryKeyRef.current = ''
      return
    }

    const entryKey = location.pathname + '?' + searchParams.toString()
    if (entryKeyRef.current === entryKey) return
    entryKeyRef.current = entryKey
    dismissPendingRef.current = false

    if (practiceSession.sessionOpen) return

    if (searchParams.get('start') === '1') {
      const started = practiceSession.startSession(buildAutoStartConfig(searchParams))
      if (!started && typeof practiceSession.openConfig === 'function') {
        practiceSession.openConfig()
      }
      return
    }

    if (typeof practiceSession.openConfig === 'function') {
      practiceSession.openConfig()
    }
  }, [
    onPracticeRoute,
    location.pathname,
    searchParams,
    practiceSession,
    practiceSession && practiceSession.sessionOpen,
    practiceSession && practiceSession.openConfig,
    practiceSession && practiceSession.startSession,
  ])

  useEffect(function() {
    if (!onPracticeRoute || !practiceSession) return
    if (practiceSession.configOpen || practiceSession.sessionOpen) {
      dismissPendingRef.current = true
      return
    }
    if (!dismissPendingRef.current) return
    dismissPendingRef.current = false
    entryKeyRef.current = ''
    leavePracticeRoute(navigate)
  }, [
    onPracticeRoute,
    practiceSession,
    practiceSession && practiceSession.configOpen,
    practiceSession && practiceSession.sessionOpen,
    navigate,
  ])

  useEffect(function() {
    if (!practiceSession || onPracticeRoute) return
    if (practiceSession.sessionOpen && typeof practiceSession.stopSession === 'function') {
      practiceSession.stopSession()
      return
    }
    if (practiceSession.configOpen && typeof practiceSession.closeConfig === 'function') {
      practiceSession.closeConfig()
    }
  }, [
    onPracticeRoute,
    practiceSession,
    practiceSession && practiceSession.sessionOpen,
    practiceSession && practiceSession.configOpen,
    practiceSession && practiceSession.stopSession,
    practiceSession && practiceSession.closeConfig,
  ])

  return {
    onPracticeRoute: onPracticeRoute,
    leavePracticeRoute: function() { leavePracticeRoute(navigate) },
  }
}
