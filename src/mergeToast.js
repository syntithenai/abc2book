import React from 'react';
import { toast } from 'react-toastify';
import { isCapacitorNative } from './platformUtils';

let activeMergeToastId = null;

function runToastAction(evt, action) {
  if (evt) {
    evt.preventDefault();
    evt.stopPropagation();
  }
  if (typeof action === 'function') action();
}

export function dismissMergeToast() {
  if (activeMergeToastId != null) {
    try { toast.dismiss(activeMergeToastId); } catch (e) {}
    activeMergeToastId = null;
  }
}

function bindToastButton(handler) {
  if (isCapacitorNative()) {
    return {
      onClick: undefined,
      onPointerUp: function(evt) {
        runToastAction(evt, handler);
      },
    };
  }
  return {
    onClick: function(evt) {
      runToastAction(evt, handler);
    },
    onPointerUp: undefined,
  };
}

export function showIncomingMergeToast(options) {
  const opts = options || {};
  dismissMergeToast();

  activeMergeToastId = toast.warning(
    function(renderProps) {
      var acceptBindings = bindToastButton(function() {
        dismissMergeToast();
        if (typeof opts.onAccept === 'function') opts.onAccept();
        if (typeof renderProps.closeToast === 'function') renderProps.closeToast();
      });
      var mergeBindings = bindToastButton(function() {
        dismissMergeToast();
        if (typeof opts.onMerge === 'function') opts.onMerge();
        if (typeof renderProps.closeToast === 'function') renderProps.closeToast();
      });

      return (
        <div className="incoming-merge-toast" style={{ display: 'flex', alignItems: 'center', gap: '0.6em', flexWrap: 'wrap' }}>
          <span>{opts.message || 'Updates available from a remote source.'}</span>
          <button
            type="button"
            className="btn btn-sm btn-success"
            data-testid="merge-toast-accept"
            onClick={acceptBindings.onClick}
            onPointerUp={acceptBindings.onPointerUp}
          >
            Accept
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            data-testid="merge-toast-merge"
            onClick={mergeBindings.onClick}
            onPointerUp={mergeBindings.onPointerUp}
          >
            Merge
          </button>
        </div>
      );
    },
    {
      autoClose: false,
      closeOnClick: false,
      draggable: false,
      hideProgressBar: true,
      className: 'incoming-merge-toast-shell',
      position: isCapacitorNative() ? 'top-center' : 'bottom-right',
      onClose: function() {
        activeMergeToastId = null;
      },
    }
  );
  return activeMergeToastId;
}
