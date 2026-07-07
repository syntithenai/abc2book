import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getActiveBulkCheckSession,
  subscribeBulkCheckSession,
} from './bulkCheckSessionStore'
import {
  isBulkCheckRunnerActive,
  subscribeBulkCheckRunner,
} from './bulkCheckRunner'
import { showBulkCheckCompleteToast } from './bulkCheckReturnContext'

export function useBulkCheckCompleteToast() {
  const navigate = useNavigate()
  const prevPhaseRef = useRef(null)
  const prevRunningRef = useRef(false)

  useEffect(function() {
    function maybeShowCompleteToast() {
      const session = getActiveBulkCheckSession()
      const running = isBulkCheckRunnerActive()
      const phase = session ? session.phase : null
      const wasRunning = prevRunningRef.current
      const prevPhase = prevPhaseRef.current

      prevRunningRef.current = running
      prevPhaseRef.current = phase

      if (wasRunning && !running && phase === 'links-done' && prevPhase === 'running-links') {
        const completenessCount = session && session.completeness && session.completeness.issues
          ? session.completeness.issues.length
          : 0
        const linkFailureCount = session && session.links && session.links.failures
          ? session.links.failures.length
          : 0
        const issueCount = Math.max(completenessCount, linkFailureCount)

        showBulkCheckCompleteToast({
          issueCount: issueCount,
          onOpenCheck: function() {
            navigate('/tunes/check')
          },
        })
      }
    }

    const unsubSession = subscribeBulkCheckSession(maybeShowCompleteToast)
    const unsubRunner = subscribeBulkCheckRunner(maybeShowCompleteToast)
    return function() {
      unsubSession()
      unsubRunner()
    }
  }, [navigate])
}
