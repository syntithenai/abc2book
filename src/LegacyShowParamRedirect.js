import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

const BULK_SHOW = new Set(['importList', 'importAbc', 'importCollection'])

/**
 * Redirect legacy hash URLs like /#/tunes?show=addTune to /add routes.
 */
export default function LegacyShowParamRedirect() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(function() {
    const show = searchParams.get('show')
    if (!show) return

    if (show === 'addTune') {
      navigate({ pathname: '/add', search: '' }, { replace: true })
    } else if (BULK_SHOW.has(show)) {
      navigate({ pathname: '/add/bulk', search: '' }, { replace: true })
    }
  }, [searchParams, navigate])

  return null
}
