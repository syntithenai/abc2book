import { useEffect, useRef } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { loadPracticeSettings } from './practiceSessionSettings'
import { isPath } from './routeSyncUtils'

export const PRACTICE_PATH = '/practice'

export function isPracticeRoute(pathname) {
  return isPath(pathname, 'practice')
}

export function leavePracticeRoute(navigate) {
  navigate('/tunes', { replace: true })
}

function buildAutoStartConfig(searchParams) {
  const saved = loadPracticeSettings()
  const config = {
    instrument: saved.instrument,
    totalMinutes: saved.totalMinutes,
    includeWarmups: saved.includeWarmups,
    skillLevel: saved.skillLevel,
    bookFilter: '',
    tagFilter: [],
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

  const book = searchParams.get('book')
  if (book) config.bookFilter = book

  const tags = searchParams.get('tags')
  if (tags) {
    config.tagFilter = tags.split(',').map(function(t) { return t.trim() }).filter(Boolean)
  }

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

  return {
    onPracticeRoute: onPracticeRoute,
    leavePracticeRoute: function() { leavePracticeRoute(navigate) },
  }
}
