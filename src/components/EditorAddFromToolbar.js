/**
 * Narrow Add From strip for the info-editing form (single-record).
 * Multi-tune sources auto-redirect to import review with a toast.
 */
import { useCallback, useRef } from 'react';
import { Button, ButtonGroup } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { buildImportContext, dispatchAddImport } from '../addImportDispatch';
import { processReviewResult } from '../addSongModalHelper';
import { multiTuneRedirectToastMessage } from '../importIntakePolicy';
import { addFromFileAcceptList } from '../importSourceParse';
import {
  requestImportReview,
  showImportReviewUi,
} from '../importReviewSessionStore';
import { setPendingAbcImportBatch } from '../abcImportBatchStore';
import PasteImportModal from './PasteImportModal';
import ImportUrlModal from './ImportUrlModal';

export default function EditorAddFromToolbar(props) {
  const fileRef = useRef(null);
  const currentTuneId = props.currentTuneId || (props.tune && props.tune.id) || null;
  const resolverAvailable = props.resolverAvailable !== false;

  const runImport = useCallback(async function(input) {
    const importContext = buildImportContext({
      resolverAvailable: resolverAvailable,
      token: props.token,
      driveApi: props.driveApi,
      tunebook: props.tunebook,
      abcjsParser: props.abcjsParser,
      book: props.currentTuneBook,
      tunes: props.tunes || {},
      stayOnForm: true,
      maxCandidates: 1,
      entryPoint: 'editor',
      currentTuneId: currentTuneId,
    });

    const applyImportedTune = function(importedTune, candidate) {
      if (typeof props.onApplyImport === 'function') {
        props.onApplyImport(importedTune, candidate || null);
        return;
      }
      if (typeof props.onApplyTune === 'function') {
        props.onApplyTune(importedTune);
      }
    };

    const startImportReview = function(candidates) {
      requestImportReview(candidates || [], { entryMode: 'import' });
      showImportReviewUi();
    };

    let result;
    try {
      result = await dispatchAddImport(input, importContext);
    } catch (e) {
      toast.error(e && e.message ? e.message : 'Import failed.');
      return;
    }
    if (!result || result.action === 'error') {
      toast.error(result && result.message ? result.message : 'Import failed.');
      return;
    }
    if (result.action === 'audio' || result.action === 'video') {
      if (typeof props.onMediaFiles === 'function') {
        props.onMediaFiles(result.files || [], result.action);
        return;
      }
      toast.info(result.action === 'video'
        ? 'Open Add → Import Review to attach video files'
        : 'Open Add → Import Review to attach audio files');
      return;
    }
    if (result.action === 'batch' && result.batchSummary) {
      toast.info(multiTuneRedirectToastMessage(result.candidateCount));
      setPendingAbcImportBatch(result.batchSummary);
      return;
    }
    if (result.action === 'review') {
      processReviewResult(result, importContext, applyImportedTune, startImportReview, toast);
    }
  }, [
    resolverAvailable,
    props.token,
    props.driveApi,
    props.tunebook,
    props.abcjsParser,
    props.currentTuneBook,
    props.tunes,
    props.onApplyImport,
    props.onApplyTune,
    props.onMediaFiles,
    currentTuneId,
  ]);

  return (
    <div className="editor-add-from-toolbar add-from-strip mb-2" data-testid="editor-add-from-toolbar">
      <div className="add-from-strip-row">
        <Button variant="outline-secondary" disabled tabIndex={-1} size="sm" style={{ opacity: 1, color: 'inherit' }}>
          Add From
        </Button>
        <ButtonGroup size="sm">
          <Button
            variant="outline-primary"
            onClick={function() {
              if (fileRef.current) fileRef.current.click();
            }}
          >
            File
          </Button>
          <PasteImportModal
            onImportText={function(text) { runImport(text); }}
            onImportFiles={function(files) {
              if (files && files[0]) runImport(files[0]);
            }}
          />
          <ImportUrlModal
            label="URL"
            tunebook={props.tunebook}
            abcjsParser={props.abcjsParser}
            driveApi={props.driveApi}
            accessToken={props.token && props.token.access_token}
            resolverAvailable={resolverAvailable}
            onImportSource={function(source) { runImport(source); }}
          />
        </ButtonGroup>
      </div>
      <input
        ref={fileRef}
        type="file"
        hidden
        accept={addFromFileAcceptList(!!props.resolverAvailable)}
        onChange={function(event) {
          const file = event.target.files && event.target.files[0];
          event.target.value = '';
          if (file) runImport(file);
        }}
      />
    </div>
  );
}
