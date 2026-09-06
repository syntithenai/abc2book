import { useCallback, useEffect, useRef, useState } from 'react';
import IncomingMergeModal from './IncomingMergeModal';
import { getSourceMergePref, setSourceMergePref } from '../incomingMergePrefs';
import {
  splitSourceUrlMergeRecords,
  summarizeMergeRecords,
} from '../incomingMergeUtils';
import { pollRegisteredSourceUpdates, startSourceUrlPolling } from '../sourceUrlSync';
import { registerMergeCheckHandler, unregisterMergeCheckHandler } from '../mergeCheckTrigger';
import { backfillSourcesFromTunes } from '../syncSourcesStore';
import {
  applyMergeDismissalState,
  dismissEntireMergeBatch,
  isSourceMergeDismissed,
} from '../sourceMergeDismissals';

function getTuneImportHash(tunebook) {
  return tunebook && tunebook.abcTools && tunebook.abcTools.getTuneImportHash;
}

function filterDismissedRecords(batch, tunebook) {
  if (!batch || !Array.isArray(batch.records)) return batch;
  const getHash = getTuneImportHash(tunebook);
  const records = batch.records.filter(function(record) {
    if (!record) return false;
    const tune = record.incomingTune || record.localTune;
    if (!tune || !batch.sourceKey) return true;
    return !isSourceMergeDismissed(batch.sourceKey, record.id, tune, getHash);
  });
  if (records.length === batch.records.length) return batch;
  return Object.assign({}, batch, {
    records: records,
    summary: records.length ? batch.summary : '',
  });
}

function buildSubBatch(batch, records) {
  return Object.assign({}, batch, {
    records: records,
    summary: summarizeMergeRecords(records),
  });
}

export default function SyncSourcesHost(props) {
  const token = props.token;
  const tunes = props.tunes;
  const tunesHydrated = props.tunesHydrated;
  const deletedTunes = props.deletedTunes;
  const tunebook = props.tunebook;
  const driveApi = props.driveApi;
  const onApplySourceUrlMerge = props.onApplySourceUrlMerge;
  const onSourceUrlAbcFetched = props.onSourceUrlAbcFetched;
  const [pendingBatch, setPendingBatch] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const queueRef = useRef([]);
  const backfilledRef = useRef(false);

  const processQueue = useCallback(function() {
    if (pendingBatch) return;
    while (queueRef.current.length > 0) {
      let next = queueRef.current.shift();
      next = filterDismissedRecords(next, tunebook);
      const pref = getSourceMergePref(next.sourceKey);
      if (pref === 'alwaysReject') continue;
      if (pref === 'alwaysAccept') {
        if (typeof onApplySourceUrlMerge === 'function') {
          onApplySourceUrlMerge(next, null);
        }
        continue;
      }
      if (!next.records || next.records.length === 0) continue;

      const split = splitSourceUrlMergeRecords(next.records, next.sourceKey);
      if (split.silentRecords.length > 0) {
        const silentBatch = buildSubBatch(next, split.silentRecords);
        applyMergeDismissalState(next.sourceKey, silentBatch, null, getTuneImportHash(tunebook));
        if (typeof onApplySourceUrlMerge === 'function') {
          onApplySourceUrlMerge(silentBatch, null);
        }
      }
      if (split.clashRecords.length === 0) continue;

      setPendingBatch(buildSubBatch(next, split.clashRecords));
      setShowModal(true);
      return;
    }
  }, [pendingBatch, onApplySourceUrlMerge, tunebook]);

  const applyBatch = useCallback(function(recordState, options) {
    if (!pendingBatch || typeof onApplySourceUrlMerge !== 'function') return;
    if (options && options.acceptAllFromSource) {
      setSourceMergePref(pendingBatch.sourceKey, 'alwaysAccept');
    }
    applyMergeDismissalState(pendingBatch.sourceKey, pendingBatch, recordState, getTuneImportHash(tunebook));
    const appliedKey = pendingBatch.sourceKey;
    queueRef.current = queueRef.current.filter(function(batch) {
      return !batch || batch.sourceKey !== appliedKey;
    });
    onApplySourceUrlMerge(pendingBatch, recordState);
    setPendingBatch(null);
    setShowModal(false);
    processQueue();
  }, [pendingBatch, onApplySourceUrlMerge, processQueue, tunebook]);

  const rejectBatch = useCallback(function(options) {
    if (pendingBatch) {
      if (options && options.rejectAllFromSource) {
        setSourceMergePref(pendingBatch.sourceKey, 'alwaysReject');
      } else {
        dismissEntireMergeBatch(pendingBatch.sourceKey, pendingBatch, getTuneImportHash(tunebook));
      }
      const rejectedKey = pendingBatch.sourceKey;
      queueRef.current = queueRef.current.filter(function(batch) {
        return !batch || batch.sourceKey !== rejectedKey;
      });
    }
    setPendingBatch(null);
    setShowModal(false);
    processQueue();
  }, [pendingBatch, processQueue, tunebook]);

  const handlePoll = useCallback(async function() {
    if (!token || !tunes || !tunebook || !tunesHydrated) return;
    if (!backfilledRef.current) {
      backfillSourcesFromTunes(tunes);
      backfilledRef.current = true;
    }
    const batches = await pollRegisteredSourceUpdates({
      tunes: tunes,
      deletedTunes: deletedTunes,
      tunebook: tunebook,
      driveApi: driveApi,
      onSourceUrlAbcFetched: onSourceUrlAbcFetched,
    });
    if (batches.length > 0) {
      queueRef.current = queueRef.current.concat(batches);
      processQueue();
    }
  }, [token, tunes, tunesHydrated, deletedTunes, tunebook, driveApi, processQueue, onSourceUrlAbcFetched]);

  const handlePollRef = useRef(handlePoll);
  handlePollRef.current = handlePoll;

  const hasTunes = !!tunes;
  useEffect(function() {
    if (!token || !hasTunes || !tunesHydrated) return undefined;
    return startSourceUrlPolling({ onPoll: function() { return handlePollRef.current(); } });
  }, [token, hasTunes, tunesHydrated]);

  useEffect(function() {
    registerMergeCheckHandler('sourceUrl', function() { return handlePollRef.current(); });
    registerMergeCheckHandler('sharedSources', function() { return handlePollRef.current(); });
    return function() {
      unregisterMergeCheckHandler('sourceUrl');
      unregisterMergeCheckHandler('sharedSources');
    };
  }, []);

  return (
    <IncomingMergeModal
      show={showModal}
      batch={pendingBatch}
      tunebook={tunebook}
      onlyDiffering={true}
      onClose={rejectBatch}
      onApply={applyBatch}
      onReject={rejectBatch}
    />
  );
}
