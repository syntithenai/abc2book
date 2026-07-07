import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  clearBulkCheckReturnContext,
  dismissBulkCheckReturnToast,
  getBulkCheckReturnContext,
  showBulkCheckReturnToast,
} from './bulkCheckReturnContext'

export function useBulkCheckReturnToast(tuneId) {
  const navigate = useNavigate()

  useEffect(function() {
    if (!tuneId) return undefined
    const context = getBulkCheckReturnContext()
    if (!context || context.tuneId !== tuneId) return undefined

    showBulkCheckReturnToast({
      onBack: function() {
        clearBulkCheckReturnContext()
        navigate(context.returnPath || '/tunes/check')
      },
    })

    return function() {
      dismissBulkCheckReturnToast()
    }
  }, [tuneId, navigate])
}
