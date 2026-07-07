import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { subscribeBackgroundReviewQueue } from './backgroundReviewQueue'
import { syncBackgroundReviewToast } from './backgroundReviewToast'
import {
  showImportReviewUi,
  subscribeImportReviewSession,
} from './importReviewSessionStore'
import { subscribeMediaAnalysisJobs } from './mediaAnalysisJobs'

export default function BackgroundReviewNotifications() {
  const navigate = useNavigate()

  useEffect(function() {
    function refreshToast() {
      syncBackgroundReviewToast({
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
  }, [navigate])

  return null
}
