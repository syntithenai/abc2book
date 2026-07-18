import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { subscribeBackgroundReviewQueue, getBackgroundReviewSummary } from './backgroundReviewQueue'
import { syncBackgroundReviewToast } from './backgroundReviewToast'
import {
  isImportReviewUiVisible,
  subscribeImportReviewSession,
} from './importReviewSessionStore'
import { subscribeMediaAnalysisJobs } from './mediaAnalysisJobs'
import {
  subscribe as subscribeFieldLookupQueue,
} from './tuneFieldLookupQueue'
import { subscribeFileOcrJobs } from './fileOcrJobs'
import { requestFileOcrReview } from './fileOcrReviewUiStore'

export default function BackgroundReviewNotifications(props) {
  const navigate = useNavigate()
  const location = useLocation()
  const practiceSessionActive = !!props.practiceSessionActive

  useEffect(function() {
    function navigateToReview() {
      const summary = getBackgroundReviewSummary()
      const fileOcrReady = summary && Array.isArray(summary.fileOcrReady) ? summary.fileOcrReady : []
      if (fileOcrReady.length > 0) {
        requestFileOcrReview(fileOcrReady[0])
        return
      }
      navigate('/review')
    }

    function refreshToast() {
      const onReviewRoute = location.pathname === '/review'
      const onEditorRoute = String(location.pathname || '').indexOf('/editor/') === 0
      syncBackgroundReviewToast({
        suppressReadyToast: onReviewRoute
          || onEditorRoute
          || practiceSessionActive
          || isImportReviewUiVisible(),
        onReview: navigateToReview,
      })
    }

    refreshToast()
    const unsubs = [
      subscribeBackgroundReviewQueue(refreshToast),
      subscribeImportReviewSession(refreshToast),
      subscribeMediaAnalysisJobs(refreshToast),
      subscribeFieldLookupQueue(refreshToast),
      subscribeFileOcrJobs(refreshToast),
    ]
    return function cleanup() {
      unsubs.forEach(function(unsub) { unsub() })
    }
  }, [navigate, location.pathname, practiceSessionActive])

  return null
}
