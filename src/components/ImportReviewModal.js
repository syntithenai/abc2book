import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Badge, Button, ButtonGroup, ListGroup, Modal, Row } from 'react-bootstrap';
import { addFromFileAcceptList } from '../importSourceParse';
import MidiImportDiagnostics from './MidiImportDiagnostics';
import {
  cancelCurrentCandidate,
  coalesceSessionCandidatesByMergeTarget,
  createBlankAddCandidate,
  currentCandidate,
  isAddTunesChrome,
  isReviewComplete,
  markCandidateImported,
  markAllCandidatesImported,
  mergeCandidate,
  navigateReviewCandidate,
  removeAddDraftFromSession,
  sessionProgressLabel,
  updateCurrentCandidate,
} from '../importReviewSession';
import {
  mergeCandidateWithEnrichment,
} from '../importReviewEnrichmentQueue';
import { findCollectionMatches } from '../tuneCollectionMatch';
import {
  applyCoalescedFieldChoicesToSuggestions,
  applyImportSuggestion,
  acceptAllImportSuggestions,
  keepAllLocalImportSuggestions,
  alignedLyricPreviewPairs,
  buildReviewFormState,
  buildTuneFormSyncSignal,
  applyForcedBookToBookList,
  primaryBookFromBookList,
  formValuesToTune,
  importSuggestionDiffersFromForm,
  importedNotationText,
  notationPreviewLine,
  sessionTuneAheadOfForm,
  summarizeImportMergeFieldCounts,
  tuneToFormValues,
} from '../importReviewFieldUtils';
import { mergeBibliographicList } from '../tuneBibliographicUtils';
import {
  fieldLookupJobIdsForCandidate,
  fieldLookupKindsForCandidate,
} from '../importReviewCandidateUtils';
import { addDraftHasLocalAttachments } from '../addFormAttach';
import { isOwnedMediaLink } from '../linkRecording';
import TuneRecordForm from './TuneRecordForm';
import AddTuneSimpleForm from './AddTuneSimpleForm';
import AddCuratedCollectionsPanel from './AddCuratedCollectionsPanel';
import AddBulkImportPanel from './AddBulkImportPanel';
import YouTubeSearchModal from './YouTubeSearchModal';
import PasteImportModal from './PasteImportModal';
import ImportUrlModal from './ImportUrlModal';
import DriveFilePickerModal from './DriveFilePickerModal';
import SheetImageCameraModal from './SheetImageCameraModal';
import SheetImageGooglePhotosModal from './SheetImageGooglePhotosModal';
import useAudioUtils from '../useAudioUtils';
import useAbcjsParser from '../useAbcjsParser';
import useGoogleDocument from '../useGoogleDocument';
import useMediaResolverHealth from '../useMediaResolverHealth';
import { dismissFieldLookup } from '../tuneFieldLookupQueue';
import FieldLookupReviewButton from './FieldLookupReviewButton';
import { summarizeSheetSnapshotCandidates } from '../bulkSheetSnapshotImport';
import { pendingSnapshotsFromCandidate, describeSnapshotForCancel } from '../importReviewSnapshots';
import { normalizeAbcForImport } from '../abcImportNormalize';
import { setBulkImportText } from '../addBulkImportTextStore';
import BookSelectorModal from './BookSelectorModal';

function sheetSnapshotReviewMessage(summary) {
  if (!summary || !summary.total) return '';
  if (summary.filename === summary.total) {
    return 'Titles could not be read from the sheet images. Names are based on filenames or folder names — please review and edit each title before importing.';
  }
  if (summary.filename > 0) {
    return summary.filename + ' title' + (summary.filename === 1 ? '' : 's')
      + ' could not be read from sheets and '
      + (summary.filename === 1 ? 'is' : 'are')
      + ' based on filenames — please review.';
  }
  return '';
}

function activeSheetSnapshotTitleHint(candidate) {
  const meta = candidate && candidate.sheetSnapshotMeta;
  if (!meta || meta.titleSource === 'ocr' || meta.titleSource === 'cloud-ocr' || meta.titleSource === 'pdf-text') return '';
  const fileName = String(meta.sourceFileName || '').trim();
  if (fileName) {
    return 'Title from filename (' + fileName + ') — edit if needed.';
  }
  return 'Title from filename — edit if needed.';
}

function dismissCandidateFieldLookups(candidate) {
  fieldLookupJobIdsForCandidate(candidate).forEach(function(jobId) {
    dismissFieldLookup(jobId);
  });
}

function recordingBlobToFile(blob) {
  const extension = blob && blob.type === 'audio/webm' ? 'webm' : 'wav';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return new File([blob], 'recording-' + timestamp + '.' + extension, {
    type: (blob && blob.type) || 'audio/webm',
  });
}

function ReviewSummary(props) {
  const summary = props.summary;
  if (!summary) return null;
  return (
    <Alert variant="success">
      Import review complete — {summary.reviewed} reviewed
      {summary.created ? (', ' + summary.created + ' created') : ''}
      {summary.merged ? (', ' + summary.merged + ' merged') : ''}.
    </Alert>
  );
}

const MERGE_FIELD_LABELS = {
  title: 'Title',
  artist: 'Composer',
  artists: 'Artists',
  bookList: 'Books',
  tagList: 'Tags',
  genre: 'Genre',
  rhythm: 'Rhythm',
  meter: 'Meter',
  keyName: 'Key',
  tempo: 'Tempo',
  noteLength: 'Note length',
  backgroundInfo: 'Background info',
  lyrics: 'Lyrics',
  notes: 'Notation',
  aliases: 'Aliases',
  capo: 'Capo',
  transpose: 'Transpose',
  tuning: 'Tuning',
  links: 'Links',
  playbackAudioFilters: 'Playback audio filters',
  soundFonts: 'Sound fonts',
  meta: 'Meta',
};

function mergeFieldLabelsFromSuggestions(suggestions, formValues) {
  return Object.keys(suggestions || {}).filter(function(key) {
    return importSuggestionDiffersFromForm(key, suggestions[key], formValues);
  }).map(function(key) {
    return MERGE_FIELD_LABELS[key] || key;
  });
}

function addTuneRequirementMessage(title, composer) {
  const hasTitle = !!String(title || '').trim();
  const hasComposer = !!String(composer || '').trim();
  if (hasTitle && hasComposer) return '';
  if (!hasTitle && !hasComposer) return 'Enter a title and composer to add this tune.';
  if (!hasTitle) return 'Enter a title to add this tune.';
  return 'Enter a composer to add this tune.';
}

function describeLinkForCancelWarning(link) {
  if (!link) return 'Media link';
  const title = String(link.title || '').trim();
  const href = String(link.link || '').trim();
  const isAttachedAudio = !!(link.recordingId || link.source === 'file' || link.source === 'mic'
    || (href && href.indexOf('recording:') === 0));
  if (isAttachedAudio) {
    const kind = link.source === 'mic' ? 'Recording' : 'Attached audio';
    return title ? (kind + ': ' + title) : kind;
  }
  if (/youtu(\.be|be\.com)/i.test(href)) {
    return title ? ('YouTube: ' + title) : 'YouTube link';
  }
  if (title) return title;
  if (href) return href;
  return 'Media link';
}

function linksLostOnCancel(formLinks, baseTune) {
  const links = Array.isArray(formLinks) ? formLinks.filter(Boolean) : [];
  if (!links.length) return [];
  if (!baseTune) return links;
  const baseKeys = {};
  (Array.isArray(baseTune.links) ? baseTune.links : []).forEach(function(link) {
    const key = link && (link.recordingId || link.link || link.title);
    if (key) baseKeys[String(key)] = true;
  });
  return links.filter(function(link) {
    const key = link && (link.recordingId || link.link || link.title);
    if (!key) return true;
    return !baseKeys[String(key)];
  });
}

function ImportReviewCancelWarningModal(props) {
  const mode = props.mode;
  if (!mode) return null;

  const importCount = props.importCount || 0;
  const mergeFields = Array.isArray(props.mergeFields) ? props.mergeFields : [];
  const mediaLinks = Array.isArray(props.mediaLinks) ? props.mediaLinks : [];
  const tuneTitle = String(props.tuneTitle || '').trim() || 'Untitled';
  const isCancelAll = mode === 'all';

  return (
    <Modal
      show={true}
      onHide={props.onHide}
      centered
      backdrop="static"
      data-testid="import-review-cancel-warning"
    >
      <Modal.Header closeButton>
        <Modal.Title>{isCancelAll ? 'Cancel all imports?' : 'Cancel this import?'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {isCancelAll ? (
          <p>
            This will discard <strong>{importCount}</strong> import request{importCount === 1 ? '' : 's'}
            {' '}and close import review. Unsaved edits on the current item will be lost.
          </p>
        ) : (
          <p>
            This will discard the current import request
            {' '}(<strong>{tuneTitle}</strong>)
            {' '}and remove it from the queue of <strong>{importCount}</strong> import request{importCount === 1 ? '' : 's'}.
            Unsaved edits on this item will be lost.
          </p>
        )}
        {mediaLinks.length > 0 ? (
          <div className="mb-3">
            <p className="mb-1">
              Media and links that will be discarded
              {isCancelAll ? ' on the current item' : ''}:
            </p>
            <ul className="mb-0">
              {mediaLinks.map(function(label, index) {
                return <li key={label + '-' + index}>{label}</li>;
              })}
            </ul>
          </div>
        ) : null}
        {mergeFields.length > 0 ? (
          <div>
            <p className="mb-1">
              Unapplied merge field{mergeFields.length === 1 ? '' : 's'} that will be lost
              {isCancelAll ? ' on the current item' : ''}:
            </p>
            <ul className="mb-0">
              {mergeFields.map(function(label) {
                return <li key={label}>{label}</li>;
              })}
            </ul>
          </div>
        ) : (
          <p className={'text-muted mb-0' + (mediaLinks.length ? ' mt-2' : '')}>
            There are no unapplied merge field suggestions on the current item.
          </p>
        )}
        {!isCancelAll && importCount > 1 ? (
          <p className="text-muted small mt-3 mb-0">
            {importCount - 1} other import request{importCount - 1 === 1 ? '' : 's'} will remain in the queue.
          </p>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={props.onHide}>Keep reviewing</Button>
        <Button
          variant="danger"
          data-testid="import-review-cancel-confirm"
          onClick={props.onConfirm}
        >
          {isCancelAll ? 'Cancel all imports' : 'Cancel this import'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function buildImportAllSummary(session, tunes) {
  const candidates = session && Array.isArray(session.candidates) ? session.candidates : [];
  const remaining = candidates.filter(function(candidate) {
    if (!candidate || candidate.imported) return false;
    if (session.importedCandidateIds && session.importedCandidateIds[candidate.id]) return false;
    return true;
  });
  let createCount = 0;
  let mergeCount = 0;
  const items = remaining.map(function(candidate) {
    const title = String((candidate.tune && candidate.tune.name) || '').trim() || 'Untitled';
    const isMerge = !!(candidate.mergeTargetId && tunes && tunes[candidate.mergeTargetId]);
    if (isMerge) mergeCount += 1;
    else createCount += 1;
    const mergeName = isMerge
      ? (tunes[candidate.mergeTargetId].name || 'existing tune')
      : null;
    const media = (candidate.tune && Array.isArray(candidate.tune.links) ? candidate.tune.links : [])
      .map(describeLinkForCancelWarning);
    return {
      id: candidate.id,
      title: title,
      action: isMerge ? 'merge' : 'create',
      mergeName: mergeName,
      media: media,
    };
  });
  return {
    total: remaining.length,
    createCount: createCount,
    mergeCount: mergeCount,
    items: items,
  };
}

function ImportReviewImportAllWarningModal(props) {
  if (!props.show) return null;
  const summary = props.summary || { total: 0, createCount: 0, mergeCount: 0, items: [] };

  return (
    <Modal
      show={true}
      onHide={props.onHide}
      centered
      backdrop="static"
      data-testid="import-review-import-all-warning"
    >
      <Modal.Header closeButton>
        <Modal.Title>Import all?</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          This will import <strong>{summary.total}</strong> request{summary.total === 1 ? '' : 's'}
          {summary.createCount ? (': ' + summary.createCount + ' new') : ''}
          {summary.createCount && summary.mergeCount ? ',' : (summary.mergeCount ? ':' : '')}
          {summary.mergeCount ? (' ' + summary.mergeCount + ' merge' + (summary.mergeCount === 1 ? '' : 's')) : ''}
          .
        </p>
        {summary.items.length > 0 ? (
          <ul className="mb-0">
            {summary.items.map(function(item) {
              return (
                <li key={item.id} className="mb-2">
                  <strong>{item.title}</strong>
                  {' — '}
                  {item.action === 'merge'
                    ? ('merge into ' + (item.mergeName || 'existing tune'))
                    : 'create new tune'}
                  {item.media && item.media.length ? (
                    <div className="text-muted small">{item.media.join(' · ')}</div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={props.onHide}>Keep reviewing</Button>
        <Button
          variant="danger"
          data-testid="import-review-import-all-confirm"
          onClick={props.onConfirm}
        >
          Import all
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default function ImportReviewModal(props) {
  const session = props.session;
  const show = !!(props.show && session && session.step !== 'done');
  const identifyCandidate = currentCandidate(session);
  const mergeTargetCandidate = mergeCandidate(session);
  const activeCandidate = session && session.mergeIndex != null ? mergeTargetCandidate : identifyCandidate;
  const tunes = props.tunes || {};
  const resolverAvailable = props.resolverAvailable !== false;
  const audioUtils = useAudioUtils();
  const abcjsParser = useAbcjsParser();
  const driveApi = useGoogleDocument(props.token, props.logout || function() {}, props.forceRefresh);
  const { checked: resolverChecked } = useMediaResolverHealth();
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const recordingStartedAtRef = useRef(0);
  const recordingIntervalRef = useRef(null);
  const suppressFormInitRef = useRef(false);
  const formSyncTimerRef = useRef(null);
  const formDirtyRef = useRef(false);
  const formValuesRef = useRef({ title: '' });
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showSheetCamera, setShowSheetCamera] = useState(false);
  const [showSheetGooglePhotos, setShowSheetGooglePhotos] = useState(false);
  const [cancelWarningMode, setCancelWarningMode] = useState(null);
  const [showImportAllWarning, setShowImportAllWarning] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState(null);
  const [formValues, setFormValues] = useState(function() { return { title: '' }; });
  const [suggestions, setSuggestions] = useState({});
  const [autoAppliedKeys, setAutoAppliedKeys] = useState([]);
  const [acceptedImportCount, setAcceptedImportCount] = useState(0);
  const [mergeBaselineTune, setMergeBaselineTune] = useState(null);
  formValuesRef.current = formValues;

  const activeJob = useMemo(function() {
    if (!session || !activeCandidate) return null;
    return (session.enrichmentJobs || []).find(function(job) {
      return job.candidateId === activeCandidate.id;
    }) || null;
  }, [session, activeCandidate]);

  const runningEnrichmentJob = useMemo(function() {
    if (!session || !Array.isArray(session.enrichmentJobs)) return null;
    return session.enrichmentJobs.find(function(job) {
      return job.status === 'running' || job.status === 'pending';
    }) || null;
  }, [session]);

  const enrichedImportedTune = useMemo(function() {
    if (!activeCandidate) return null;
    return mergeCandidateWithEnrichment(activeCandidate, activeJob);
  }, [activeCandidate, activeJob]);

  const importedTuneSource = useMemo(function() {
    return enrichedImportedTune || (activeCandidate && activeCandidate.tune) || {};
  }, [enrichedImportedTune, activeCandidate]);

  const tuneFormSyncSignal = useMemo(function() {
    return buildTuneFormSyncSignal(activeCandidate);
  }, [activeCandidate, enrichedImportedTune]);

  const mergeMode = mergeTargetId && tunes[mergeTargetId] ? 'merge' : 'create';

  const initializeFormState = useCallback(function(targetMergeId) {
    const imported = enrichedImportedTune || (activeCandidate && activeCandidate.tune) || {};
    const effectiveMergeId = targetMergeId != null ? targetMergeId : mergeTargetId;
    formDirtyRef.current = false;
    function applySessionForcedBook(formValues) {
      if (!session || isAddTunesChrome(session) || !session.forcedBook) return formValues;
      const nextBookList = applyForcedBookToBookList(formValues.bookList, session.forcedBook);
      if (nextBookList === formValues.bookList) return formValues;
      return Object.assign({}, formValues, { bookList: nextBookList });
    }
    const overrides = activeCandidate && activeCandidate.draftFormOverrides
      && typeof activeCandidate.draftFormOverrides === 'object'
      ? activeCandidate.draftFormOverrides
      : null;
    function applyDraftOverrides(formValues, suggestions) {
      if (!overrides || !Object.keys(overrides).length) {
        return { formValues: formValues, suggestions: suggestions };
      }
      const nextForm = Object.assign({}, formValues);
      Object.keys(overrides).forEach(function(key) {
        if (key === 'artists' || key === 'aliases') {
          const base = Array.isArray(formValues[key]) ? formValues[key].slice() : [];
          const add = Array.isArray(overrides[key]) ? overrides[key] : [];
          add.forEach(function(item) {
            const text = String(item || '').trim();
            if (!text) return;
            const lower = text.toLowerCase();
            if (!base.some(function(existing) { return String(existing || '').trim().toLowerCase() === lower; })) {
              base.push(text);
            }
          });
          nextForm[key] = base;
          return;
        }
        if (key === 'links') {
          const base = Array.isArray(formValues.links) ? formValues.links.slice() : [];
          const add = Array.isArray(overrides.links) ? overrides.links : [];
          nextForm.links = base.concat(add);
          return;
        }
        nextForm[key] = overrides[key];
      });
      const nextSuggestions = Object.assign({}, suggestions || {});
      Object.keys(overrides).forEach(function(key) {
        delete nextSuggestions[key];
      });
      return { formValues: nextForm, suggestions: nextSuggestions };
    }
    function applyInlineFormSnapshot(baseFormValues, baseSuggestions) {
      const pending = activeCandidate && activeCandidate.pendingInlineSuggestions;
      const snapshot = activeCandidate && activeCandidate.inlineFormValues;
      const formBase = snapshot && typeof snapshot === 'object'
        ? Object.assign({}, snapshot)
        : baseFormValues;
      const suggestionBase = pending && typeof pending === 'object' ? pending : baseSuggestions;
      const withChoices = applyCoalescedFieldChoicesToSuggestions(
        suggestionBase,
        activeCandidate && activeCandidate.fieldChoices,
        formBase
      );
      return applyDraftOverrides(formBase, withChoices);
    }
    if (effectiveMergeId && tunes[effectiveMergeId]) {
      const candidateMergeMode = activeCandidate && activeCandidate.mergeMode === 'suggestOnly'
        ? 'suggestOnly'
        : 'direct';
      const built = buildReviewFormState(tunes[effectiveMergeId], imported, 'merge', {
        mergeMode: candidateMergeMode,
      });
      const withChoices = applyCoalescedFieldChoicesToSuggestions(
        built.suggestions,
        activeCandidate && activeCandidate.fieldChoices,
        built.formValues
      );
      const applied = applyDraftOverrides(built.formValues, withChoices);
      setFormValues(applySessionForcedBook(applied.formValues));
      setSuggestions(applied.suggestions);
      setAutoAppliedKeys(Array.isArray(built.autoAppliedKeys) ? built.autoAppliedKeys.slice() : []);
      setAcceptedImportCount(0);
      try {
        setMergeBaselineTune(JSON.parse(JSON.stringify(tunes[effectiveMergeId])));
      } catch (e) {
        setMergeBaselineTune(Object.assign({}, tunes[effectiveMergeId]));
      }
      return;
    }
    const built = buildReviewFormState(null, imported, 'create');
    // Inline ABC/chordsheet apply stores conflict suggestions on the candidate;
    // create-mode rebuild would otherwise drop them.
    const pending = activeCandidate && activeCandidate.pendingInlineSuggestions;
    const baseSuggestions = pending && typeof pending === 'object' ? pending : built.suggestions;
    const applied = activeCandidate && activeCandidate.inlineFormValues
      ? applyInlineFormSnapshot(built.formValues, baseSuggestions)
      : (function() {
        const withChoices = applyCoalescedFieldChoicesToSuggestions(
          baseSuggestions,
          activeCandidate && activeCandidate.fieldChoices,
          built.formValues
        );
        return applyDraftOverrides(built.formValues, withChoices);
      })();
    if (formSyncTimerRef.current) {
      clearTimeout(formSyncTimerRef.current);
      formSyncTimerRef.current = null;
    }
    suppressFormInitRef.current = !!(activeCandidate && activeCandidate.inlineFormValues);
    setFormValues(applySessionForcedBook(applied.formValues));
    setSuggestions(applied.suggestions);
    setAutoAppliedKeys(Array.isArray(built.autoAppliedKeys) ? built.autoAppliedKeys.slice() : []);
    setAcceptedImportCount(0);
    setMergeBaselineTune(null);
  }, [activeCandidate, enrichedImportedTune, mergeTargetId, tunes, session && session.forcedBook]);

  function patchFormValues(updater) {
    formDirtyRef.current = true;
    setFormValues(updater);
  }

  useEffect(function() {
    if (!activeCandidate) return;
    setMergeTargetId(activeCandidate.mergeTargetId || null);
  }, [activeCandidate && activeCandidate.id, session && session.index, session && session.mergeIndex]);

  useEffect(function() {
    if (!activeCandidate) return;
    const sessionAheadOfForm = sessionTuneAheadOfForm(activeCandidate, formValuesRef.current);
    if (suppressFormInitRef.current) {
      // Form→session sync sets this flag so we do not echo our own write. If the
      // session tune now has content the form lacks (e.g. ChordPro Add From import
      // that raced with sync), re-init anyway so the toast is not a no-op on the UI.
      suppressFormInitRef.current = false;
      if (!sessionAheadOfForm) return;
    }
    initializeFormState(activeCandidate.mergeTargetId || null);
    if (sessionAheadOfForm) {
      formDirtyRef.current = false;
    }
  }, [
    activeCandidate && activeCandidate.id,
    tuneFormSyncSignal,
    session && session.index,
    session && session.mergeIndex,
    enrichedImportedTune,
    initializeFormState,
  ]);

  useEffect(function() {
    if (!activeCandidate) return;
    if (mergeTargetId === (activeCandidate.mergeTargetId || null)) return;
    if (suppressFormInitRef.current) return;
    initializeFormState(mergeTargetId);
  }, [mergeTargetId, activeCandidate, initializeFormState]);

  function buildEditedTune(baseTune) {
    const next = formValuesToTune(formValues, baseTune || {});
    if (mergeTargetId && tunes[mergeTargetId]) {
      next.id = tunes[mergeTargetId].id;
    } else if (baseTune && baseTune.id) {
      next.id = baseTune.id;
    }
    return next;
  }

  function buildPersistedSession() {
    const candidate = activeCandidate;
    if (!candidate) return session;
    const persistedTune = buildEditedTune(candidate.tune || {});
    return updateCurrentCandidate(session, {
      tune: persistedTune,
      mergeTargetId: mergeTargetId,
    });
  }

  const syncFormToSession = useCallback(function() {
    if (!formDirtyRef.current) return;
    if (!activeCandidate || typeof props.onSessionChange !== 'function') return;
    const nextSession = buildPersistedSession();
    const prevTune = activeCandidate.tune || {};
    const nextTune = nextSession.candidates[nextSession.index]
      && nextSession.candidates[nextSession.index].tune
      ? nextSession.candidates[nextSession.index].tune
      : {};
    const sameMerge = (activeCandidate.mergeTargetId || null) === (mergeTargetId || null);
    let sameTune = true;
    try {
      sameTune = JSON.stringify(prevTune) === JSON.stringify(nextTune);
    } catch (e) {
      sameTune = false;
    }
    if (sameTune && sameMerge) return;
    suppressFormInitRef.current = true;
    props.onSessionChange(nextSession);
  }, [activeCandidate, mergeTargetId, formValues, session, props.onSessionChange, tunes]);

  const syncFormToSessionRef = useRef(syncFormToSession);
  syncFormToSessionRef.current = syncFormToSession;

  useEffect(function() {
    if (!show || !activeCandidate) return undefined;
    if (typeof props.onSessionChange !== 'function') return undefined;
    if (formSyncTimerRef.current) clearTimeout(formSyncTimerRef.current);
    formSyncTimerRef.current = setTimeout(function() {
      formSyncTimerRef.current = null;
      syncFormToSession();
    }, 250);
    return function() {
      if (formSyncTimerRef.current) clearTimeout(formSyncTimerRef.current);
    };
  }, [formValues, mergeTargetId, show, activeCandidate && activeCandidate.id, syncFormToSession, props.onSessionChange]);

  // Persist dirty form only when the modal closes / unmounts — not whenever
  // syncFormToSession's identity changes (that raced with YouTube pick and wiped links).
  useEffect(function() {
    if (!show) return undefined;
    return function() {
      if (formSyncTimerRef.current) {
        clearTimeout(formSyncTimerRef.current);
        formSyncTimerRef.current = null;
      }
      if (typeof syncFormToSessionRef.current === 'function') {
        syncFormToSessionRef.current();
      }
    };
  }, [show]);

  const editedTunePreview = useMemo(function() {
    return buildEditedTune(enrichedImportedTune || (activeCandidate && activeCandidate.tune) || {});
  }, [formValues, enrichedImportedTune, activeCandidate, mergeTargetId, tunes]);

  const matches = useMemo(function() {
    return findCollectionMatches({
      title: formValues.title,
      artist: formValues.artist,
      tunes: tunes,
      youtubeUrl: '',
      importTune: enrichedImportedTune || (activeCandidate && activeCandidate.tune) || null,
    }) || [];
  }, [formValues.title, formValues.artist, tunes, enrichedImportedTune, activeCandidate]);

  function buildDraftCandidate() {
    return {
      tune: buildEditedTune(enrichedImportedTune || (activeCandidate && activeCandidate.tune) || {}),
      mergeTargetId: mergeTargetId,
    };
  }

  function handleApplySuggestion(formKey, suggestion) {
    const source = suggestion && suggestion.source;
    patchFormValues(function(current) {
      let next = applyImportSuggestion(current, formKey, suggestion);
      // Keep notation and key decisions coupled.
      if ((formKey === 'notes' || formKey === 'voices') && suggestions && suggestions.keyName) {
        const keySuggestion = suggestions.keyName;
        const choices = Array.isArray(keySuggestion.choices) ? keySuggestion.choices : [];
        let keyChoice = null;
        if (source === 'current') {
          keyChoice = choices.find(function(c) {
            return c && (c.source === 'current' || c.id === 'current');
          });
        } else {
          keyChoice = choices.find(function(c) {
            return c && c.source !== 'current' && c.id !== 'current';
          }) || keySuggestion;
        }
        if (keyChoice) {
          next = applyImportSuggestion(next, 'keyName', Object.assign({}, keySuggestion, {
            value: keyChoice.value !== undefined ? keyChoice.value : keySuggestion.value,
            displayValue: keyChoice.preview != null ? keyChoice.preview : keySuggestion.displayValue,
            source: keyChoice.source || source,
          }));
        }
      }
      return next;
    });
    if (source !== 'current') {
      setAcceptedImportCount(function(count) { return count + 1; });
    }
    // Keep suggestion choices available for further selection until Import/Add.
  }

  function clearRecordingInterval() {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
  }

  function stopReviewRecording() {
    audioUtils.stopRecording();
  }

  function startReviewRecording() {
    if (audioUtils.isRecording || typeof props.onImportFile !== 'function') return;
    recordingStartedAtRef.current = Date.now();
    setRecordingDuration(0);
    recordingIntervalRef.current = setInterval(function() {
      setRecordingDuration(Math.floor((Date.now() - recordingStartedAtRef.current) / 1000));
    }, 1000);
    audioUtils.startRecording().then(function(blob) {
      clearRecordingInterval();
      setRecordingDuration(0);
      if (!blob || !blob.size) return;
      props.onImportFile(recordingBlobToFile(blob), buildDraftCandidate());
    });
  }

  useEffect(function() {
    return function() {
      clearRecordingInterval();
    };
  }, []);

  if (!session) return null;

  if (session.step === 'done') {
    const doneBody = <ReviewSummary summary={session.sessionSummary} />;
    if (props.embedded) {
      return (
        <div className="import-review-embedded border rounded p-3 mb-3 bg-light">
          {doneBody}
          <Button variant="success" onClick={function() {
            if (typeof props.onComplete === 'function') props.onComplete(session);
          }}>
            Done
          </Button>
        </div>
      );
    }
    return (
      <Modal show={!!props.show} onHide={props.onClose} centered>
        <Modal.Header closeButton>
          <Modal.Title>Import review complete</Modal.Title>
        </Modal.Header>
        <Modal.Body>{doneBody}</Modal.Body>
        <Modal.Footer>
          <Button variant="success" onClick={function() {
            if (typeof props.onComplete === 'function') props.onComplete(session);
          }}>
            Done
          </Button>
        </Modal.Footer>
      </Modal>
    );
  }

  if (!show) return null;

  function finishCurrentCandidate() {
    const base = buildPersistedSession();
    const candidate = activeCandidate;
    if (!candidate) return;

    let candidateTune = buildEditedTune(enrichedImportedTune || candidate.tune || {});
    if (mergeTargetId && tunes[mergeTargetId]) {
      candidateTune.id = tunes[mergeTargetId].id;
    }

    const addMode = isAddTunesChrome(session);
    if (addMode) {
      const title = String(candidateTune.name || '').trim();
      const composer = String(candidateTune.composer || '').trim();
      const books = Array.isArray(candidateTune.books) ? candidateTune.books : [];
      if (!title || !composer) {
        return;
      }
      if (!books.length && props.currentTuneBook) {
        candidateTune.books = [String(props.currentTuneBook).trim().toLowerCase()];
      }
      // Add always creates a new tune (matches open existing via Open),
      // unless local files/media were already attached under a provisional id.
      candidateTune = Object.assign({}, candidateTune);
      if (!addDraftHasLocalAttachments(candidateTune)) {
        delete candidateTune.id;
      }
    }

    const updated = updateCurrentCandidate(base, {
      tune: candidateTune,
      mergeTargetId: addMode ? null : mergeTargetId,
    });

    if (typeof props.onFinishCandidate === 'function') {
      props.onFinishCandidate(updated, function(savedTune) {
        if (addMode) {
          // Bridge clears session and navigates to the new tune single view.
          return;
        }
        const nextSession = markCandidateImported(updated);
        if (typeof props.onSessionChange === 'function') props.onSessionChange(nextSession);
        if (nextSession.step === 'done' && typeof props.onComplete === 'function') {
          props.onComplete(nextSession);
        }
      });
    }
  }

  function handleOpenCollectionMatch(tune) {
    if (!tune || !tune.id) return;
    // Discard the transient Add draft and open the existing tune.
    if (typeof props.onDiscardAddDraft === 'function') {
      props.onDiscardAddDraft();
    } else if (typeof props.onClose === 'function') {
      props.onClose();
    }
    if (typeof props.onOpenTune === 'function') props.onOpenTune(tune);
  }

  function finishAllQueuedCandidates() {
    if (typeof props.onImportAll !== 'function') return;
    const base = buildPersistedSession();
    setShowImportAllWarning(false);
    props.onImportAll(base, function() {
      const nextSession = markAllCandidatesImported(base);
      if (typeof props.onSessionChange === 'function') props.onSessionChange(nextSession);
      if (typeof props.onComplete === 'function') props.onComplete(nextSession);
    });
  }

  function jumpQueue(direction) {
    if (typeof props.onSessionChange !== 'function') return;
    const base = buildPersistedSession();
    props.onSessionChange(navigateReviewCandidate(base, direction));
  }

  function cancelCurrent() {
    if (typeof props.onSessionChange !== 'function') return;
    dismissCandidateFieldLookups(activeCandidate);
    const next = cancelCurrentCandidate(buildPersistedSession());
    props.onSessionChange(next);
    if (next.step === 'done' && typeof props.onComplete === 'function') {
      props.onComplete(next);
    }
  }

  function cancelWouldDiscardMedia() {
    const baseTune = mergeTargetId && tunes[mergeTargetId] ? tunes[mergeTargetId] : null;
    if (linksLostOnCancel(formValues.links, baseTune).length > 0) return true;
    if (Array.isArray(formValues.tuneFiles) && formValues.tuneFiles.length > 0) return true;
    if (pendingSnapshotsFromCandidate(activeCandidate).length > 0) return true;
    return false;
  }

  function handleCancelCurrentClick() {
    if (cancelWouldDiscardMedia()) {
      setCancelWarningMode('current');
      return;
    }
    cancelCurrent();
  }

  function confirmCancelWarning() {
    const mode = cancelWarningMode;
    setCancelWarningMode(null);
    if (mode === 'all') {
      const base = buildPersistedSession();
      (base.candidates || []).forEach(function(candidate) {
        dismissCandidateFieldLookups(candidate);
      });
      if (typeof props.onClose === 'function') props.onClose();
      return;
    }
    if (mode === 'current') cancelCurrent();
  }

  function selectMergeTarget(tuneId) {
    formDirtyRef.current = true;
    const nextMergeId = tuneId || null;
    setMergeTargetId(nextMergeId);
    if (typeof props.onSessionChange !== 'function') {
      initializeFormState(nextMergeId);
      return;
    }
    const base = updateCurrentCandidate(buildPersistedSession(), {
      mergeTargetId: nextMergeId,
    });
    if (!nextMergeId) {
      props.onSessionChange(base);
      return;
    }
    const result = coalesceSessionCandidatesByMergeTarget(
      base,
      nextMergeId,
      activeCandidate && activeCandidate.id
    );
    suppressFormInitRef.current = false;
    props.onSessionChange(result.session);
  }

  function handleEnhanceClick() {
    if (!activeCandidate || activeCandidate.skipEnrich) return;
    if (typeof props.onEnhanceAndAdvance !== 'function') return;
    if (isAddTunesChrome(session)) {
      if (!String(formValues.title || '').trim() || !String(formValues.artist || '').trim()) return;
    }
    props.onEnhanceAndAdvance(buildPersistedSession());
  }

  function handleCancelAdd() {
    dismissCandidateFieldLookups(activeCandidate);
    const next = removeAddDraftFromSession(buildPersistedSession());
    if (!next) {
      if (typeof props.onClose === 'function') props.onClose();
      return;
    }
    if (typeof props.onSessionChange === 'function') props.onSessionChange(next);
    if (typeof props.onContinueLater === 'function') {
      props.onContinueLater();
      return;
    }
    if (typeof props.onHide === 'function') props.onHide();
  }

  function applyYouTubeLinkToForm(link) {
    if (!link || !link.link) return;
    const mediaLink = {
      title: link.title || '',
      link: link.link,
      startAt: '',
      endAt: '',
    };
    if (link.image) mediaLink.image = link.image;
    if (formSyncTimerRef.current) {
      clearTimeout(formSyncTimerRef.current);
      formSyncTimerRef.current = null;
    }
    suppressFormInitRef.current = true;
    patchFormValues(function(current) {
      const existing = Array.isArray(current.links) ? current.links.slice() : [];
      const nextLinks = [mediaLink].concat(existing.filter(function(item) {
        return isOwnedMediaLink(item);
      }));
      const next = Object.assign({}, current, { links: nextLinks });
      if (!String(current.title || '').trim() && link.title) {
        next.title = String(link.title);
      }
      return next;
    });
  }

  const youtubeSearchQuery = [formValues.title, formValues.artist].filter(Boolean).join(' ');

  function requireGoogleLogin(action) {
    if (props.token && props.token.access_token) {
      if (typeof action === 'function') action();
      return;
    }
    if (typeof props.login === 'function') props.login();
  }

  const externalLinkIcon = (props.tunebook && props.tunebook.icons && props.tunebook.icons.externallink)
    || <span aria-hidden="true">↗</span>;

  const addTunesMode = isAddTunesChrome(session);
  const addPanelMode = addTunesMode && (session.addPanelMode === 'curated' || session.addPanelMode === 'bulk')
    ? session.addPanelMode
    : 'form';

  function syncSessionForcedBookFromForm(targetSession) {
    if (!targetSession || typeof props.onSessionChange !== 'function') return targetSession;
    const book = primaryBookFromBookList(formValues.bookList);
    if (!book) return targetSession;
    const nextBook = String(book).trim().toLowerCase();
    if (targetSession.forcedBook === nextBook) return targetSession;
    return Object.assign({}, targetSession, { forcedBook: nextBook });
  }

  function fillBulkImportLines(lines) {
    const text = Array.isArray(lines) ? lines.join('\n') : String(lines || '');
    if (!text.trim()) return;
    setBulkImportText(text);
    if (session) {
      const nextSession = syncSessionForcedBookFromForm(session);
      if (nextSession !== session) props.onSessionChange(nextSession);
    }
    setAddPanelMode('bulk');
  }

  function setAddPanelMode(mode) {
    if (!addTunesMode || !session || typeof props.onSessionChange !== 'function') return;
    const next = mode === 'curated' || mode === 'bulk' ? mode : 'form';
    let nextSession = Object.assign({}, session, { addPanelMode: next });
    if (next === 'bulk') nextSession = syncSessionForcedBookFromForm(nextSession);
    props.onSessionChange(nextSession);
  }

  function setSessionForcedBook(book) {
    const nextBook = book ? String(book).trim().toLowerCase() : '';
    if (!session || typeof props.onSessionChange !== 'function') return;
    props.onSessionChange(Object.assign({}, session, { forcedBook: nextBook }));
    patchFormValues(function(current) {
      const nextBookList = applyForcedBookToBookList(current.bookList, nextBook);
      if (nextBookList === current.bookList) return current;
      return Object.assign({}, current, { bookList: nextBookList });
    });
  }

  const forcedBookBar = !addTunesMode && props.tunebook ? (
    <div
      className="d-flex align-items-center gap-2 import-review-forced-book-bar"
      data-testid="import-review-forced-book-bar"
    >
      <span className="small text-muted mb-0 text-nowrap">Force book on all</span>
      <ButtonGroup>
        {session.forcedBook ? (
          <Button
            variant="outline-secondary"
            title="Clear forced book"
            onClick={function() { setSessionForcedBook(''); }}
          >
            {props.tunebook.icons && props.tunebook.icons.closecircle
              ? props.tunebook.icons.closecircle
              : '×'}
          </Button>
        ) : null}
        <BookSelectorModal
          forceRefresh={props.forceRefresh}
          title="Force book on all imports"
          tunebook={props.tunebook}
          value={session.forcedBook || ''}
          onChange={setSessionForcedBook}
          defaultOptions={props.tunebook.getTuneBookOptions}
          searchOptions={props.tunebook.getSearchTuneBookOptions}
          triggerElement={
            <Button variant="outline-secondary">
              {props.tunebook.icons && props.tunebook.icons.book ? props.tunebook.icons.book : null}{' '}
              {session.forcedBook ? <b>{session.forcedBook}</b> : 'Select book'}
            </Button>
          }
        />
      </ButtonGroup>
    </div>
  ) : null;

  function selectFormPanelMode() {
    if (!addTunesMode || addPanelMode === 'form') return;
    if (typeof props.onSessionChange === 'function' && session) {
      props.onSessionChange(Object.assign({}, session, { addPanelMode: 'form' }));
    }
  }

  const bulkForcedBook = session && session.forcedBook
    ? session.forcedBook
    : primaryBookFromBookList(formValues.bookList).toLowerCase();

  const addFromToolbar = (
    <div className="add-from-strip">
      <div className="add-from-strip-row">
        <Button variant="outline-secondary" disabled tabIndex={-1} size="sm" style={{ opacity: 1, color: 'inherit' }}>
          Add From
        </Button>
        {addTunesMode ? (
          <ButtonGroup size="sm" data-testid="add-panel-mode-group">
            <Button
              variant={addPanelMode === 'form' ? 'primary' : 'outline-primary'}
              data-testid="add-from-form"
              onClick={function() { setAddPanelMode('form'); }}
            >
              Add Form
            </Button>
            <Button
              variant={addPanelMode === 'curated' ? 'primary' : 'outline-primary'}
              data-testid="add-from-curated"
              onClick={function() { setAddPanelMode('curated'); }}
            >
              Curated Collections
            </Button>
            <Button
              variant={addPanelMode === 'bulk' ? 'primary' : 'outline-primary'}
              data-testid="add-from-bulk"
              onClick={function() { setAddPanelMode('bulk'); }}
            >
              Bulk Import
            </Button>
          </ButtonGroup>
        ) : null}
        {addTunesMode ? <span className="add-from-strip-spacer" aria-hidden="true" /> : null}
        <ButtonGroup size="sm">
          <Button
            variant="outline-primary"
            onClick={function() {
              selectFormPanelMode();
              if (fileInputRef.current) fileInputRef.current.click();
            }}
          >
            File
          </Button>
          <Button
            variant="outline-primary"
            onClick={function() {
              selectFormPanelMode();
              if (folderInputRef.current) folderInputRef.current.click();
            }}
            title="Import every PDF or image in a folder (composer name can be taken from the folder name)"
          >
            Folder
          </Button>
          <PasteImportModal
            onImportText={function(text) {
              selectFormPanelMode();
              if (typeof props.onImportText === 'function') props.onImportText(text, buildDraftCandidate());
            }}
            onImportFiles={function(files) {
              selectFormPanelMode();
              if (typeof props.onImportFiles === 'function') props.onImportFiles(files, buildDraftCandidate());
            }}
          />
          <ImportUrlModal
            label="URL"
            tunebook={props.tunebook}
            abcjsParser={abcjsParser}
            driveApi={driveApi}
            accessToken={props.token && props.token.access_token}
            resolverAvailable={resolverAvailable}
            onImportSource={function(source) {
              selectFormPanelMode();
              if (typeof props.onImportSource === 'function') props.onImportSource(source, buildDraftCandidate());
            }}
          />
        </ButtonGroup>
        <ButtonGroup size="sm">
          {audioUtils.isRecording ? (
            <>
              <Button variant="danger" onClick={stopReviewRecording}>Stop</Button>
              <Button variant="outline-danger" disabled aria-label="Recording duration">{recordingDuration + 1}s</Button>
            </>
          ) : (
            <Button
              variant="outline-primary"
              onClick={function() {
                selectFormPanelMode();
                startReviewRecording();
              }}
            >
              Record
            </Button>
          )}
          <Button
            variant="outline-primary"
            onClick={function() {
              if (!resolverAvailable) return;
              selectFormPanelMode();
              setShowSheetCamera(true);
            }}
            disabled={!resolverChecked || !resolverAvailable}
            title={!resolverAvailable ? 'Camera needs the media resolver' : 'Capture sheet image'}
          >
            Camera
          </Button>
        </ButtonGroup>
        <ButtonGroup size="sm">
          <Button
            variant="outline-primary"
            onClick={function() {
              requireGoogleLogin(function() {
                selectFormPanelMode();
                setShowSheetGooglePhotos(true);
              });
            }}
            title="Import photos or videos from Google Photos"
          >
            Google Photos
          </Button>
          <DriveFilePickerModal
            label="Drive"
            title="Import from Google Drive"
            token={props.token}
            driveApi={driveApi}
            login={props.login}
            requestGoogleScopes={props.requestGoogleScopes}
            onImportSource={function(source) {
              selectFormPanelMode();
              if (typeof props.onImportSource === 'function') props.onImportSource(source, buildDraftCandidate());
            }}
          />
          <YouTubeSearchModal
            tunebook={props.tunebook}
            token={props.token}
            login={props.login}
            value={youtubeSearchQuery}
            onChange={function(link) {
              selectFormPanelMode();
              applyYouTubeLinkToForm(link);
            }}
            setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
            triggerElement={<>YouTube</>}
          />
        </ButtonGroup>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={addFromFileAcceptList(!!props.resolverAvailable)}
        style={{ display: 'none' }}
        onChange={function(event) {
          const selected = event.target.files ? Array.from(event.target.files) : [];
          event.target.value = '';
          if (!selected.length) return;
          if (selected.length > 1 && typeof props.onImportFiles === 'function') {
            props.onImportFiles(selected, buildDraftCandidate());
            return;
          }
          if (typeof props.onImportFile === 'function') {
            props.onImportFile(selected[0], buildDraftCandidate());
          }
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        webkitdirectory=""
        directory=""
        accept={addFromFileAcceptList(!!props.resolverAvailable)}
        style={{ display: 'none' }}
        onChange={function(event) {
          const selected = event.target.files ? Array.from(event.target.files).filter(function(file) {
            const name = String(file && file.name || '').toLowerCase();
            const type = String(file && file.type || '').toLowerCase();
            return type === 'application/pdf' || /\.(pdf|png|jpe?g|webp|gif)$/i.test(name);
          }) : [];
          event.target.value = '';
          if (!selected.length) return;
          if (typeof props.onImportFiles === 'function') {
            props.onImportFiles(selected, buildDraftCandidate());
          }
        }}
      />
    </div>
  );

  const pendingSuggestionKeys = Object.keys(suggestions || {}).filter(function(key) {
    return importSuggestionDiffersFromForm(key, suggestions[key], formValues);
  });
  const mergeFieldCounts = summarizeImportMergeFieldCounts(
    autoAppliedKeys,
    suggestions,
    formValues,
    acceptedImportCount
  );
  const fieldLookupKinds = fieldLookupKindsForCandidate(activeCandidate);
  const fieldLookupKind = fieldLookupKinds[0] || null;
  const compareOriginalTune = mergeBaselineTune || (mergeTargetId && tunes[mergeTargetId]) || null;
  const compareImportTune = importedTuneSource || null;
  const alignedLyrics = mergeTargetId && compareOriginalTune
    ? alignedLyricPreviewPairs(compareOriginalTune, compareImportTune || { words: String(formValues.lyrics || '').split(/\r?\n/) }, 3)
    : { original: [], imported: [] };

  function applyFieldLookupResult(kind, result, _job, meta) {
    if (meta && meta.keepCurrent) return
    if (!result) return
    if (kind === 'composer' && result && result.artist) {
      patchFormValues(function(current) {
        return Object.assign({}, current, { artist: result.artist });
      });
      return;
    }
    if (kind === 'lyrics') {
      const text = result && (result.text || (Array.isArray(result.lines) ? result.lines.join('\n') : ''));
      if (!text) return;
      patchFormValues(function(current) {
        return Object.assign({}, current, { lyrics: text });
      });
      return;
    }
    if ((kind === 'notation' || kind === 'chords') && props.tunebook && props.tunebook.abcTools) {
      const abc = String(
        (result && result.abc)
        || (result && result.chordProSource)
        || (result && result.chordText)
        || ''
      ).trim();
      if (!abc) return;
      const imported = props.tunebook.abcTools.abc2json(
        kind === 'notation' ? normalizeAbcForImport(abc) : abc
      );
      if (!imported && kind === 'notation') return;
      patchFormValues(function(current) {
        if (imported) {
          return Object.assign({}, current, {
            voices: imported.voices || current.voices,
            notes: Array.isArray(imported.notes) ? imported.notes.join('\n') : (current.notes || ''),
          });
        }
        return Object.assign({}, current, { notes: abc });
      });
      return;
    }
    if (kind === 'genre' && result && result.genre) {
      patchFormValues(function(current) {
        const genres = Array.isArray(current.genres) ? current.genres.slice() : [];
        return Object.assign({}, current, {
          genres: mergeBibliographicList(genres, [result.genre]),
        });
      });
      return;
    }
    if (kind === 'artists' && result && result.artist) {
      patchFormValues(function(current) {
        const artists = Array.isArray(current.artists) ? current.artists.slice() : [];
        if (artists.indexOf(result.artist) < 0) artists.push(result.artist);
        return Object.assign({}, current, { artists: artists });
      });
      return;
    }
    if (kind === 'aliases' && result && result.alias) {
      patchFormValues(function(current) {
        const aliases = Array.isArray(current.aliases) ? current.aliases.slice() : [];
        if (aliases.indexOf(result.alias) < 0) aliases.push(result.alias);
        return Object.assign({}, current, { aliases: aliases });
      });
      return;
    }
    if (kind === 'links' && result && result.link) {
      const linkObj = {
        link: String(result.link).trim(),
        title: String(result.title || '').trim(),
      };
      if (result.image) linkObj.image = result.image;
      patchFormValues(function(current) {
        const existing = Array.isArray(current.links) ? current.links.slice() : [];
        const emptyIdx = existing.findIndex(function(link) {
          return !link || !link.link || !String(link.link).trim();
        });
        if (emptyIdx >= 0) {
          existing[emptyIdx] = Object.assign({}, existing[emptyIdx] || {}, linkObj);
        } else if (existing.length === 0) {
          existing.push(linkObj);
        } else {
          existing[0] = Object.assign({}, existing[0] || {}, linkObj);
        }
        return Object.assign({}, current, { links: existing });
      });
    }
  }

  function renderFieldLookupReviewButtons() {
    if (!fieldLookupKinds.length) return null;
    return fieldLookupKinds.map(function(kind) {
      return (
        <FieldLookupReviewButton
          key={kind}
          tuneId={mergeTargetId}
          candidateId={activeCandidate && activeCandidate.id}
          kind={kind}
          fallbackTitle={formValues.title || ''}
          onApply={function(result, job, meta) { applyFieldLookupResult(kind, result, job, meta); }}
        />
      );
    });
  }

  function handleResetAddForm() {
    dismissCandidateFieldLookups(activeCandidate);
    const blank = createBlankAddCandidate({
      book: props.currentTuneBook || '',
      candidateId: activeCandidate && activeCandidate.id
        ? activeCandidate.id
        : undefined,
    });
    const nextForm = tuneToFormValues(blank.tune);
    formDirtyRef.current = false;
    suppressFormInitRef.current = true;
    setMergeTargetId(null);
    setSuggestions({});
    setFormValues(nextForm);
    if (typeof props.onSessionChange === 'function' && session) {
      const candidates = session.candidates.slice();
      const index = session.mergeIndex != null ? session.mergeIndex : session.index;
      if (candidates[index]) {
        candidates[index] = blank;
        props.onSessionChange(Object.assign({}, session, { candidates: candidates }));
      }
    }
  }

  const showEnhance = !session.skipEnrichment && activeCandidate && !activeCandidate.skipEnrich;

  const statusBanner = (
    <div className="border rounded p-2">
      <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap">
        <strong>
          {mergeTargetId && tunes[mergeTargetId]
            ? ('Merging into ' + (tunes[mergeTargetId].name || 'Untitled'))
            : ('Adding ' + (String(formValues.title || '').trim() || 'Untitled'))}
        </strong>
        {isAddTunesChrome(session) ? (
          <div className="ms-auto d-flex align-items-center gap-2">
            <Button
              variant="outline-secondary"
              size="sm"
              data-testid="add-tunes-reset"
              onClick={handleResetAddForm}
            >
              Reset
            </Button>
          </div>
        ) : null}
      </div>
      {mergeTargetId && compareOriginalTune ? (
        <table className="table table-sm table-bordered mt-2 mb-0 import-review-compare-table" data-testid="import-merge-compare">
          <thead>
            <tr>
              <th scope="col" style={{ width: '5.5rem' }}></th>
              <th scope="col">Original</th>
              <th scope="col">Import</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Title</th>
              <td>{compareOriginalTune.name || '—'}</td>
              <td>{(compareImportTune && compareImportTune.name) || '—'}</td>
            </tr>
            <tr>
              <th scope="row">Composer</th>
              <td>{compareOriginalTune.composer || '—'}</td>
              <td>{(compareImportTune && compareImportTune.composer) || '—'}</td>
            </tr>
            <tr>
              <th scope="row">Lyrics</th>
              <td>
                {alignedLyrics.original.map(function(line, index) {
                  return <div key={'o-' + index} className="small">{line}</div>;
                })}
                {alignedLyrics.original.length === 0 ? '—' : null}
              </td>
              <td>
                {alignedLyrics.imported.map(function(line, index) {
                  return <div key={'i-' + index} className="small">{line}</div>;
                })}
                {alignedLyrics.imported.length === 0 ? '—' : null}
              </td>
            </tr>
            {notationPreviewLine(compareOriginalTune) || (suggestions && suggestions.notes) ? (
              <tr>
                <th scope="row">Notation</th>
                <td>
                  <div className="small text-break">
                    {notationPreviewLine(compareOriginalTune) || '—'}
                  </div>
                </td>
                <td>
                  <div className="small text-break">
                    {notationPreviewLine(compareImportTune) || '—'}
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      ) : null}
      {fieldLookupKinds.length ? (
        <div className="text-muted small mt-1">
          Search result{fieldLookupKinds.length > 1 ? 's' : ''} for {fieldLookupKinds.map(function(kind) {
            return MERGE_FIELD_LABELS[
              kind === 'composer' ? 'artist'
                : kind === 'notation' ? 'notes'
                  : kind
            ] || kind;
          }).join(', ')}
          {' — choose a source below or accept the suggested merge.'}
        </div>
      ) : null}
      {pendingSuggestionKeys.length > 0 ? (
        <div className="mt-2">
          <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
            <Button
              size="sm"
              variant="outline-success"
              data-testid="accept-all-import-fields"
              onClick={function() {
                const pendingBefore = pendingSuggestionKeys.length;
                const next = acceptAllImportSuggestions(formValues, suggestions);
                formDirtyRef.current = true;
                setFormValues(next.formValues);
                setSuggestions(next.suggestions);
                setAcceptedImportCount(function(count) { return count + pendingBefore; });
              }}
            >
              Accept all imported fields
            </Button>
            <Button
              size="sm"
              variant="outline-secondary"
              data-testid="keep-all-local-fields"
              onClick={function() {
                const next = keepAllLocalImportSuggestions(formValues, suggestions);
                formDirtyRef.current = true;
                setFormValues(next.formValues);
                setSuggestions(next.suggestions);
              }}
            >
              Keep all local
            </Button>
          </div>
          <details className="text-muted small mb-2">
            <summary>
              {mergeFieldCounts.autoMerged} field{mergeFieldCounts.autoMerged === 1 ? '' : 's'} auto merged
              {' and '}
              {mergeFieldCounts.pending} field{mergeFieldCounts.pending === 1 ? '' : 's'} pending merge choice
              {' — use Accept all or Use import beside each field'}
            </summary>
            <div className="mt-1">
              {pendingSuggestionKeys.map(function(key) {
                return MERGE_FIELD_LABELS[key] || key;
              }).join(', ')}
            </div>
          </details>
          {fieldLookupKinds.length ? (
            <div className="d-flex flex-wrap gap-2 align-items-center">
              {renderFieldLookupReviewButtons()}
            </div>
          ) : null}
        </div>
      ) : mergeFieldCounts.autoMerged > 0 ? (
        <div className="mt-2 text-muted small" data-testid="import-merge-field-summary">
          {mergeFieldCounts.autoMerged} field{mergeFieldCounts.autoMerged === 1 ? '' : 's'} auto merged
          {' and '}
          {mergeFieldCounts.pending} field{mergeFieldCounts.pending === 1 ? '' : 's'} pending merge choice
        </div>
      ) : fieldLookupKinds.length ? (
        <div className="mt-2 d-flex flex-wrap gap-2 align-items-center">
          {renderFieldLookupReviewButtons()}
        </div>
      ) : null}
      {activeJob && activeJob.status === 'running' ? (
        <div className="text-muted small mt-1">Enhancing in background… {activeJob.message || ''}</div>
      ) : null}
    </div>
  );

  function renderMergeChoicesPanel() {
    const isContentDuplicate = !!(activeCandidate && activeCandidate.contentHashDuplicate)
      || (activeCandidate && activeCandidate.warningReason === 'contentHashDuplicate');
    const isLocalNewer = activeCandidate && activeCandidate.warningReason === 'localNewer';
    const createSelected = !mergeTargetId;
    return (
      <div role="region" aria-label="Merge choices" tabIndex={-1} className="collection-match-panel">
        <h6>Collection match</h6>
        {isLocalNewer ? (
          <Alert variant="warning" className="py-2">
            Your local copy is newer than this import. Imported values appear as suggestions only.
          </Alert>
        ) : null}
        {isContentDuplicate ? (
          <Alert variant="info" className="py-2">
            This import matches existing content (same hash). Review carefully before creating a duplicate.
          </Alert>
        ) : null}
        <p className="text-muted small">Choose an existing tune to merge into, or create a new tune.</p>
        <ListGroup className="mb-3 collection-match-list" variant="flush">
          <ListGroup.Item
            action
            active={createSelected}
            className={'collection-match-choice' + (createSelected ? ' collection-match-choice--selected' : '')}
            tabIndex={0}
            aria-pressed={createSelected}
            onClick={function() { selectMergeTarget(null); }}
          >
            <strong>Create new tune</strong>
            <div className="text-muted small mt-1">Save this import as a new collection entry.</div>
          </ListGroup.Item>
          {matches.map(function(entry) {
            const tune = entry.tune;
            const selected = mergeTargetId === tune.id;
            return (
              <ListGroup.Item
                key={tune.id}
                action
                active={selected}
                className={'collection-match-choice' + (selected ? ' collection-match-choice--selected' : '')}
                tabIndex={0}
                aria-pressed={selected}
                onClick={function() { selectMergeTarget(tune.id); }}
              >
                <Button
                  size="sm"
                  variant="link"
                  className="collection-match-open-btn"
                  aria-label={'Open tune ' + (tune.name || 'Untitled')}
                  title="Open tune"
                  onClick={function(event) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (typeof props.onOpenTune === 'function') props.onOpenTune(tune);
                  }}
                >
                  {externalLinkIcon}
                </Button>
                <strong>{tune.name || 'Untitled'}</strong>
                {tune.composer ? <div className="text-muted small">{tune.composer}</div> : null}
                {entry.confidence ? <Badge bg="info" className="mt-1">{entry.confidence}</Badge> : null}
              </ListGroup.Item>
            );
          })}
        </ListGroup>
        {matches.length === 0 ? (
          <Alert variant="secondary" className="mb-2">
            No close title/artist matches found in your collection.
          </Alert>
        ) : null}
        {isContentDuplicate ? (
          <Alert variant="warning" className="mb-0">
            Content hash matches an existing tune. Prefer merging into that tune if it appears above, or create a new tune only if this is intentional.
          </Alert>
        ) : null}
      </div>
    );
  }

  const sheetSnapshotSummary = !addTunesMode && session
    ? summarizeSheetSnapshotCandidates(session.candidates || [])
    : null;
  const sheetSnapshotBannerMessage = sheetSnapshotSummary
    ? sheetSnapshotReviewMessage(sheetSnapshotSummary)
    : '';
  const activeSheetSnapshotHint = activeCandidate
    ? activeSheetSnapshotTitleHint(activeCandidate)
    : '';

  const panelBody = !addTunesMode ? (
    <Row style={{ flexWrap: 'nowrap' }}>
      <div style={{ flex: '1 1 auto', minWidth: 0, overflowY: 'auto', paddingRight: '1rem' }}>
        {sheetSnapshotBannerMessage ? (
          <Alert variant="warning" className="py-2" data-testid="sheet-snapshot-import-banner">
            {sheetSnapshotBannerMessage}
          </Alert>
        ) : null}
        {activeSheetSnapshotHint ? (
          <Alert variant="info" className="py-2" data-testid="sheet-snapshot-title-hint">
            {activeSheetSnapshotHint}
          </Alert>
        ) : null}
        <TuneRecordForm
          values={formValues}
          onChange={function(patch) {
            patchFormValues(function(current) {
              const nextPatch = typeof patch === 'function' ? patch(current) : patch;
              return Object.assign({}, current, nextPatch);
            });
          }}
          suggestions={suggestions}
          onApplySuggestion={handleApplySuggestion}
          mergeMode={mergeMode}
          importedNotationText={importedNotationText(importedTuneSource)}
          previewTune={editedTunePreview}
          candidateId={activeCandidate && activeCandidate.id}
          tunebook={props.tunebook}
          token={props.token}
          user={props.user}
          forceRefresh={props.forceRefresh}
          resolverAvailable={props.resolverAvailable}
          setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
          showComposerSearch={true}
          composerCandidates={activeJob && activeJob.composerCandidates}
          tunes={tunes}
          statusBanner={statusBanner}
          pendingSnapshots={pendingSnapshotsFromCandidate(activeCandidate)}
          forcedBook={!addTunesMode && session.forcedBook ? session.forcedBook : ''}
        />
      </div>
      <div style={{ flex: '0 0 280px', maxWidth: '280px', overflowY: 'auto' }}>
        {renderMergeChoicesPanel()}
        {activeCandidate && activeCandidate.sourceKind && (
          <div className="text-muted small mt-2">
            Source: {activeCandidate.sourceKind}
            {activeCandidate.sheetSnapshotMeta && activeCandidate.sheetSnapshotMeta.titleSource === 'ocr'
              ? <Badge bg="success" className="ms-2">Title from sheet</Badge>
              : null}
            {activeCandidate.sheetSnapshotMeta && activeCandidate.sheetSnapshotMeta.titleSource === 'cloud-ocr'
              ? <Badge bg="success" className="ms-2">Title from sheet OCR</Badge>
              : null}
            {activeCandidate.sheetSnapshotMeta && activeCandidate.sheetSnapshotMeta.titleSource === 'pdf-text'
              ? <Badge bg="success" className="ms-2">Title from PDF text</Badge>
              : null}
            {activeCandidate.sheetSnapshotMeta && activeCandidate.sheetSnapshotMeta.titleSource === 'filename'
              ? <Badge bg="warning" text="dark" className="ms-2">Title from filename</Badge>
              : null}
          </div>
        )}
        <MidiImportDiagnostics
          candidate={activeCandidate}
          onReimport={props.onMidiReimport}
        />
        {activeJob && activeJob.status === 'done' && activeJob.enrichedTune && (
          <Alert variant="success" className="mt-2">Enhanced data ready — review suggestions above.</Alert>
        )}
      </div>
    </Row>
  ) : addPanelMode === 'curated' ? (
    <AddCuratedCollectionsPanel
      tunebook={props.tunebook}
      setCurrentTuneBook={props.setCurrentTuneBook}
      currentTuneBook={props.currentTuneBook}
      forceRefresh={props.forceRefresh}
    />
  ) : addPanelMode === 'bulk' ? (
    <AddBulkImportPanel
      tunebook={props.tunebook}
      tunes={tunes}
      token={props.token}
      login={props.login}
      logout={props.logout}
      requestGoogleScopes={props.requestGoogleScopes}
      forceRefresh={props.forceRefresh}
      currentTuneBook={props.currentTuneBook}
      forcedBook={bulkForcedBook}
      searchIndex={props.searchIndex}
      loadTuneTexts={props.loadTuneTexts}
      onStartedReview={props.onBulkImportStarted}
    />
  ) : (
    <AddTuneSimpleForm
      values={formValues}
      onChange={function(patch) {
        patchFormValues(function(current) {
          const nextPatch = typeof patch === 'function' ? patch(current) : patch;
          return Object.assign({}, current, nextPatch);
        });
      }}
      tunes={tunes}
      tunebook={props.tunebook}
      token={props.token}
      tuneId={activeCandidate && activeCandidate.tune && activeCandidate.tune.id}
      forceRefresh={props.forceRefresh}
      setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
      onOpenMatch={handleOpenCollectionMatch}
      candidateId={activeCandidate && activeCandidate.id}
      resolverAvailable={props.resolverAvailable}
      login={props.login}
      onPickYouTube={function(link) {
        applyYouTubeLinkToForm(link);
      }}
      onFillBulkDiscography={fillBulkImportLines}
    />
  );

  const canMoveQueue = !addTunesMode
    && session
    && Array.isArray(session.candidates)
    && session.candidates.length > 1;
  const importRequestCount = session && Array.isArray(session.candidates) ? session.candidates.length : 0;
  const headerTitle = !addTunesMode
    ? 'Import review'
    : addPanelMode === 'curated'
      ? 'Curated Collections'
      : addPanelMode === 'bulk'
        ? 'Bulk import'
        : 'Add';
  const primaryActionLabel = addTunesMode ? 'Add' : 'Import';
  const addTuneTitle = String(formValues.title || '').trim();
  const addTuneComposer = String(formValues.artist || '').trim();
  const canAddTune = !!(addTuneTitle && addTuneComposer);
  const addTuneRequirementHint = addTunesMode && addPanelMode === 'form'
    ? addTuneRequirementMessage(formValues.title, formValues.artist)
    : '';
  const primaryActionDisabled = addTunesMode && addPanelMode === 'form' ? !canAddTune : false;
  const pendingMergeFields = mergeFieldLabelsFromSuggestions(suggestions, formValues);
  const baseTuneForCancel = mergeTargetId && tunes[mergeTargetId] ? tunes[mergeTargetId] : null;
  const pendingMediaLinks = linksLostOnCancel(formValues.links, baseTuneForCancel).map(describeLinkForCancelWarning);
  const pendingSnapshotLabels = pendingSnapshotsFromCandidate(activeCandidate).map(describeSnapshotForCancel);
  const cancelMediaLinks = pendingMediaLinks.concat(pendingSnapshotLabels);
  const importAllSummary = buildImportAllSummary(buildPersistedSession(), tunes);
  const cancelWarningModal = (
    <ImportReviewCancelWarningModal
      mode={cancelWarningMode}
      importCount={importRequestCount}
      mergeFields={pendingMergeFields}
      mediaLinks={cancelMediaLinks}
      tuneTitle={formValues.title || (activeCandidate && activeCandidate.tune && activeCandidate.tune.name)}
      onHide={function() { setCancelWarningMode(null); }}
      onConfirm={confirmCancelWarning}
    />
  );
  const importAllWarningModal = (
    <ImportReviewImportAllWarningModal
      show={showImportAllWarning}
      summary={importAllSummary}
      onHide={function() { setShowImportAllWarning(false); }}
      onConfirm={finishAllQueuedCandidates}
    />
  );
  const headerActions = (
    <div
      className={'d-flex align-items-center gap-2 flex-wrap justify-content-end' + (addTunesMode ? ' add-tunes-header-actions' : '')}
      style={{ marginLeft: 'auto' }}
    >
      {forcedBookBar}
      {canMoveQueue ? (
        <>
          <Button variant="outline-secondary" onClick={function() { jumpQueue(-1); }}>Prev</Button>
          <Button variant="outline-secondary" onClick={function() { jumpQueue(1); }}>Next</Button>
        </>
      ) : null}
      {!addTunesMode && typeof props.onContinueLater === 'function' ? (
        <Button variant="outline-secondary" onClick={function() {
          props.onContinueLater();
        }}>
          Continue later
        </Button>
      ) : null}
      {!addTunesMode ? (
        <>
          {importRequestCount > 1 ? (
            <Button variant="outline-danger" onClick={function() { setCancelWarningMode('all'); }}>Cancel all</Button>
          ) : null}
          <Button variant="secondary" onClick={handleCancelCurrentClick}>Cancel</Button>
        </>
      ) : null}
      {showEnhance && !addTunesMode ? (
        <Button
          variant="warning"
          onClick={handleEnhanceClick}
          disabled={runningEnrichmentJob && runningEnrichmentJob.status === 'running'}
          title={
            (runningEnrichmentJob && runningEnrichmentJob.message)
              || (activeJob && activeJob.message)
              || undefined
          }
          data-testid="import-review-enhance"
        >
          {runningEnrichmentJob && runningEnrichmentJob.message
            ? runningEnrichmentJob.message
            : (activeJob && activeJob.status === 'running' && activeJob.message
              ? activeJob.message
              : 'Enhance')}
        </Button>
      ) : null}
      {addTunesMode ? (
        <>
          {addPanelMode === 'form' ? (
            <>
              {addTuneRequirementHint ? (
                <span
                  className="add-tunes-requirement-hint text-warning small"
                  data-testid="add-tune-requirement-hint"
                  role="status"
                >
                  {addTuneRequirementHint}
                </span>
              ) : null}
              <Button
                size="lg"
                variant={primaryActionDisabled ? 'secondary' : 'success'}
                disabled={!!primaryActionDisabled}
                title={addTuneRequirementHint || undefined}
                data-testid="add-tune-save"
                className="add-tunes-header-add-btn"
                onClick={finishCurrentCandidate}
              >
                Add
              </Button>
            </>
          ) : null}
        </>
      ) : (
        <Button
          variant={primaryActionDisabled ? 'secondary' : 'success'}
          disabled={!!primaryActionDisabled}
          onClick={finishCurrentCandidate}
        >
          {primaryActionLabel}
        </Button>
      )}
      {typeof props.onImportAll === 'function' && importAllSummary.total > 1 && !addTunesMode ? (
        <Button variant="danger" onClick={function() { setShowImportAllWarning(true); }}>
          Import all
        </Button>
      ) : null}
      {isReviewComplete(session) ? (
        <Button variant="success" onClick={function() {
          if (typeof props.onComplete === 'function') props.onComplete(session);
        }}>
          Done
        </Button>
      ) : null}
    </div>
  );

  if (props.embedded) {
    return (
      <div className="import-review-embedded border rounded p-3 mb-3 bg-light">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
          <h5 className="mb-0">
            {headerTitle}
            {!addTunesMode ? (
              <span className="text-muted" style={{ fontSize: '0.85em', marginLeft: '0.75em' }}>
                {sessionProgressLabel(session)}
              </span>
            ) : null}
          </h5>
          {headerActions}
        </div>
        {addTunesMode ? (
          <div className="mb-3 add-from-strip add-from-strip--separated">{addFromToolbar}</div>
        ) : null}
        {panelBody}
        {cancelWarningModal}
        {importAllWarningModal}
      </div>
    );
  }

  return (
    <Modal
      show={show}
      onHide={function() {
        if (addTunesMode) {
          // Transient Add draft: discard on close.
          if (typeof props.onDiscardAddDraft === 'function') {
            props.onDiscardAddDraft();
            return;
          }
          if (typeof props.onClose === 'function') {
            props.onClose();
            return;
          }
        }
        if (typeof props.onContinueLater === 'function') {
          props.onContinueLater();
          return;
        }
        if (typeof props.onHide === 'function') {
          props.onHide();
          return;
        }
        if (!addTunesMode) setCancelWarningMode('all');
      }}
      fullscreen
      backdrop="static"
      className="import-review-modal"
      dialogClassName="import-review-modal-dialog"
      contentClassName="import-review-modal-content"
    >
      <Modal.Header closeButton className="add-tunes-modal-header import-review-modal-header">
        <div className="add-tunes-panel-header">
          <div className="add-tunes-panel-header-top">
            <Modal.Title>
              {headerTitle}
              {!addTunesMode ? (
                <span className="text-muted" style={{ fontSize: '0.85em', marginLeft: '0.75em' }}>
                  {sessionProgressLabel(session)}
                </span>
              ) : null}
            </Modal.Title>
            {headerActions}
          </div>
          {addTunesMode ? addFromToolbar : null}
        </div>
      </Modal.Header>
      <Modal.Body className="import-review-modal-body">{panelBody}</Modal.Body>
      {cancelWarningModal}
      {importAllWarningModal}
      <SheetImageCameraModal
        show={showSheetCamera}
        onHide={function() { setShowSheetCamera(false); }}
        onCapture={function(file) {
          setShowSheetCamera(false);
          if (typeof props.onImportFile === 'function') props.onImportFile(file, buildDraftCandidate());
        }}
      />
      <SheetImageGooglePhotosModal
        show={showSheetGooglePhotos}
        onHide={function() { setShowSheetGooglePhotos(false); }}
        token={props.token}
        requestGoogleScopes={props.requestGoogleScopes}
        onLogin={props.login}
        allowVideos={true}
        convertVideosToAudio={true}
        maxItemCount={20}
        onSelectFile={function(file) {
          setShowSheetGooglePhotos(false);
          if (typeof props.onImportFile === 'function') props.onImportFile(file, buildDraftCandidate());
        }}
        onImportFiles={function(files) {
          setShowSheetGooglePhotos(false);
          if (typeof props.onImportFiles === 'function') {
            props.onImportFiles(files, buildDraftCandidate());
          }
        }}
      />
    </Modal>
  );
}
