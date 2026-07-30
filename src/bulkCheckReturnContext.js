import { toast } from 'react-toastify'
import React from 'react'

const RETURN_CONTEXT_KEY = 'abc2book.bulkCheckReturnContext'
const REOPEN_FLAG_KEY = 'abc2book.bulkCheckReopen'

let returnToastId = null
let completeToastId = null

function readJson(key) {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}

function writeJson(key, value) {
  if (typeof sessionStorage === 'undefined') return
  try {
    if (!value) {
      sessionStorage.removeItem(key)
      return
    }
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch (e) {}
}

export function setBulkCheckReturnContext(context) {
  writeJson(RETURN_CONTEXT_KEY, context)
}

export function getBulkCheckReturnContext() {
  return readJson(RETURN_CONTEXT_KEY)
}

export function clearBulkCheckReturnContext() {
  writeJson(RETURN_CONTEXT_KEY, null)
}

export function selectedMapFromSelectionKey(selectionKey) {
  const selected = {}
  String(selectionKey || '').split(',').filter(Boolean).forEach(function(id) {
    selected[id] = true
  })
  return selected
}

const openListeners = new Set()

export function requestOpenBulkCheck(options) {
  const opts = options || {}
  const request = {
    selectionKey: opts.selectionKey || '',
    autoStartCheck: !!opts.autoStartCheck,
    nonce: Date.now(),
  }
  openListeners.forEach(function(listener) {
    listener(request)
  })
  return request
}

export function subscribeBulkCheckOpenRequest(listener) {
  openListeners.add(listener)
  return function unsubscribe() {
    openListeners.delete(listener)
  }
}

export function setReopenBulkCheckFlag(selectionKey, activeTab) {
  writeJson(REOPEN_FLAG_KEY, {
    selectionKey: selectionKey,
    activeTab: activeTab || 'links',
  })
}

export function getReopenBulkCheckFlag() {
  return readJson(REOPEN_FLAG_KEY)
}

export function consumeReopenBulkCheckFlag(selectionKey) {
  const flag = readJson(REOPEN_FLAG_KEY)
  writeJson(REOPEN_FLAG_KEY, null)
  if (!flag || !selectionKey || flag.selectionKey !== selectionKey) return null
  return flag
}

export function dismissBulkCheckReturnToast() {
  if (returnToastId != null) {
    try { toast.dismiss(returnToastId) } catch (e) {}
    returnToastId = null
  }
}

export function dismissBulkCheckCompleteToast() {
  if (completeToastId != null) {
    try { toast.dismiss(completeToastId) } catch (e) {}
    completeToastId = null
  }
}

export function showBulkCheckCompleteToast(options) {
  const opts = options || {}
  dismissBulkCheckCompleteToast()

  const issueCount = opts.issueCount != null ? opts.issueCount : 0
  const message = issueCount > 0
    ? ('Bulk check complete — ' + issueCount + ' tune' + (issueCount === 1 ? '' : 's') + ' need attention.')
    : 'Bulk check complete — all tunes look good.'

  completeToastId = toast.info(
    function(renderProps) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75em', flexWrap: 'wrap' }}>
          <span>{message}</span>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={function() {
              dismissBulkCheckCompleteToast()
              if (typeof opts.onOpenCheck === 'function') opts.onOpenCheck()
              if (typeof renderProps.closeToast === 'function') renderProps.closeToast()
            }}
          >
            Review results
          </button>
        </div>
      )
    },
    {
      autoClose: false,
      closeOnClick: false,
      onClose: function() {
        completeToastId = null
      },
    }
  )
  return completeToastId
}

export function showBulkCheckReturnToast(options) {
  const opts = options || {}
  dismissBulkCheckReturnToast()

  returnToastId = toast.info(
    function(renderProps) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75em', flexWrap: 'wrap' }}>
          <span>Editing tune — return to bulk check when done.</span>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={function() {
              dismissBulkCheckReturnToast()
              if (typeof opts.onBack === 'function') opts.onBack()
              if (typeof renderProps.closeToast === 'function') renderProps.closeToast()
            }}
          >
            Back to Check
          </button>
        </div>
      )
    },
    {
      autoClose: false,
      closeOnClick: false,
      onClose: function() {
        returnToastId = null
        clearBulkCheckReturnContext()
      },
    }
  )
  return returnToastId
}

export function beginBulkCheckEditTune(options) {
  const opts = options || {}
  if (!opts.selectionKey || !opts.tuneId) return
  const activeTab = opts.activeTab || 'completeness'
  setBulkCheckReturnContext({
    selectionKey: opts.selectionKey,
    activeTab: activeTab,
    tuneId: opts.tuneId,
    returnPath: '/tunes',
    focusNotationChecks: !!opts.focusNotationChecks,
  })
  if (typeof opts.onNavigate === 'function') {
    opts.onNavigate('/editor/' + encodeURIComponent(opts.tuneId))
  }
}

export function consumeFocusNotationChecks(tuneId) {
  const ctx = getBulkCheckReturnContext()
  if (!ctx || ctx.tuneId !== tuneId || !ctx.focusNotationChecks) return false
  setBulkCheckReturnContext(Object.assign({}, ctx, { focusNotationChecks: false }))
  return true
}
