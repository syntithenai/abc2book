import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { trackPageView } from './analytics'

export default function useRouteAnalytics() {
  const location = useLocation()
  const lastRouteRef = useRef('')

  useEffect(function() {
    const routeKey = location.pathname
    if (routeKey === lastRouteRef.current) return
    lastRouteRef.current = routeKey
    trackPageView(routeKey)
  }, [location.pathname])
}
