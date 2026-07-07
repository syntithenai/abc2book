import { useCallback, useEffect, useRef, useState } from 'react';
import IncomingMergeModal from './IncomingMergeModal';
import {
  buildDriveMergeRecords,
  summarizeMergeRecords,
} from '../incomingMergeUtils';
import {
  DRIVE_TUNEBOOK_SOURCE_KEY,
  getSourceMergePref,
  setSourceMergePref,
} from '../incomingMergePrefs';
import { dismissMergeToast, showIncomingMergeToast } from '../mergeToast';

export default function IncomingMergeHost(props) {
  const sheetUpdateResults = props.sheetUpdateResults;
  const googleDocumentId = props.googleDocumentId;
  const token = props.token;
  const [showModal, setShowModal] = useState(false);
  const [pendingBatch, setPendingBatch] = useState(null);
  const toastShownRef = useRef(false);

  const buildDriveBatch = useCallback(function(results) {
    if (!results) return null;
    const sourceKey = googleDocumentId || DRIVE_TUNEBOOK_SOURCE_KEY;
    const records = buildDriveMergeRecords(results);
    return {
      kind: 'drive',
      sourceKey: sourceKey,
      sourceLabel: 'Google Drive tunebook',
      summary: summarizeMergeRecords(records),
      records: records,
      sheetUpdateResults: results,
    };
  }, [googleDocumentId]);

  const clearPending = useCallback(function() {
    setPendingBatch(null);
    setShowModal(false);
    toastShownRef.current = false;
    dismissMergeToast();
    if (typeof props.onClear === 'function') props.onClear();
  }, [props]);

  const applyDriveBatch = useCallback(function(recordState, options) {
    const batch = pendingBatch || buildDriveBatch(sheetUpdateResults);
    if (!batch || !batch.sheetUpdateResults) return;
    if (options && options.acceptAllFromSource) {
      setSourceMergePref(batch.sourceKey, 'alwaysAccept');
    }
    if (typeof props.onApplyDriveMerge === 'function') {
      props.onApplyDriveMerge(batch.sheetUpdateResults, recordState);
    }
    clearPending();
  }, [pendingBatch, buildDriveBatch, sheetUpdateResults, props, clearPending]);

  const rejectBatch = useCallback(function(options) {
    const batch = pendingBatch || buildDriveBatch(sheetUpdateResults);
    if (batch && options && options.rejectAllFromSource) {
      setSourceMergePref(batch.sourceKey, 'alwaysReject');
    }
    clearPending();
  }, [pendingBatch, buildDriveBatch, sheetUpdateResults, clearPending]);

  useEffect(function() {
    if (!token || !sheetUpdateResults) {
      toastShownRef.current = false;
      return;
    }

    const batch = buildDriveBatch(sheetUpdateResults);
    if (!batch || batch.records.length === 0) return;

    const pref = getSourceMergePref(batch.sourceKey);
    if (pref === 'alwaysReject') {
      if (typeof props.onClear === 'function') props.onClear();
      return;
    }
    if (pref === 'alwaysAccept') {
      if (typeof props.onApplyDriveMerge === 'function') {
        props.onApplyDriveMerge(sheetUpdateResults, null);
      }
      if (typeof props.onClear === 'function') props.onClear();
      return;
    }

    setPendingBatch(batch);

    if (!toastShownRef.current) {
      toastShownRef.current = true;
      showIncomingMergeToast({
        message: 'Google Drive updates available (' + batch.summary + ').',
        onAccept: function() {
          applyDriveBatch(null, { acceptAllFromSource: false });
        },
        onMerge: function() {
          setShowModal(true);
        },
      });
    }
  }, [token, sheetUpdateResults, buildDriveBatch, applyDriveBatch, props]);

  return (
    <IncomingMergeModal
      show={showModal}
      batch={pendingBatch}
      tunebook={props.tunebook}
      onClose={function() { setShowModal(false); }}
      onApply={applyDriveBatch}
      onReject={rejectBatch}
    />
  );
}
