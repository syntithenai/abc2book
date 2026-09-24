import { useCallback, useEffect, useRef, useState } from 'react';
import IncomingMergeModal from './IncomingMergeModal';
import {
  buildDriveMergeRecords,
  summarizeMergeRecords,
  splitSourceUrlMergeRecords,
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

function filterSheetResultsToRecords(sheetUpdateResults, records) {
  if (!sheetUpdateResults || !records || !records.length) {
    return {
      inserts: {},
      updates: {},
      deletes: {},
      wipeRecovery: !!(sheetUpdateResults && sheetUpdateResults.wipeRecovery),
    };
  }
  const ids = {};
  records.forEach(function(record) {
    if (record && record.id) ids[record.id] = true;
  });
  const inserts = {};
  const updates = {};
  const deletes = {};
  Object.keys(sheetUpdateResults.inserts || {}).forEach(function(id) {
    if (ids[id]) inserts[id] = sheetUpdateResults.inserts[id];
  });
  Object.keys(sheetUpdateResults.updates || {}).forEach(function(id) {
    if (ids[id]) updates[id] = sheetUpdateResults.updates[id];
  });
  Object.keys(sheetUpdateResults.deletes || {}).forEach(function(id) {
    if (ids[id]) deletes[id] = sheetUpdateResults.deletes[id];
  });
  return {
    inserts: inserts,
    updates: updates,
    deletes: deletes,
    fullSheet: sheetUpdateResults.fullSheet,
    remoteDeleted: sheetUpdateResults.remoteDeleted,
    wipeRecovery: !!sheetUpdateResults.wipeRecovery,
    localUpdates: sheetUpdateResults.localUpdates,
    localInserts: sheetUpdateResults.localInserts,
  };
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

  const buildDriveBatch = useCallback(function(results, recordsOverride) {
    if (!results) return null;
    const sourceKey = googleDocumentId || DRIVE_TUNEBOOK_SOURCE_KEY;
    const wipeRecovery = !!results.wipeRecovery;
    const records = recordsOverride || buildDriveMergeRecords(results, {
      sourceKey: sourceKey,
      getTuneImportHash: getTuneImportHash(tunebook),
      skipDismissals: wipeRecovery,
    });
    return {
      kind: 'drive',
      sourceKey: sourceKey,
      sourceLabel: wipeRecovery ? 'Google Drive songbook (restore)' : 'Google Drive tunebook',
      summary: summarizeMergeRecords(records),
      records: records,
      sheetUpdateResults: results,
      wipeRecovery: wipeRecovery,
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
    if (pref === 'alwaysReject' && !batch.wipeRecovery) {
      if (typeof onClear === 'function') onClear();
      return;
    }
    if (pref === 'alwaysAccept' && !batch.wipeRecovery) {
      handledResultsRef.current = sheetUpdateResults;
      applyMergeDismissalState(batch.sourceKey, batch, null, getTuneImportHash(tunebook));
      if (typeof onApplyDriveMerge === 'function') {
        onApplyDriveMerge(sheetUpdateResults, null);
      }
      if (typeof onClear === 'function') onClear();
      return;
    }

    // Default: auto-apply inserts + non-clash updates; only prompt for clashes/deletes.
    if (!batch.wipeRecovery) {
      const split = splitSourceUrlMergeRecords(batch.records, batch.sourceKey);
      const reviewRecords = (split.clashRecords || []).slice();
      batch.records.forEach(function(record) {
        if (record && record.kind === 'delete') {
          const already = reviewRecords.some(function(r) { return r && r.id === record.id; });
          if (!already) reviewRecords.push(record);
        }
      });
      const silentOnly = (split.silentRecords || []).filter(function(record) {
        return record && record.kind !== 'delete';
      });
      if (silentOnly.length > 0) {
        const silentSheet = filterSheetResultsToRecords(sheetUpdateResults, silentOnly);
        const silentBatch = buildDriveBatch(silentSheet, silentOnly);
        applyMergeDismissalState(batch.sourceKey, silentBatch, null, getTuneImportHash(tunebook));
        if (typeof onApplyDriveMerge === 'function') {
          onApplyDriveMerge(silentSheet, null);
        }
      }
      if (reviewRecords.length === 0) {
        handledResultsRef.current = sheetUpdateResults;
        if (typeof onClear === 'function') onClear();
        return;
      }
      const reviewSheet = filterSheetResultsToRecords(sheetUpdateResults, reviewRecords);
      const reviewBatch = buildDriveBatch(reviewSheet, reviewRecords);
      setPendingBatch(reviewBatch);
      if (!toastShownRef.current) {
        toastShownRef.current = true;
        showIncomingMergeToast({
          message: 'Google Drive updates need review (' + reviewBatch.summary + ').',
          acceptLabel: 'Accept',
          mergeLabel: 'Merge',
          onAccept: function() {
            applyDriveBatch(null, { acceptAllFromSource: false });
          },
          onMerge: function() {
            setShowModal(true);
          },
        });
      }
      return;
    }

    setPendingBatch(batch);

    if (!toastShownRef.current) {
      toastShownRef.current = true;
      const wipeRecovery = !!batch.wipeRecovery;
      showIncomingMergeToast({
        message: wipeRecovery
          ? ('Restore missing tunes from Google Drive (' + batch.summary + ').')
          : ('Google Drive updates available (' + batch.summary + ').'),
        acceptLabel: wipeRecovery ? 'Restore' : 'Accept',
        mergeLabel: wipeRecovery ? 'Review' : 'Merge',
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
