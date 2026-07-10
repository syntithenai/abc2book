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

export default function BackgroundReviewNotifications() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(function() {
    function refreshToast() {
      const onReviewRoute = location.pathname === '/review'
      syncBackgroundReviewToast({
        suppressReadyToast: onReviewRoute || isImportReviewUiVisible(),
        onReview: function() {
          showImportReviewUi()
          navigate('/review')
        },
      })
    }

    refreshToast()
    const unsubs = [
      subscribeBackgroundReviewQueue(refreshToast),
      subscribeImportReviewSession(refreshToast),
      subscribeMediaAnalysisJobs(refreshToast),
    ]
    return function cleanup() {
      unsubs.forEach(function(unsub) { unsub() })
    }
  }, [navigate, location.pathname])

  return null
}
