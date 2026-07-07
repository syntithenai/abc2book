import { useCallback, useEffect, useRef, useState } from 'react';
import PerformanceSetMergeModal from './PerformanceSetMergeModal';
import {
  PERFORMANCE_SETS_DRIVE_SOURCE_KEY,
  getSourceMergePref,
  setSourceMergePref,
} from '../incomingMergePrefs';
import { dismissMergeToast, showIncomingMergeToast } from '../mergeToast';

export default function PerformanceSetMergeHost(props) {
  const pendingPrepared = props.pendingPrepared;
  const sourceLabel = props.sourceLabel || 'Remote tunebook';
  const [showModal, setShowModal] = useState(false);
  const [pendingBatch, setPendingBatch] = useState(null);
  const toastShownRef = useRef(false);

  const buildBatch = useCallback(function(prepared) {
    if (!prepared || !prepared.hasIncoming) return null;
    return {
      sourceKey: props.sourceKey || PERFORMANCE_SETS_DRIVE_SOURCE_KEY,
      sourceLabel: sourceLabel,
      prepared: prepared,
    };
  }, [props.sourceKey, sourceLabel]);

  const clearPending = useCallback(function() {
    setPendingBatch(null);
    setShowModal(false);
    toastShownRef.current = false;
    dismissMergeToast();
    if (typeof props.onClear === 'function') props.onClear();
  }, [props]);

  const applyBatch = useCallback(function(recordState, options) {
    const batch = pendingBatch || buildBatch(pendingPrepared);
    if (!batch || !batch.prepared) return;
    if (options && options.acceptAllFromSource) {
      setSourceMergePref(batch.sourceKey, 'alwaysAccept');
    }
    if (typeof props.onApply === 'function') {
      props.onApply(batch.prepared, recordState);
    }
    clearPending();
  }, [pendingBatch, buildBatch, pendingPrepared, props, clearPending]);

  const rejectBatch = useCallback(function(options) {
    const batch = pendingBatch || buildBatch(pendingPrepared);
    if (batch && options && options.rejectAllFromSource) {
      setSourceMergePref(batch.sourceKey, 'alwaysReject');
    }
    clearPending();
  }, [pendingBatch, buildBatch, pendingPrepared, clearPending]);

  useEffect(function() {
    if (!pendingPrepared || !pendingPrepared.hasIncoming) {
      toastShownRef.current = false;
      return;
    }
    if (props.deferWhileTuneMerge) {
      return;
    }

    const batch = buildBatch(pendingPrepared);
    if (!batch) return;

    const pref = getSourceMergePref(batch.sourceKey);
    if (pref === 'alwaysReject') {
      if (typeof props.onClear === 'function') props.onClear();
      return;
    }
    if (pref === 'alwaysAccept') {
      if (typeof props.onApply === 'function') {
        props.onApply(batch.prepared, null);
      }
      if (typeof props.onClear === 'function') props.onClear();
      return;
    }

    setPendingBatch(batch);

    if (!toastShownRef.current) {
      toastShownRef.current = true;
      showIncomingMergeToast({
        message: 'Set list updates available (' + batch.prepared.summary + ').',
        onAccept: function() {
          applyBatch(null, { acceptAllFromSource: false });
        },
        onMerge: function() {
          setShowModal(true);
        },
      });
    }
  }, [pendingPrepared, buildBatch, applyBatch, props, props.deferWhileTuneMerge]);

  return (
    <PerformanceSetMergeModal
      show={showModal}
      batch={pendingBatch}
      onClose={function() { setShowModal(false); }}
      onApply={applyBatch}
      onReject={rejectBatch}
    />
  );
}
