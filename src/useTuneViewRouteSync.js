import { useEffect } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { normalizeViewMode } from './viewModeUtils'
import { replaceSearchParam } from './routeSyncUtils'

export default function useTuneViewRouteSync(viewMode, setViewMode) {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const onTunePage = location.pathname.startsWith('/tunes/')
      && location.pathname !== '/tunes'
      && location.pathname !== '/tunes/check'
  const urlView = searchParams.get('view')

  useEffect(function() {
    if (!onTunePage || !setViewMode) return
    if (!urlView) return
    setViewMode(normalizeViewMode(urlView))
  }, [onTunePage, urlView, setViewMode])

  const syncViewToUrl = function(nextView) {
    if (!onTunePage) return
    const normalized = normalizeViewMode(nextView)
    replaceSearchParam(navigate, location.pathname, searchParams, {
      view: normalized === 'music' ? null : normalized,
    })
  }

  return {
    onTunePage: onTunePage,
    syncViewToUrl: syncViewToUrl,
  }
}
