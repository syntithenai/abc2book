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
import {
  applyMergeDismissalState,
  dismissEntireMergeBatch,
} from '../sourceMergeDismissals';

function getTuneImportHash(tunebook) {
  return tunebook && tunebook.abcTools && tunebook.abcTools.getTuneImportHash;
}

export default function IncomingMergeHost(props) {
  const sheetUpdateResults = props.sheetUpdateResults;
  const googleDocumentId = props.googleDocumentId;
  const token = props.token;
  const tunebook = props.tunebook;
  const onApplyDriveMerge = props.onApplyDriveMerge;
  const onClear = props.onClear;
  const [showModal, setShowModal] = useState(false);
  const [pendingBatch, setPendingBatch] = useState(null);
  const toastShownRef = useRef(false);
  // Ignore sheetUpdateResults that were already applied/rejected until parent clears them.
  const handledResultsRef = useRef(null);

  const buildDriveBatch = useCallback(function(results) {
    if (!results) return null;
    const sourceKey = googleDocumentId || DRIVE_TUNEBOOK_SOURCE_KEY;
    const records = buildDriveMergeRecords(results, {
      sourceKey: sourceKey,
      getTuneImportHash: getTuneImportHash(tunebook),
    });
    return {
      kind: 'drive',
      sourceKey: sourceKey,
      sourceLabel: 'Google Drive tunebook',
      summary: summarizeMergeRecords(records),
      records: records,
      sheetUpdateResults: results,
    };
  }, [googleDocumentId, tunebook]);

  const clearPending = useCallback(function() {
    setPendingBatch(null);
    setShowModal(false);
    dismissMergeToast();
    // Keep toastShownRef true until sheetUpdateResults actually clears, so a
    // re-render with the same results cannot immediately re-show the toast.
    if (typeof onClear === 'function') onClear();
  }, [onClear]);

  const applyDriveBatch = useCallback(function(recordState, options) {
    const batch = pendingBatch || buildDriveBatch(sheetUpdateResults);
    if (!batch || !batch.sheetUpdateResults) return;
    if (options && options.acceptAllFromSource) {
      setSourceMergePref(batch.sourceKey, 'alwaysAccept');
    }
    handledResultsRef.current = batch.sheetUpdateResults;
    applyMergeDismissalState(batch.sourceKey, batch, recordState, getTuneImportHash(tunebook));
    if (typeof onApplyDriveMerge === 'function') {
      onApplyDriveMerge(batch.sheetUpdateResults, recordState);
    }
    clearPending();
  }, [pendingBatch, buildDriveBatch, sheetUpdateResults, onApplyDriveMerge, clearPending, tunebook]);

  const rejectBatch = useCallback(function(options) {
    const batch = pendingBatch || buildDriveBatch(sheetUpdateResults);
    if (batch) {
      handledResultsRef.current = batch.sheetUpdateResults;
      if (options && options.rejectAllFromSource) {
        setSourceMergePref(batch.sourceKey, 'alwaysReject');
      } else {
        dismissEntireMergeBatch(batch.sourceKey, batch, getTuneImportHash(tunebook));
      }
    }
    clearPending();
  }, [pendingBatch, buildDriveBatch, sheetUpdateResults, clearPending, tunebook]);

  useEffect(function() {
    if (!token || !sheetUpdateResults) {
      toastShownRef.current = false;
      handledResultsRef.current = null;
      return;
    }

    if (handledResultsRef.current && handledResultsRef.current === sheetUpdateResults) {
      if (typeof onClear === 'function') onClear();
      return;
    }

    const batch = buildDriveBatch(sheetUpdateResults);
    if (!batch || batch.records.length === 0) {
      if (typeof onClear === 'function') onClear();
      return;
    }

    const pref = getSourceMergePref(batch.sourceKey);
    if (pref === 'alwaysReject') {
      if (typeof onClear === 'function') onClear();
      return;
    }
    if (pref === 'alwaysAccept') {
      handledResultsRef.current = sheetUpdateResults;
      applyMergeDismissalState(batch.sourceKey, batch, null, getTuneImportHash(tunebook));
      if (typeof onApplyDriveMerge === 'function') {
        onApplyDriveMerge(sheetUpdateResults, null);
      }
      if (typeof onClear === 'function') onClear();
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
  }, [token, sheetUpdateResults, buildDriveBatch, applyDriveBatch, onApplyDriveMerge, onClear, tunebook]);

  return (
    <IncomingMergeModal
      show={showModal}
      batch={pendingBatch}
      tunebook={tunebook}
      onClose={function() { setShowModal(false); }}
      onApply={applyDriveBatch}
      onReject={rejectBatch}
    />
  );
}
