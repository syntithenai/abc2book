import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
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
import {
  getFileOcrJob,
  subscribeFileOcrJobs,
} from './fileOcrJobs'
import { requestFileOcrReview } from './fileOcrReviewUiStore'

function toastFileOcrFailure(job) {
  const label = (job && job.fileName) || 'File'
  const detail = (job && job.error) ? String(job.error) : 'OCR failed'
  toast.error(label + ': ' + detail, {
    toastId: 'file-ocr-failed-' + (job && job.id ? job.id : 'unknown'),
    autoClose: 10000,
  })
}

export default function BackgroundReviewNotifications(props) {
  const navigate = useNavigate()
  const location = useLocation()
  const practiceSessionActive = !!props.practiceSessionActive
  const seenTerminalJobIdsRef = useRef(new Set())
  const seededTerminalJobsRef = useRef(false)

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
      // Do not suppress on /editor — File OCR is often started there and users
      // need the ready toast to open review.
      syncBackgroundReviewToast({
        suppressReadyToast: onReviewRoute
          || practiceSessionActive
          || isImportReviewUiVisible(),
        onReview: navigateToReview,
      })
    }

    function notifyTerminalFileOcrJobs() {
      const summary = getBackgroundReviewSummary() || {}
      const failedIds = Array.isArray(summary.fileOcrFailed) ? summary.fileOcrFailed : []
      const readyIds = Array.isArray(summary.fileOcrReady) ? summary.fileOcrReady : []
      if (!seededTerminalJobsRef.current) {
        failedIds.forEach(function(jobId) {
          seenTerminalJobIdsRef.current.add(jobId)
        })
        readyIds.forEach(function(jobId) {
          seenTerminalJobIdsRef.current.add(jobId)
        })
        seededTerminalJobsRef.current = true
        return
      }
      failedIds.forEach(function(jobId) {
        if (seenTerminalJobIdsRef.current.has(jobId)) return
        seenTerminalJobIdsRef.current.add(jobId)
        toastFileOcrFailure(getFileOcrJob(jobId))
      })
      readyIds.forEach(function(jobId) {
        seenTerminalJobIdsRef.current.add(jobId)
      })
    }

    function refresh() {
      refreshToast()
      notifyTerminalFileOcrJobs()
    }

    refresh()
    const unsubs = [
      subscribeBackgroundReviewQueue(refresh),
      subscribeImportReviewSession(refresh),
      subscribeMediaAnalysisJobs(refresh),
      subscribeFieldLookupQueue(refresh),
      subscribeFileOcrJobs(refresh),
    ]
    return function cleanup() {
      unsubs.forEach(function(unsub) { unsub() })
    }
  }, [navigate, location.pathname, practiceSessionActive])

  return null
}
