import { useCallback, useEffect, useRef, useState } from 'react';
import IncomingMergeModal from './IncomingMergeModal';
import { getSourceMergePref, setSourceMergePref } from '../incomingMergePrefs';
import { pollSourceUrlUpdates, startSourceUrlPolling } from '../sourceUrlSync';
import { registerMergeCheckHandler, unregisterMergeCheckHandler } from '../mergeCheckTrigger';
import { dismissMergeToast, showIncomingMergeToast } from '../mergeToast';

export default function SourceUrlSyncHost(props) {
  const token = props.token;
  const tunes = props.tunes;
  const tunebook = props.tunebook;
  const driveApi = props.driveApi;
  const [pendingBatch, setPendingBatch] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const queueRef = useRef([]);
  const showingToastRef = useRef(false);

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
      setPendingBatch(next);
      showingToastRef.current = true;
      showIncomingMergeToast({
        message: 'Source URL updates available for ' + next.sourceLabel + '.',
        onAccept: function() {
          showingToastRef.current = false;
          dismissMergeToast();
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
  }, [pendingBatch, props]);

  const applyBatch = useCallback(function(recordState, options) {
    if (!pendingBatch || typeof props.onApplySourceUrlMerge !== 'function') return;
    if (options && options.acceptAllFromSource) {
      setSourceMergePref(pendingBatch.sourceKey, 'alwaysAccept');
    }
    props.onApplySourceUrlMerge(pendingBatch, recordState);
    setPendingBatch(null);
    setShowModal(false);
    showingToastRef.current = false;
    dismissMergeToast();
    processQueue();
  }, [pendingBatch, props, processQueue]);

  const rejectBatch = useCallback(function(options) {
    if (pendingBatch && options && options.rejectAllFromSource) {
      setSourceMergePref(pendingBatch.sourceKey, 'alwaysReject');
    }
    setPendingBatch(null);
    setShowModal(false);
    showingToastRef.current = false;
    dismissMergeToast();
    processQueue();
  }, [pendingBatch, processQueue]);

  const handlePoll = useCallback(async function() {
    if (!token || !tunes || !tunebook) return;
    const batches = await pollSourceUrlUpdates({
      tunes: tunes,
      tunebook: tunebook,
      driveApi: driveApi,
      onSourceUrlAbcFetched: props.onSourceUrlAbcFetched,
    });
    if (batches.length > 0) {
      queueRef.current = queueRef.current.concat(batches);
      processQueue();
    }
  }, [token, tunes, tunebook, driveApi, processQueue]);

  useEffect(function() {
    if (!token || !tunes) return undefined;
    return startSourceUrlPolling({ onPoll: handlePoll });
  }, [token, tunes, handlePoll]);

  useEffect(function() {
    registerMergeCheckHandler('sourceUrl', handlePoll);
    return function() {
      unregisterMergeCheckHandler('sourceUrl');
    };
  }, [handlePoll]);

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
