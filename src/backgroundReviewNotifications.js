import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { subscribeBackgroundReviewQueue } from './backgroundReviewQueue'
import { syncBackgroundReviewToast } from './backgroundReviewToast'
import {
  isImportReviewUiVisible,
  showImportReviewUi,
  subscribeImportReviewSession,
} from './importReviewSessionStore'
import { subscribeMediaAnalysisJobs } from './mediaAnalysisJobs'
import {
  subscribe as subscribeFieldLookupQueue,
} from './tuneFieldLookupQueue'

export default function BackgroundReviewNotifications() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(function() {
    function navigateToReview() {
      showImportReviewUi()
      navigate('/review')
    }

    function refreshToast() {
      const onReviewRoute = location.pathname === '/review'
      const onEditorRoute = String(location.pathname || '').indexOf('/editor/') === 0
      syncBackgroundReviewToast({
        suppressReadyToast: onReviewRoute || onEditorRoute || isImportReviewUiVisible(),
        onReview: navigateToReview,
      })
    }

    refreshToast()
    const unsubs = [
      subscribeBackgroundReviewQueue(refreshToast),
      subscribeImportReviewSession(refreshToast),
      subscribeMediaAnalysisJobs(refreshToast),
      subscribeFieldLookupQueue(refreshToast),
    ]
    return function cleanup() {
      unsubs.forEach(function(unsub) { unsub() })
    }
  }, [navigate, location.pathname])

  return null
}
