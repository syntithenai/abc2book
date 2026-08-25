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
import {
  requestOpenBulkCheck,
  showBulkCheckCompleteToast,
} from './bulkCheckReturnContext'

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
        const needsLoginCount = session && session.links && session.links.needsLogin
          ? session.links.needsLogin.length
          : 0
        const issueCount = Math.max(completenessCount, linkFailureCount + needsLoginCount)

        showBulkCheckCompleteToast({
          issueCount: issueCount,
          onOpenCheck: function() {
            if (session && session.selectionKey) {
              requestOpenBulkCheck({
                selectionKey: session.selectionKey,
                autoStartCheck: false,
              })
            }
            navigate('/tunes')
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
