import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, ButtonGroup } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { analyzeMidiBytes } from '../midiAnalyzeClient';
import { pendingMidiFromBytes } from '../midiImportDetect';
import {
  createMidiImportSession,
  duplicateVoice,
  mergeVoices,
  updateVoice,
  updateSharedGrid,
  selectVoice,
  getSelectedVoice,
  defaultVoiceFilters,
  sessionAsDraft,
  audibleSmfTrackIndices,
  rawNotesForVoice,
  buildImportOptionsFromSession,
} from '../midiImportSession';
import { processSessionVoices } from '../midiImportVoicePipeline';
import {
  buildMidiImportAbcFromSession,
  buildLocalMidiImportResultFromSession,
} from '../midiImportPreview';
import { resolveImportAbcFromResponse } from '../midiImportAbcResolve';
import { abcTextToCandidates } from '../importSourceParse';
import useMidiFilePlayback from '../useMidiFilePlayback';
import MidiImportMultiPianoRoll from './MidiImportMultiPianoRoll';
import MidiImportMergeVoicesDialog from './MidiImportMergeVoicesDialog';
import MidiImportDuplicateDialog from './MidiImportDuplicateDialog';
import MidiImportVoicePicker from './MidiImportVoicePicker';
import MidiImportCompactFilters from './MidiImportCompactFilters';
import MidiImportHelpDialog from './MidiImportHelpDialog';
import { NotationPreview } from './SuggestionPreviewDialog';
import {
  peekMidiImportOptions,
  cancelMidiImportOpen,
  completeMidiImportOpen,
} from '../midiImportPendingStore';
import './MidiImportEditor.css';
import './MidiImportWizard.css';

const ZOOM_STEP = 1.5;

function midiArrayBuffer(bytes) {
  if (bytes instanceof ArrayBuffer) return bytes;
  if (bytes && bytes.buffer) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  return bytes;
}

function PlayPauseIcon(props) {
  return props.playing
    ? <span aria-hidden="true">&#9209;</span>
    : <span aria-hidden="true">&#9654;</span>;
}

export default function MidiImportEditor(props) {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playingAll, setPlayingAll] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [previewTab, setPreviewTab] = useState('piano');
  const [playbackTime, setPlaybackTime] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const fileInputRef = useRef(null);
  const returnPathRef = useRef('/tunes');
  const progressRef = useRef(null);
  const rollRef = useRef(null);
  const icons = props.tunebook && props.tunebook.icons;

  const audibleTrackIds = useMemo(function() {
    if (!session) return null;
    if (playingAll) return audibleSmfTrackIndices(session, null);
    return null;
  }, [session, playingAll]);

  const playback = useMidiFilePlayback({
    audibleTrackIds: audibleTrackIds,
    onTimeUpdate: function(t) { setPlaybackTime(t); },
    onEnded: function() { setPlayingAll(false); },
    onError: function(e) {
      toast.error((e && e.message) || 'Playback failed');
      setPlayingAll(false);
    },
  });

  const initFromPending = useCallback(async function(pendingOpts) {
    setLoading(true);
    setError('');
    try {
      let pending = pendingOpts.pendingMidi;
      if (!pending && pendingOpts.file) {
        pending = {
          file: pendingOpts.file,
          fileName: pendingOpts.file.name || 'import.mid',
          sourceUrl: pendingOpts.sourceUrl || '',
        };
      }
      if (!pending && pendingOpts.midiBytes) {
        pending = await pendingMidiFromBytes(
          pendingOpts.midiBytes,
          pendingOpts.fileName,
          pendingOpts.sourceUrl
        );
      }
      // Pending shapes vary: { file }, { bytes: File|Uint8Array }, or midiBytes above.
      let bytes = null;
      if (pending) {
        const raw = pending.bytes || pending.file;
        if (raw instanceof Uint8Array) {
          bytes = raw;
        } else if (raw && typeof raw.arrayBuffer === 'function') {
          bytes = new Uint8Array(await raw.arrayBuffer());
        } else if (raw) {
          bytes = new Uint8Array(raw);
        }
      }
      if (!bytes || !bytes.byteLength) throw new Error('No MIDI data');
      const fileName = (pending && pending.fileName)
        || (pendingOpts.file && pendingOpts.file.name)
        || pendingOpts.fileName
        || 'import.mid';
      const profile = await analyzeMidiBytes(bytes, fileName, pendingOpts.accessToken);
      if (profile.reject_reason) throw new Error(profile.reject_reason);
      const created = await createMidiImportSession({
        midiBytes: bytes,
        fileName: fileName,
        sourceUrl: (pending && pending.sourceUrl) || pendingOpts.sourceUrl || '',
        profile: profile,
        returnPath: pendingOpts.returnPath || '/tunes',
      });
      returnPathRef.current = created.returnPath || '/tunes';
      setSession(created);
      playback.init(midiArrayBuffer(bytes)).then(function() {
        setPlaybackDuration(playback.duration() || 0);
      }).catch(function() { /* ignore */ });
    } catch (e) {
      setError((e && e.message) || 'Failed to load MIDI');
    } finally {
      setLoading(false);
    }
  }, [playback]);

  useEffect(function() {
    // Peek (do not clear) so React StrictMode remount still sees the file.
    // Options are cleared on save/cancel via complete/cancelMidiImportOpen.
    const opts = peekMidiImportOptions();
    if (opts) {
      initFromPending(Object.assign({}, opts, { accessToken: props.accessToken }));
    } else if (props.initialSession) {
      setSession(props.initialSession);
      setLoading(false);
    } else {
      setError('No MIDI file to import. Choose a file from Import or open a .mid file.');
      setLoading(false);
    }
  }, []);

  const previewAbc = useMemo(function() {
    if (!session) return '';
    return buildMidiImportAbcFromSession(session);
  }, [session]);

  const processedVoices = useMemo(function() {
    if (!session) return [];
    return processSessionVoices(session);
  }, [session]);

  function noteCountFor(voice) {
    return session ? rawNotesForVoice(session, voice).length : 0;
  }

  function handleCancel() {
    cancelMidiImportOpen(new Error('MIDI import cancelled'));
    navigate(returnPathRef.current || '/tunes', { replace: true });
  }

  async function handleSave() {
    if (!session) return;
    setLoading(true);
    try {
      const result = buildLocalMidiImportResultFromSession(session);
      const draft = sessionAsDraft(session);
      let abc = result.abc;
      if (!abc) throw new Error('No notation produced');
      abc = resolveImportAbcFromResponse(result, session.fileName, {
        trackIds: draft.selectedTrackIds,
      }) || abc;
      const candidates = abcTextToCandidates(abc, props.tunebook, props.book).map(function(c) {
        c.sourceKind = 'midi';
        c.abc = abc;
        if (result.warnings && result.warnings.length) c.importWarnings = result.warnings.slice();
        c.midiImport = {
          strategy: result.strategy,
          mode: result.mode,
          confidence: result.confidence,
          diagnostics: result.diagnostics,
          profile: result.profile,
          wizardSettings: buildImportOptionsFromSession(session),
        };
        if (session.midiBytes) {
          c.pendingFile = {
            name: session.fileName || 'import.mid',
            type: 'audio/midi',
            blob: new Blob([session.midiBytes], { type: 'audio/midi' }),
            source: 'import',
          };
        }
        if (session.sourceUrl) c.sourceUrl = session.sourceUrl;
        return c;
      });
      const payload = { candidates: candidates, draft: draft, result: result };
      completeMidiImportOpen(payload);
      if (props.onComplete) props.onComplete(payload);
      navigate(returnPathRef.current || '/tunes', { replace: true });
    } catch (e) {
      toast.error((e && e.message) || 'Import failed');
    } finally {
      setLoading(false);
    }
  }

  function togglePlayAll() {
    if (playingAll) {
      playback.pause();
      setPlayingAll(false);
      return;
    }
    setPlayingAll(true);
    playback.start();
  }

  useEffect(function() {
    function onKeyDown(e) {
      if (e.code !== 'Space' && e.key !== ' ') return;
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) {
        return;
      }
      e.preventDefault();
      togglePlayAll();
    }
    window.addEventListener('keydown', onKeyDown);
    return function() { window.removeEventListener('keydown', onKeyDown); };
  });

  function seekFromProgress(clientX) {
    const el = progressRef.current;
    if (!el || !playbackDuration) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    playback.seek(ratio * playbackDuration);
    setPlaybackTime(ratio * playbackDuration);
  }

  function patchSession(next) {
    setSession(next);
  }

  function patchVoice(voiceId, patch) {
    if (!session) return;
    patchSession(updateVoice(session, voiceId, patch));
  }

  function patchSelectedVoiceFilters(patch) {
    if (!session) return;
    const voice = getSelectedVoice(session);
    if (!voice) return;
    patchSession(updateVoice(session, voice.id, {
      filters: Object.assign({}, voice.filters || defaultVoiceFilters(), patch),
    }));
  }

  function handleSelectVoice(voiceId) {
    if (!session) return;
    patchSession(selectVoice(session, voiceId));
  }

  async function handleFileReplace(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    await initFromPending({ file: file, accessToken: props.accessToken });
  }

  if (loading && !session) {
    return <div className="midi-import-page p-4">Loading MIDI…</div>;
  }

  if (error && !session) {
    return (
      <div className="midi-import-page p-4">
        <p className="text-danger">{error}</p>
        <Button variant="secondary" onClick={handleCancel}>Back</Button>
        <input ref={fileInputRef} type="file" accept=".mid,.midi,audio/midi" className="d-none"
          onChange={handleFileReplace} />
        <Button className="ms-2" onClick={function() { fileInputRef.current && fileInputRef.current.click(); }}>
          Choose MIDI file
        </Button>
      </div>
    );
  }

  if (!session) return null;

  const progressPct = playbackDuration > 0 ? (playbackTime / playbackDuration) * 100 : 0;
  const selectedVoice = getSelectedVoice(session);
  const selectedFilters = (selectedVoice && selectedVoice.filters) || defaultVoiceFilters();

  return (
    <div className="midi-import-page">
      <div className="midi-import-transport">
        <Button size="sm" variant="outline-secondary" className="midi-import-rewind-btn"
          onClick={function() { playback.seek(0); setPlaybackTime(0); }}
          aria-label="Rewind">
          {icons && icons.skipback ? icons.skipback : '⏮'}
        </Button>
        <Button size="sm" variant={playingAll ? 'primary' : 'outline-secondary'} onClick={togglePlayAll}>
          <PlayPauseIcon playing={playingAll} />
        </Button>
        <div
          ref={progressRef}
          className="midi-import-progress-track flex-grow-1"
          onClick={function(e) { seekFromProgress(e.clientX); }}
          onPointerDown={function(e) {
            seekFromProgress(e.clientX);
            function move(ev) { seekFromProgress(ev.clientX); }
            function up() {
              window.removeEventListener('pointermove', move);
              window.removeEventListener('pointerup', up);
            }
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
          }}
        >
          <div className="midi-import-progress-fill" style={{ width: progressPct + '%' }} />
        </div>
        <span className="small text-muted">{Math.floor(playbackTime)}s / {Math.floor(playbackDuration)}s</span>
      </div>

      <header className="midi-import-header d-flex align-items-center justify-content-between gap-3 p-2 border-bottom">
        <div className="midi-import-header-main d-flex align-items-center flex-wrap">
          <h1 className="h5 mb-0 midi-import-title">MIDI Import</h1>
          <div className="midi-import-file-block">
            <span className="midi-import-filename small text-muted" title={session.fileName}>
              {session.fileName}
            </span>
            <Button size="sm" variant="outline-secondary" className="midi-import-change-file"
              onClick={function() { fileInputRef.current && fileInputRef.current.click(); }}>
              Change file
            </Button>
            <input ref={fileInputRef} type="file" accept=".mid,.midi,audio/midi" className="d-none"
              onChange={handleFileReplace} />
          </div>
          <MidiImportVoicePicker
            session={session}
            selectedVoiceId={selectedVoice && selectedVoice.id}
            noteCountFor={noteCountFor}
            onSelectVoice={handleSelectVoice}
            onPatchVoice={patchVoice}
            onDuplicateClick={function() { setShowDuplicateDialog(true); }}
            onMergeClick={function() { setShowMergeDialog(true); }}
          />
        </div>
        <div className="d-flex gap-2 align-items-center midi-import-header-actions">
          <Button
            variant="outline-secondary"
            className="midi-import-help-btn"
            title="Help with MIDI Import settings"
            aria-label="Help with MIDI Import settings"
            onClick={function() { setShowHelpDialog(true); }}
          >
            {icons && icons.question ? icons.question : '?'}
          </Button>
          <Button variant="outline-secondary" onClick={handleCancel} disabled={loading}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={loading}>Save</Button>
        </div>
      </header>

      <MidiImportCompactFilters
        filters={selectedFilters}
        grid={session.sharedGrid}
        trackLabel={selectedVoice ? (selectedVoice.displayName || selectedVoice.id) : ''}
        trackColor={selectedVoice && selectedVoice.color}
        estimatedKey={(selectedVoice && selectedVoice.grid && selectedVoice.grid.estimatedKey) || 'C'}
        onKeyChange={function(key) {
          if (!selectedVoice || !session) return;
          let next = updateVoice(session, selectedVoice.id, { grid: { estimatedKey: key } });
          next = updateSharedGrid(next, { estimatedKey: key });
          patchSession(next);
        }}
        onFiltersChange={patchSelectedVoiceFilters}
        onGridChange={function(patch) {
          patchSession(updateSharedGrid(session, patch));
        }}
      />

      <div className="midi-import-preview-area border-top">
        <div className="midi-import-preview-toolbar px-2 py-1 d-flex flex-wrap align-items-center gap-2 border-bottom">
          <ButtonGroup size="sm" className="midi-import-preview-tab-group" aria-label="Preview mode">
            <Button
              type="button"
              variant={previewTab === 'piano' ? 'secondary' : 'outline-secondary'}
              active={previewTab === 'piano'}
              onClick={function() { setPreviewTab('piano'); }}
            >
              Piano roll
            </Button>
            <Button
              type="button"
              variant={previewTab === 'abc' ? 'secondary' : 'outline-secondary'}
              active={previewTab === 'abc'}
              onClick={function() { setPreviewTab('abc'); }}
            >
              ABC
            </Button>
          </ButtonGroup>
          <div className="midi-import-preview-tools d-flex flex-wrap align-items-center gap-2 ms-auto">
            <ButtonGroup size="sm" className="midi-import-zoom-group">
              <Button
                variant="outline-secondary"
                title="Zoom out"
                onClick={function() {
                  if (rollRef.current && rollRef.current.nudgeBeatWidth) rollRef.current.nudgeBeatWidth(-ZOOM_STEP);
                }}
              >−</Button>
              <Button
                variant="outline-secondary"
                title="Zoom in"
                onClick={function() {
                  if (rollRef.current && rollRef.current.nudgeBeatWidth) rollRef.current.nudgeBeatWidth(ZOOM_STEP);
                }}
              >+</Button>
              <Button
                variant="outline-secondary"
                title="Shorter rows"
                onClick={function() {
                  if (rollRef.current && rollRef.current.nudgeRowHeight) rollRef.current.nudgeRowHeight(-1);
                }}
              >H−</Button>
              <Button
                variant="outline-secondary"
                title="Taller rows"
                onClick={function() {
                  if (rollRef.current && rollRef.current.nudgeRowHeight) rollRef.current.nudgeRowHeight(1);
                }}
              >H+</Button>
              <Button
                variant="outline-secondary"
                title="Fit pitch range to view"
                onClick={function() {
                  if (rollRef.current && rollRef.current.fitToView) rollRef.current.fitToView();
                }}
              >Fit</Button>
            </ButtonGroup>
            <label className="midi-import-field midi-import-field-check mb-0">
              <span className="midi-import-field-label">Snap</span>
              <input
                type="checkbox"
                checked={session.previewSnapEnabled !== false}
                onChange={function(e) {
                  patchSession(Object.assign({}, session, { previewSnapEnabled: e.target.checked }));
                }}
              />
            </label>
            <label className="midi-import-field mb-0">
              <span className="midi-import-field-label">Grid</span>
              <select
                className="form-select form-select-sm midi-import-snap-select"
                value={session.previewSnapSlotsPerBeat || 4}
                disabled={session.previewSnapEnabled === false}
                onChange={function(e) {
                  patchSession(Object.assign({}, session, {
                    previewSnapSlotsPerBeat: parseInt(e.target.value, 10),
                  }));
                }}
                aria-label="Snap grid"
              >
                <option value={1}>1/4</option>
                <option value={2}>1/8</option>
                <option value={3}>1/8T</option>
                <option value={4}>1/16</option>
                <option value={6}>1/16T</option>
                <option value={8}>1/32</option>
                <option value={12}>1/32T</option>
              </select>
            </label>
          </div>
        </div>
        <div className="midi-import-preview-content">
          {previewTab === 'piano' ? (
            <MidiImportMultiPianoRoll
              ref={rollRef}
              session={session}
              processedVoices={processedVoices}
              onZoomChange={function(zoom) {
                patchSession(Object.assign({}, session, { previewZoom: zoom }));
              }}
              onFiltersChange={patchSelectedVoiceFilters}
              onAnacrusisChange={function(beats) {
                patchSession(Object.assign({}, session, { anacrusisBeats: beats }));
              }}
            />
          ) : (
            <div className="midi-import-abc-preview">
              <NotationPreview abc={previewAbc} fitWidth={true} wrapToWidth={true} maxHeight={null}
                className="midi-cleanup-notation-preview-host" />
            </div>
          )}
        </div>
      </div>

      <MidiImportMergeVoicesDialog
        show={showMergeDialog}
        voices={session.voices}
        onHide={function() { setShowMergeDialog(false); }}
        onMerge={function(a, b) {
          patchSession(mergeVoices(session, a, b));
          setShowMergeDialog(false);
        }}
      />
      <MidiImportDuplicateDialog
        show={showDuplicateDialog}
        voices={session.voices}
        noteCountFor={noteCountFor}
        onHide={function() { setShowDuplicateDialog(false); }}
        onDuplicate={function(voiceId) {
          patchSession(duplicateVoice(session, voiceId));
          setShowDuplicateDialog(false);
        }}
      />
      <MidiImportHelpDialog
        show={showHelpDialog}
        onHide={function() { setShowHelpDialog(false); }}
      />

    </div>
  );
}
