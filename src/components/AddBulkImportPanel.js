/**
 * Bulk title-list import tools for Add chrome.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Form, ProgressBar, Spinner } from 'react-bootstrap';
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
  filterImportableBulkText,
  focusBulkTextareaLine,
} from '../bulkLineSufficiency';
import { retidyBulkText } from '../bulkTextTidy';
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
import {
  getBulkImportText,
  setBulkImportText,
} from '../addBulkImportTextStore';
import { materializeBulkImportCandidates } from '../bulkImportMaterialize';
import {
  getBulkImportEnhanceEnabled,
  setBulkImportEnhanceEnabled,
} from '../bulkImportEnhanceSettings';
import { classifyImportOutcome } from '../importIntakePolicy';

const DEFAULT_BOOK = 'songs';

function BulkImportStatEntryList(props) {
  const entries = Array.isArray(props.entries) ? props.entries : [];
  if (!entries.length) return null;
  return entries.map(function(entry, index) {
    return (
      <span key={entry.lineIndex + '-' + index}>
        {index > 0 ? ', ' : null}
        <button
          type="button"
          className="btn btn-link btn-sm p-0 align-baseline bulk-import-stat-link"
          onClick={function() {
            if (typeof props.onSelectLine === 'function') props.onSelectLine(entry.lineIndex);
          }}
          title={'Go to line ' + entry.lineNumber}
        >
          {entry.label}
        </button>
      </span>
    );
  });
}

export default function AddBulkImportPanel(props) {
  const abcjsParser = useAbcjsParser();
  const { available: resolverAvailable } = useMediaResolverHealth();
  const driveApi = useGoogleDocument(props.token, props.logout || function() {}, props.forceRefresh);
  const bulkFileInputRef = useRef(null);
  const bulkTextareaRef = useRef(null);

  const [bulkText, setBulkText] = useState(function() {
    return getBulkImportText();
  });
  const [bulkBusy, setBulkBusy] = useState(false);
  const [audioImportBusy, setAudioImportBusy] = useState(false);
  const [importError, setImportError] = useState('');
  const [pendingBulkAudioFiles, setPendingBulkAudioFiles] = useState([]);
  const [showAudioDriveUploadModal, setShowAudioDriveUploadModal] = useState(false);
  const [enhanceEnabled, setEnhanceEnabled] = useState(getBulkImportEnhanceEnabled);
  const [prepareProgress, setPrepareProgress] = useState('');
  const [prepareProgressDetail, setPrepareProgressDetail] = useState(null);

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
  const importEnabled = sufficiency.importableCount > 0 && !audioImportBusy;

  useEffect(function() {
    setBulkImportText(bulkText);
  }, [bulkText]);

  const focusBulkTextLine = useCallback(function(lineIndex) {
    focusBulkTextareaLine(bulkTextareaRef.current, bulkText, lineIndex);
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
    if (!Array.isArray(candidates) || candidates.length === 0) return
    setImportError('')
    setAudioImportBusy(false)
    const opts = options || {}
    const forcedBook = props.forcedBook ? String(props.forcedBook).trim().toLowerCase() : ''
    requestImportReview(candidates, Object.assign({}, opts.entryMode ? opts : { entryMode: 'import' }, {
      forcedBook: forcedBook,
      background: !!opts.background,
      skipDuplicateSplit: !!opts.skipDuplicateSplit,
      startEnrichment: !!opts.startEnrichment,
    }))
    const current = getImportReviewSession()
    if (current) {
      let next = current.entryMode === 'add' ? asImportReviewChrome(current) : current
      if (forcedBook && !next.forcedBook) {
        next = Object.assign({}, next, { forcedBook: forcedBook })
      }
      if (next !== current) setImportReviewSession(next)
    }
    if (!opts.background) {
      showImportReviewUi()
      if (typeof props.onStartedReview === 'function') props.onStartedReview()
    }
  }, [props])

  function importPreparedCandidates(candidates) {
    const list = Array.isArray(candidates) ? candidates : []
    if (!list.length) return
    const startEnhance = !!(enhanceEnabled && resolverAvailable)
    const saveBook = (props.forcedBook ? String(props.forcedBook).trim().toLowerCase() : '') || book
    const result = materializeBulkImportCandidates(list, {
      tunebook: props.tunebook,
      book: saveBook,
      enhance: startEnhance,
    })
    if (!result.savedTunes.length) {
      setImportError('Import failed.')
      return
    }
    if (typeof props.forceRefresh === 'function') props.forceRefresh()
    if (typeof props.onStartedReview === 'function') {
      props.onStartedReview({
        firstTuneId: result.firstTuneId,
        savedCount: result.savedTunes.length,
        enhance: startEnhance,
      })
    }
    if (startEnhance) {
      startImportReview(result.mergeCandidates, {
        background: true,
        skipDuplicateSplit: true,
        startEnrichment: true,
      })
    }
  }

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
    setPrepareProgress('');
    setPrepareProgressDetail(null);
    try {
      setPrepareProgress('Cleaning up lines…');
      const tidied = retidyBulkText(bulkText);
      setPrepareProgress('Normalizing lines…');
      const normalized = await normalizeBulkText(tidied);
      const result = await prepareBulkTextIntoTextarea(normalized, {
        tunebook: props.tunebook,
        book: book,
        searchYouTube: true,
        onProgress: function(info) {
          const message = info && info.message ? info.message : '';
          setPrepareProgress(message);
          setPrepareProgressDetail(info || null);
        },
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
      } else if (normalized !== tidied || tidied !== bulkText) {
        toast.info('Cleaned up lines');
      } else {
        toast.info('No YouTube matches to fill — add artist or a link on incomplete lines');
      }
    } catch (e) {
      setImportError(e && e.message ? e.message : 'Prepare failed.');
    } finally {
      setBulkBusy(false);
      setPrepareProgress('');
      setPrepareProgressDetail(null);
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
        function(candidates, reviewOptions) {
          startImportReview(candidates, Object.assign({}, reviewOptions || {}, { background: true }))
        },
        toast
      )
      return false
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
    if (!importEnabled) return
    setImportError('')
    setAudioImportBusy(true)
    try {
      const tidied = retidyBulkText(bulkText);
      const filtered = filterImportableBulkText(tidied);
      if (filtered.text !== bulkText) setBulkText(filtered.text);
      if (filtered.skipped > 0) {
        toast.info('Skipped ' + filtered.skipped + ' unimportable line' + (filtered.skipped === 1 ? '' : 's'));
      }
      const filled = await prepareBulkTextIntoTextarea(filtered.text, {
        tunebook: props.tunebook,
        book: book,
        searchYouTube: true,
      });
      if (filled.text !== filtered.text) setBulkText(filled.text);
      if (filled.prepared && filled.prepared.length) {
        importPreparedCandidates(filled.prepared)
        setAudioImportBusy(false)
        return
      }
      const result = await dispatchAddImport(filtered.text, Object.assign({}, importContext, { bulkMode: true }))
      if (result && result.action === 'review') {
        const classified = classifyImportOutcome(result.candidates || [], importContext)
        importPreparedCandidates(classified.candidates || [])
        setAudioImportBusy(false)
        return
      }
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
    if (typeof props.onStartedReview === 'function') props.onStartedReview()
    startImportReview(candidates, { background: true })
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
        className="d-flex flex-wrap gap-2 align-items-stretch"
        data-testid="bulk-toolbar"
      >
        <div className="add-bulk-toolbar-block" data-testid="bulk-sources">
          <span className="small text-muted d-block mb-1">Select</span>
          <div className="d-flex flex-wrap gap-2 align-items-center">
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
        </div>
        <div className="add-bulk-toolbar-block" data-testid="bulk-prepare-block">
          <span className="small text-muted d-block mb-1">Prepare</span>
          <Button
            variant="outline-success"
            disabled={bulkBusy || audioImportBusy || !bulkText.trim()}
            onClick={handleBulkPrepare}
            title={bulkBusy && prepareProgress ? prepareProgress : 'Clean up lines and fill missing YouTube links / title / artist'}
            data-testid="bulk-prepare"
          >
            {bulkBusy ? (
              <>
                <Spinner animation="border" size="sm" className="me-1" aria-hidden="true" />
                Preparing…
              </>
            ) : 'Prepare'}
          </Button>
          {bulkBusy && prepareProgress ? (
            <div className="small text-muted mt-1 mb-0" data-testid="bulk-prepare-progress" role="status">
              {prepareProgress}
              {prepareProgressDetail && prepareProgressDetail.total > 0 ? (
                <ProgressBar
                  className="mt-1"
                  now={Math.round((prepareProgressDetail.index / prepareProgressDetail.total) * 100)}
                  label={prepareProgressDetail.index + '/' + prepareProgressDetail.total}
                  visuallyHidden
                  style={{ height: '0.45em' }}
                />
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="add-bulk-toolbar-block ms-auto" data-testid="bulk-actions">
          <span className="small text-muted d-block mb-1">Import</span>
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <Form.Check
              type="checkbox"
              id="bulk-import-enhance"
              data-testid="bulk-import-enhance"
              className="mb-0 text-nowrap"
              label="Enhance"
              title="After saving, look up chords, lyrics, notation, and metadata and return them as merge review suggestions"
              checked={enhanceEnabled}
              disabled={audioImportBusy || bulkBusy}
              onChange={function(e) {
                const next = !!e.target.checked;
                setEnhanceEnabled(next);
                setBulkImportEnhanceEnabled(next);
              }}
            />
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
      </div>
      {!importEnabled && bulkText.trim() ? (
        <div className="text-warning small mt-2 mb-0" data-testid="bulk-import-warning">
          <div>{importDisabledReason || 'Add a title and an artist or YouTube link on at least one line.'}</div>
        </div>
      ) : null}
      <p className="text-muted small mt-2 mb-0">
        Prepare tidies YouTube-style titles, fills links, and enriches missing title/artist from YouTube.
        Import saves importable lines (title plus artist or link) immediately and opens the first song; unimportable lines are skipped.
        With Enhance checked, chords, lyrics, notation, and MusicBrainz metadata are looked up in the background and return as merge review suggestions.
      </p>
      {sufficiency.rowCount > 0 ? (
        <div className="small mt-2 mb-0 text-muted" data-testid="bulk-import-stats">
          <div data-testid="bulk-import-stat-rows">
            {sufficiency.rowCount} row{sufficiency.rowCount === 1 ? '' : 's'}
          </div>
          {sufficiency.missingTitleCount > 0 ? (
            <div className="mt-1" data-testid="bulk-import-stat-missing-title">
              Missing title ({sufficiency.missingTitleCount}):{' '}
              <BulkImportStatEntryList
                entries={sufficiency.missingTitleEntries}
                onSelectLine={focusBulkTextLine}
              />
            </div>
          ) : null}
          {sufficiency.missingArtistCount > 0 ? (
            <div className="mt-1" data-testid="bulk-import-stat-missing-artist">
              Missing artist ({sufficiency.missingArtistCount}):{' '}
              <BulkImportStatEntryList
                entries={sufficiency.missingArtistEntries}
                onSelectLine={focusBulkTextLine}
              />
            </div>
          ) : null}
          {sufficiency.missingLinkCount > 0 ? (
            <div className="mt-1" data-testid="bulk-import-stat-missing-link">
              Missing link ({sufficiency.missingLinkCount}):{' '}
              <BulkImportStatEntryList
                entries={sufficiency.missingLinkEntries}
                onSelectLine={focusBulkTextLine}
              />
            </div>
          ) : null}
          {sufficiency.unimportableCount > 0 ? (
            <div className="mt-1 text-warning" data-testid="bulk-import-stat-unimportable">
              Unimportable ({sufficiency.unimportableCount}, skipped on import):{' '}
              <BulkImportStatEntryList
                entries={sufficiency.unimportableEntries}
                onSelectLine={focusBulkTextLine}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      <Form.Control
        ref={bulkTextareaRef}
        as="textarea"
        rows={18}
        wrap="off"
        className="mt-3"
        value={bulkText}
        onChange={function(e) { setBulkText(e.target.value); }}
        data-testid="bulk-import-textarea"
        placeholder={'Whiskey in the Jar\nThe Wild Rover by The Dubliners | https://www.youtube.com/watch?v=...'}
        style={{ fontFamily: 'monospace', fontSize: '1.05em', overflowX: 'auto', whiteSpace: 'pre' }}
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
