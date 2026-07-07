import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { isPath } from './routeSyncUtils'

export const BULK_CHECK_PATH = '/tunes/check'

export function isBulkCheckRoute(pathname) {
  return isPath(pathname, 'tunes/check') || pathname === '/tunes/check'
}

export default function useBulkCheckRouteSync() {
  const location = useLocation()
  const navigate = useNavigate()
  const routeActive = isBulkCheckRoute(location.pathname)

  const closeRoute = useCallback(function() {
    if (!isBulkCheckRoute(location.pathname)) return
    navigate('/tunes', { replace: true })
  }, [location.pathname, navigate])

  const openRoute = useCallback(function() {
    navigate('/tunes/check')
  }, [navigate])

  return {
    routeActive: routeActive,
    closeRoute: closeRoute,
    openRoute: openRoute,
  }
}
