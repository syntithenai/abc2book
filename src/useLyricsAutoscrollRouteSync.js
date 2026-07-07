import { useEffect } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { replaceSearchParam } from './routeSyncUtils'

export default function useLyricsAutoscrollRouteSync(options) {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const enabled = !!(options && options.enabled)
  const shouldOpen = enabled && searchParams.get('autoscroll') === '1'

  useEffect(function() {
    if (!shouldOpen || !options || typeof options.onOpen !== 'function') return
    options.onOpen()
  }, [shouldOpen, options && options.onOpen])

  const clearAutoscrollParam = function() {
    if (searchParams.get('autoscroll') !== '1') return
    replaceSearchParam(navigate, location.pathname, searchParams, { autoscroll: null })
  }

  return {
    shouldOpen: shouldOpen,
    clearAutoscrollParam: clearAutoscrollParam,
  }
}
