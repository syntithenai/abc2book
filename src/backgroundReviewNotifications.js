import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { subscribeBackgroundReviewQueue } from './backgroundReviewQueue'
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

export default function BackgroundReviewNotifications(props) {
  const navigate = useNavigate()
  const location = useLocation()
  const practiceSessionActive = !!props.practiceSessionActive

  useEffect(function() {
    function navigateToReview() {
      // /review is the search-suggestions list (not Import Review).
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
