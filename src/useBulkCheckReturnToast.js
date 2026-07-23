import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  clearBulkCheckReturnContext,
  dismissBulkCheckReturnToast,
  getBulkCheckReturnContext,
  requestOpenBulkCheck,
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
        if (context.selectionKey) {
          requestOpenBulkCheck({
            selectionKey: context.selectionKey,
            autoStartCheck: false,
          })
        }
        navigate('/tunes')
      },
    })

    return function() {
      dismissBulkCheckReturnToast()
    }
  }, [tuneId, navigate])
}
