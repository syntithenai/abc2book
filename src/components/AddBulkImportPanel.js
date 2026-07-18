/**
 * Bulk title-list import tools for Add chrome.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Form, ProgressBar } from 'react-bootstrap';
import { toast } from 'react-toastify';
import DriveFilePickerModal from './DriveFilePickerModal';
import BulkYouTubePlaylistModal from './BulkYouTubePlaylistModal';
import AudioDriveUploadModal from './AudioDriveUploadModal';
import { bulkFileAcceptList } from '../importSourceParse';
import { driveListTextToBulkLines, normalizeBulkTextLocally } from '../bulkListFormat';
import { formatBulkImportLinesViaResolver } from '../bulkListFormatClient';
import { prepareBulkTextIntoTextarea } from '../bulkTextPrepareFill';
import { readAudioFileMetadata } from '../audioFileMetadata';
import { createAttachedAudioLink } from '../linkRecording';
import { buildImportContext, dispatchAddImport } from '../addImportDispatch';
import { processReviewResult } from '../addSongModalHelper';
import { setPendingAbcImportBatch } from '../abcImportBatchStore';
import {
  assessBulkTextSufficiency,
  bulkImportDisabledReason,
  insufficientBulkLineDetails,
} from '../bulkLineSufficiency';
import {
  requestImportReview,
  showImportReviewUi,
  getImportReviewSession,
  setImportReviewSession,
} from '../importReviewSessionStore';
import { asImportReviewChrome } from '../importReviewSession';
import useAbcjsParser from '../useAbcjsParser';
import useMediaResolverHealth from '../useMediaResolverHealth';
import useGoogleDocument from '../useGoogleDocument';

const BULK_TEXT_STORAGE_KEY = 'addSongModal_bulkText';
const DEFAULT_BOOK = 'songs';

export default function AddBulkImportPanel(props) {
  const abcjsParser = useAbcjsParser();
  const { available: resolverAvailable } = useMediaResolverHealth();
  const driveApi = useGoogleDocument(props.token, props.login || function() {}, props.forceRefresh);
  const bulkFileInputRef = useRef(null);

  const [bulkText, setBulkText] = useState(function() {
    try {
      return sessionStorage.getItem(BULK_TEXT_STORAGE_KEY) || '';
    } catch (e) {
      return '';
    }
  });
  const [bulkBusy, setBulkBusy] = useState(false);
  const [audioImportBusy, setAudioImportBusy] = useState(false);
  const [importError, setImportError] = useState('');
  const [pendingBulkAudioFiles, setPendingBulkAudioFiles] = useState([]);
  const [showAudioDriveUploadModal, setShowAudioDriveUploadModal] = useState(false);

  const book = props.currentTuneBook || DEFAULT_BOOK;

  const importContext = buildImportContext({
    resolverAvailable: resolverAvailable,
    token: props.token,
    driveApi: driveApi,
    tunebook: props.tunebook,
    abcjsParser: abcjsParser,
    book: book,
    tunes: props.tunes || {},
    stayOnForm: false,
    bulkMode: true,
  });

  const sufficiency = useMemo(function() {
    return assessBulkTextSufficiency(bulkText);
  }, [bulkText]);
  const importDisabledReason = bulkImportDisabledReason(sufficiency);
  const insufficientDetails = useMemo(function() {
    return insufficientBulkLineDetails(sufficiency);
  }, [sufficiency]);
  const importEnabled = sufficiency.sufficient && !audioImportBusy;

  useEffect(function() {
    try {
      if (bulkText) sessionStorage.setItem(BULK_TEXT_STORAGE_KEY, bulkText);
      else sessionStorage.removeItem(BULK_TEXT_STORAGE_KEY);
    } catch (e) {}
  }, [bulkText]);

  function appendBulkLines(lines) {
    const next = Array.isArray(lines) ? lines.join('\n') : String(lines || '');
    if (!next.trim()) return;
    setBulkText(function(prev) {
      if (!prev.trim()) return next;
      return prev.replace(/\s+$/, '') + '\n' + next;
    });
  }

  const startImportReview = useCallback(function(candidates, options) {
    if (!Array.isArray(candidates) || candidates.length === 0) return;
    setImportError('');
    setAudioImportBusy(false);
    requestImportReview(candidates, options || { entryMode: 'import' });
    const current = getImportReviewSession();
    if (current && current.entryMode === 'add') {
      setImportReviewSession(asImportReviewChrome(current));
    }
    showImportReviewUi();
    if (typeof props.onStartedReview === 'function') props.onStartedReview();
  }, [props]);

  async function normalizeBulkText(text) {
    if (resolverAvailable && props.token && props.token.access_token) {
      try {
        return await formatBulkImportLinesViaResolver(text, props.token.access_token);
      } catch (e) {
        // fall through
      }
    }
    return normalizeBulkTextLocally(text);
  }

  /**
   * Combined Search + Prepare: clean up lines, then fill YouTube links and
   * title/artist from YouTube sources when possible.
   */
  async function handleBulkPrepare() {
    if (!bulkText.trim()) return;
    setBulkBusy(true);
    setImportError('');
    try {
      const normalized = await normalizeBulkText(bulkText);
      const result = await prepareBulkTextIntoTextarea(normalized, {
        tunebook: props.tunebook,
        book: book,
        searchYouTube: true,
      });
      setBulkText(result.text);
      const parts = [];
      if (result.filled > 0) {
        parts.push(result.filled === 1 ? '1 YouTube link' : (result.filled + ' YouTube links'));
      }
      if (result.enriched > 0) {
        parts.push(result.enriched === 1
          ? '1 title/artist from YouTube'
          : (result.enriched + ' titles/artists from YouTube'));
      }
      if (parts.length) {
        toast.success('Prepared: filled ' + parts.join(', '));
      } else if (normalized !== bulkText) {
        toast.info('Cleaned up lines');
      } else {
        toast.info('No YouTube matches to fill — add artist or a link on incomplete lines');
      }
    } catch (e) {
      setImportError(e && e.message ? e.message : 'Prepare failed.');
    } finally {
      setBulkBusy(false);
    }
  }

  async function applyBulkImportResult(result) {
    if (!result || result.action === 'error') {
      setImportError(result && result.message ? result.message : 'Import failed.');
      return false;
    }
    if (result.action === 'batch' && result.batchSummary) {
      setPendingAbcImportBatch(result.batchSummary);
      if (typeof props.onStartedReview === 'function') props.onStartedReview();
      return false;
    }
    if (result.action === 'review') {
      processReviewResult(
        result,
        Object.assign({}, importContext, { stayOnForm: false, bulkMode: true }),
        function() {},
        startImportReview,
        toast
      );
      showImportReviewUi();
      if (typeof props.onStartedReview === 'function') props.onStartedReview();
      return false;
    }
    if (result.action === 'audio' || result.action === 'video') {
      setPendingBulkAudioFiles(result.files || []);
      setShowAudioDriveUploadModal(true);
      return true;
    }
    if (result.action === 'bulkAppend') {
      appendBulkLines(result.text);
      return false;
    }
    return false;
  }

  async function handleBulkImport() {
    if (!importEnabled) return;
    setAudioImportBusy(true);
    setImportError('');
    try {
      const filled = await prepareBulkTextIntoTextarea(bulkText, {
        tunebook: props.tunebook,
        book: book,
        searchYouTube: true,
      });
      if (filled.text !== bulkText) setBulkText(filled.text);
      if (filled.prepared && filled.prepared.length) {
        startImportReview(filled.prepared);
        if (filled.filled > 0 || filled.enriched > 0) {
          toast.success('Opened review with YouTube details filled where possible');
        }
        return;
      }
      const result = await dispatchAddImport(bulkText, Object.assign({}, importContext, { bulkMode: true }));
      const keepBusy = await applyBulkImportResult(result);
      if (!keepBusy) setAudioImportBusy(false);
    } catch (e) {
      setImportError(e && e.message ? e.message : 'Import failed.');
      setAudioImportBusy(false);
    }
  }

  async function continueBulkAudioImport(files, uploadToDriveFlags) {
    setShowAudioDriveUploadModal(false);
    setPendingBulkAudioFiles([]);
    const candidates = [];
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const metadata = await readAudioFileMetadata(file);
      const title = metadata.title || file.name;
      const artist = metadata.artist || '';
      const tuneBase = {
        id: 'tune-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
        name: title,
        composer: artist,
        links: [],
        books: book ? [book] : [],
      };
      const attached = await createAttachedAudioLink({
        tune: tuneBase,
        file: file,
        title: title,
        uploadToDrive: !!(uploadToDriveFlags && uploadToDriveFlags[i]),
        token: props.token,
        driveApi: driveApi,
      });
      candidates.push({
        tune: Object.assign({}, tuneBase, {
          links: [attached.link],
          mediaCacheLocked: true,
        }),
        sourceKind: 'bulk-audio',
        skipEnrich: true,
        mergeMode: 'suggestOnly',
      });
    }
    startImportReview(candidates);
    setAudioImportBusy(false);
  }

  async function handleBulkFileSelected(event) {
    const files = Array.prototype.slice.call((event.target.files && event.target.files) || []);
    event.target.value = '';
    if (!files.length) return;
    setAudioImportBusy(true);
    setImportError('');
    let releaseBusy = true;
    try {
      let appendText = '';
      const audioFiles = [];
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const result = await dispatchAddImport(file, Object.assign({}, importContext, {
          bulkMode: true,
          bulkTextAppendOnly: true,
        }));
        if (result && result.action === 'bulkAppend' && result.text) {
          appendText = appendText ? (appendText + '\n' + result.text) : result.text;
        } else if (result && (result.action === 'audio' || result.action === 'video')) {
          audioFiles.push.apply(audioFiles, result.files || [file]);
        } else if (result && result.action === 'review') {
          await applyBulkImportResult(result);
          releaseBusy = false;
          return;
        } else if (result && result.action === 'error') {
          setImportError(result.message || 'Could not import those files.');
        }
      }
      if (appendText) appendBulkLines(appendText);
      if (audioFiles.length > 0) {
        setPendingBulkAudioFiles(audioFiles);
        setShowAudioDriveUploadModal(true);
        releaseBusy = true;
        return;
      }
    } catch (e) {
      setImportError(e.message || 'Could not import those files.');
    } finally {
      if (releaseBusy) setAudioImportBusy(false);
    }
  }

  return (
    <div className="add-bulk-import-panel" data-testid="add-bulk-panel">
      <h5 className="mb-1">Bulk import</h5>
      <p className="text-muted small">
        Paste or build a list of tunes to import one at a time through the review queue.
        Each line: Title, Title by Artist, or Title | url.
      </p>
      {importError ? <Alert variant="danger">{importError}</Alert> : null}
      <div
        className="d-flex flex-wrap gap-2 align-items-center justify-content-between"
        data-testid="bulk-toolbar"
      >
        <div className="d-flex flex-wrap gap-2 align-items-center" data-testid="bulk-sources">
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch' }}>
            <Button
              variant="outline-primary"
              disabled={audioImportBusy}
              onClick={function() { bulkFileInputRef.current && bulkFileInputRef.current.click(); }}
            >
              {audioImportBusy ? 'Processing files...' : 'File'}
            </Button>
            {audioImportBusy ? (
              <ProgressBar
                animated
                striped
                now={100}
                style={{ marginTop: '0.35em', height: '0.45em', minWidth: '10em', width: '100%' }}
              />
            ) : null}
          </div>
          <DriveFilePickerModal
            label="Drive"
            title="Load list from Google Drive"
            token={props.token}
            driveApi={driveApi}
            login={props.login}
            requestGoogleScopes={props.requestGoogleScopes}
            mimeTypes={[
              'text/plain',
              'text/csv',
              'application/vnd.google-apps.document',
              'application/vnd.google-apps.spreadsheet',
            ]}
            onFileText={function(text) { appendBulkLines(driveListTextToBulkLines(text)); }}
          />
          <BulkYouTubePlaylistModal onLines={appendBulkLines} disabled={audioImportBusy} />
        </div>
        <div className="d-flex flex-wrap gap-2 align-items-center ms-auto" data-testid="bulk-actions">
          <Button
            variant="outline-success"
            disabled={bulkBusy || audioImportBusy || !bulkText.trim()}
            onClick={handleBulkPrepare}
            title="Clean up lines and fill missing YouTube links / title / artist"
            data-testid="bulk-prepare"
          >
            {bulkBusy ? 'Preparing…' : 'Prepare'}
          </Button>
          <Button
            variant="success"
            disabled={!importEnabled}
            onClick={handleBulkImport}
            data-testid="bulk-import"
          >
            Import
          </Button>
        </div>
      </div>
      {!importEnabled && bulkText.trim() ? (
        <div className="text-warning small mt-2 mb-0" data-testid="bulk-import-warning">
          <div>{importDisabledReason || 'Add artist or a YouTube link on each line, or run Prepare.'}</div>
          {insufficientDetails.length > 0 ? (
            <ul className="mb-0 mt-1 ps-3" data-testid="bulk-import-missing-lines">
              {insufficientDetails.map(function(detail) {
                return <li key={detail}>{detail}</li>;
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
      <p className="text-muted small mt-2 mb-0">
        Prepare cleans up lines and fills high-confidence YouTube links plus missing title/artist from YouTube.
        Import opens review when every line has a title and an artist or link.
      </p>
      <Form.Control
        as="textarea"
        rows={18}
        className="mt-3"
        value={bulkText}
        onChange={function(e) { setBulkText(e.target.value); }}
        placeholder={'Whiskey in the Jar\nThe Wild Rover by The Dubliners | https://www.youtube.com/watch?v=...'}
        style={{ fontFamily: 'monospace', fontSize: '1.05em' }}
      />
      <input
        ref={bulkFileInputRef}
        type="file"
        accept={bulkFileAcceptList()}
        multiple
        style={{ display: 'none' }}
        onChange={handleBulkFileSelected}
      />
      <AudioDriveUploadModal
        show={showAudioDriveUploadModal}
        files={pendingBulkAudioFiles}
        loggedIn={!!(props.token && props.token.access_token)}
        onConfirm={function(uploadToDriveFlags) {
          continueBulkAudioImport(pendingBulkAudioFiles, uploadToDriveFlags);
        }}
        onCancel={function() {
          setPendingBulkAudioFiles([]);
          setShowAudioDriveUploadModal(false);
          setAudioImportBusy(false);
        }}
      />
    </div>
  );
}
