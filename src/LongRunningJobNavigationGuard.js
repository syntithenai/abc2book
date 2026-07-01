import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { hasActiveLongRunningJobs, useHasActiveLongRunningJobs } from './longRunningJobRegistry'

const CONFIRM_MESSAGE = 'A search or analysis is still running. Leave this page anyway?'

function locationKey(location) {
  if (!location) return ''
  return String(location.pathname || '') + String(location.search || '') + String(location.hash || '')
}

export default function LongRunningJobNavigationGuard() {
  const active = useHasActiveLongRunningJobs()
  const location = useLocation()
  const navigate = useNavigate()
  const lastLocationRef = useRef(location)

  useEffect(function() {
    function onBeforeUnload(event) {
      if (!hasActiveLongRunningJobs()) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return function() {
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [])

  useEffect(function() {
    if (!active) {
      lastLocationRef.current = location
      return
    }

    const previous = lastLocationRef.current
    const previousKey = locationKey(previous)
    const nextKey = locationKey(location)

    if (previousKey === nextKey) {
      return
    }

    if (!window.confirm(CONFIRM_MESSAGE)) {
      navigate(previous.pathname + previous.search + previous.hash, { replace: true })
      return
    }

    lastLocationRef.current = location
  }, [active, location, navigate])

  useEffect(function() {
    if (!active) {
      lastLocationRef.current = location
    }
  }, [active, location])

  return null
}
