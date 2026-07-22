import { useEffect } from 'react'
import {
  beginFreshLoadFromShareLink,
  finalizeFreshLoadIfReady,
  hasFreshLoadAttempt,
  readFreshParamFromLocation,
  revertFreshLoadAttempt,
} from './appFreshLoadUtils'

const FRESH_LOAD_WATCHDOG_MS = 20000

export default function useAppFreshLoad() {
  useEffect(function() {
    if (process.env.NODE_ENV !== 'production') return
    let cancelled = false

    beginFreshLoadFromShareLink().then(function(result) {
      if (cancelled || !result.shouldNavigate) return
      window.location.replace(result.revertUrl || '/')
    })

    return function() {
      cancelled = true
    }
  }, [])

  useEffect(function() {
    if (process.env.NODE_ENV !== 'production') return
    let cancelled = false

    finalizeFreshLoadIfReady().then(function(result) {
      if (cancelled) return
      if (result.reverted && result.shouldNavigate) {
        window.location.replace(result.revertUrl || '/')
        return
      }
      if (result.finalized && result.cleanUrl) {
        window.history.replaceState(null, '', result.cleanUrl)
      }
    })

    return function() {
      cancelled = true
    }
  }, [])

  useEffect(function() {
    if (process.env.NODE_ENV !== 'production') return
    if (!hasFreshLoadAttempt()) return

    function handleFailure() {
      revertFreshLoadAttempt().then(function(result) {
        if (result.shouldNavigate) {
          window.location.replace(result.revertUrl || '/')
        }
      })
    }

    const watchdogId = window.setTimeout(function() {
      const root = document.getElementById('root')
      if (root && root.childNodes && root.childNodes.length > 0) return
      handleFailure()
    }, FRESH_LOAD_WATCHDOG_MS)

    function onWindowError() {
      if (!hasFreshLoadAttempt()) return
      handleFailure()
    }

    window.addEventListener('error', onWindowError)
    return function() {
      window.clearTimeout(watchdogId)
      window.removeEventListener('error', onWindowError)
    }
  }, [])

  useEffect(function() {
    if (process.env.NODE_ENV !== 'production') return

    function handleOfflineFreshLink() {
      if (!readFreshParamFromLocation() && !hasFreshLoadAttempt()) return
      revertFreshLoadAttempt().then(function(result) {
        if (result.shouldNavigate) {
          window.location.replace(result.revertUrl || '/')
        }
      })
    }

    window.addEventListener('offline', handleOfflineFreshLink)
    return function() {
      window.removeEventListener('offline', handleOfflineFreshLink)
    }
  }, [])
}
