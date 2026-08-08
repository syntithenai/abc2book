import { useCallback, useEffect, useRef, useState } from 'react';
import IncomingMergeModal from './IncomingMergeModal';
import { getSourceMergePref, setSourceMergePref } from '../incomingMergePrefs';
import { pollRegisteredSourceUpdates, startSourceUrlPolling } from '../sourceUrlSync';
import { registerMergeCheckHandler, unregisterMergeCheckHandler } from '../mergeCheckTrigger';
import { dismissMergeToast, showIncomingMergeToast } from '../mergeToast';
import { backfillSourcesFromTunes } from '../syncSourcesStore';
import {
  applyMergeDismissalState,
  dismissEntireMergeBatch,
} from '../sourceMergeDismissals';

function getTuneImportHash(tunebook) {
  return tunebook && tunebook.abcTools && tunebook.abcTools.getTuneImportHash;
}

export default function SyncSourcesHost(props) {
  const token = props.token;
  const tunes = props.tunes;
  const tunesHydrated = props.tunesHydrated;
  const deletedTunes = props.deletedTunes;
  const tunebook = props.tunebook;
  const driveApi = props.driveApi;
  const [pendingBatch, setPendingBatch] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const queueRef = useRef([]);
  const showingToastRef = useRef(false);
  const backfilledRef = useRef(false);

  const processQueue = useCallback(function() {
    if (showingToastRef.current || pendingBatch) return;
    while (queueRef.current.length > 0) {
      const next = queueRef.current.shift();
      const pref = getSourceMergePref(next.sourceKey);
      if (pref === 'alwaysReject') continue;
      if (pref === 'alwaysAccept') {
        if (typeof props.onApplySourceUrlMerge === 'function') {
          props.onApplySourceUrlMerge(next, null);
        }
        continue;
      }
      if (!next.records || next.records.length === 0) continue;
      setPendingBatch(next);
      showingToastRef.current = true;
      showIncomingMergeToast({
        message: 'Source updates available for ' + next.sourceLabel + '.',
        onAccept: function() {
          showingToastRef.current = false;
          dismissMergeToast();
          applyMergeDismissalState(next.sourceKey, next, null, getTuneImportHash(tunebook));
          if (typeof props.onApplySourceUrlMerge === 'function') {
            props.onApplySourceUrlMerge(next, null);
          }
          setPendingBatch(null);
          setShowModal(false);
          processQueue();
        },
        onMerge: function() {
          setShowModal(true);
        },
      });
      return;
    }
  }, [pendingBatch, props, tunebook]);

  const applyBatch = useCallback(function(recordState, options) {
    if (!pendingBatch || typeof props.onApplySourceUrlMerge !== 'function') return;
    if (options && options.acceptAllFromSource) {
      setSourceMergePref(pendingBatch.sourceKey, 'alwaysAccept');
    }
    applyMergeDismissalState(pendingBatch.sourceKey, pendingBatch, recordState, getTuneImportHash(tunebook));
    props.onApplySourceUrlMerge(pendingBatch, recordState);
    setPendingBatch(null);
    setShowModal(false);
    showingToastRef.current = false;
    dismissMergeToast();
    processQueue();
  }, [pendingBatch, props, processQueue, tunebook]);

  const rejectBatch = useCallback(function(options) {
    if (pendingBatch) {
      if (options && options.rejectAllFromSource) {
        setSourceMergePref(pendingBatch.sourceKey, 'alwaysReject');
      } else {
        dismissEntireMergeBatch(pendingBatch.sourceKey, pendingBatch, getTuneImportHash(tunebook));
      }
    }
    setPendingBatch(null);
    setShowModal(false);
    showingToastRef.current = false;
    dismissMergeToast();
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
      onSourceUrlAbcFetched: props.onSourceUrlAbcFetched,
    });
    if (batches.length > 0) {
      queueRef.current = queueRef.current.concat(batches);
      processQueue();
    }
  }, [token, tunes, tunesHydrated, deletedTunes, tunebook, driveApi, processQueue, props.onSourceUrlAbcFetched]);

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
      onClose={function() { setShowModal(false); }}
      onApply={applyBatch}
      onReject={rejectBatch}
    />
  );
}
