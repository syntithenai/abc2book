import React from 'react';
import { toast } from 'react-toastify';

let activeMergeToastId = null;

export function dismissMergeToast() {
  if (activeMergeToastId != null) {
    try { toast.dismiss(activeMergeToastId); } catch (e) {}
    activeMergeToastId = null;
  }
}

export function showIncomingMergeToast(options) {
  const opts = options || {};
  dismissMergeToast();

  activeMergeToastId = toast.warning(
    function(renderProps) {
      return (
        <div className="incoming-merge-toast" style={{ display: 'flex', alignItems: 'center', gap: '0.6em', flexWrap: 'wrap' }}>
          <span>{opts.message || 'Updates available from a remote source.'}</span>
          <button
            type="button"
            className="btn btn-sm btn-success"
            data-testid="merge-toast-accept"
            onClick={function() {
              dismissMergeToast();
              if (typeof opts.onAccept === 'function') opts.onAccept();
              if (typeof renderProps.closeToast === 'function') renderProps.closeToast();
            }}
          >
            Accept
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            data-testid="merge-toast-merge"
            onClick={function() {
              if (typeof opts.onMerge === 'function') opts.onMerge();
              if (typeof renderProps.closeToast === 'function') renderProps.closeToast();
            }}
          >
            Merge
          </button>
        </div>
      );
    },
    {
      autoClose: false,
      closeOnClick: false,
      onClose: function() {
        activeMergeToastId = null;
      },
    }
  );
  return activeMergeToastId;
}
