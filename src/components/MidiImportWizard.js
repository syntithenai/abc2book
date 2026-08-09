import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, Modal, Spinner, Table } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { icons } from '../Icons';
import useAbcPreviewSynth from '../useAbcPreviewSynth';
import MidiCleanupNotationOverlay from './MidiCleanupNotationOverlay';
import { FormLabelWithHelp } from './FormFieldHelp';
import { MIDI_CLEANUP_FIELD_HELP } from '../formFieldHelpText';
import { analyzeMidiBytes } from '../midiAnalyzeClient';
import { importMidiToAbc } from '../midiToAbcClient';
import { applyMidiCleanup } from '../midiCleanupPreview';
import { buildCleanupScorePreviewAbc } from '../midiCleanupNotationPreview';
import { parseMidiBytesToTracks, resolveCleanupPreviewVoices } from '../midiParseClient';
import { resolveImportAbcFromResponse } from '../midiImportAbcResolve';
import { finalizeMidiImportAbc } from '../midiImportFinalize';
import SelectAllToggle from './SelectAllToggle';
import CheckToggleButton from './CheckToggleButton';
import { displayNameForMidiTrack } from '../midiTrackNaming';
import useMidiFilePlayback from '../useMidiFilePlayback';
import { NotationPreview } from './SuggestionPreviewDialog';
import { abcTextToCandidates } from '../importSourceParse';
import { gmNameAt } from '../gmInstrumentNames';
import {
  buildImportOptionsFromDraft,
  createMidiImportDraft,
  defaultCleanupOptions,
  initDraftFromProfile,
  sortTracksByNoteCount,
} from '../midiImportWizardState';
import { useScoreConvertAffordance, scoreConvertCreditMessage } from '../scoreConvertAffordance';
import useMediaResolverHealth from '../useMediaResolverHealth';
import './MidiImportWizard.css';

const STEPS = [
  { key: 'tracks', title: 'Tracks' },
  { key: 'cleanup', title: 'Cleanup' },
  { key: 'interpret', title: 'Interpret' },
  { key: 'preview', title: 'Preview' },
];

function gmLabel(program) {
  const name = gmNameAt(program);
  return name.replace(/_/g, ' ');
}

function TrackMapStep(props) {
  const draft = props.draft;
  const profile = draft.profile || {};
  const tracks = sortTracksByNoteCount(profile.tracks || []);

  function updateDraft(patch) {
    const next = Object.assign({}, draft, patch);
    if (patch.selectedTrackIds) {
      next.mode = patch.selectedTrackIds.length >= 2 ? 'multi_voice' : 'melody';
      if (patch.selectedTrackIds.length > 8) {
        next.strategy = 'note_events';
      }
    }
    props.onChange(next);
  }

  function toggleTrack(trackId) {
    const ids = draft.selectedTrackIds.slice();
    const index = ids.indexOf(trackId);
    if (index >= 0) {
      ids.splice(index, 1);
    } else {
      ids.push(trackId);
    }
    updateDraft({ selectedTrackIds: ids });
  }

  function setDrumMode(trackId, mode) {
    const drumTrackModes = Object.assign({}, draft.drumTrackModes || {});
    drumTrackModes[trackId] = mode;
    updateDraft({ drumTrackModes: drumTrackModes });
  }

  function selectAllPitched() {
    const ids = tracks
      .filter(function(track) { return !track.is_drum && (track.note_count || 0) > 0; })
      .map(function(track) { return track.index; });
    updateDraft({ selectedTrackIds: ids });
  }

  function selectNonePitched() {
    updateDraft({ selectedTrackIds: [] });
  }

  function importAllPercussion() {
    const drumTrackModes = Object.assign({}, draft.drumTrackModes || {});
    tracks.forEach(function(track) {
      if (track.is_drum) drumTrackModes[track.index] = 'percussion';
    });
    updateDraft({ drumTrackModes: drumTrackModes });
  }

  function skipAllDrums() {
    const drumTrackModes = Object.assign({}, draft.drumTrackModes || {});
    tracks.forEach(function(track) {
      if (track.is_drum) drumTrackModes[track.index] = 'skip';
    });
    updateDraft({ drumTrackModes: drumTrackModes });
  }

  const pitchedTracks = tracks.filter(function(track) {
    return !track.is_drum && (track.note_count || 0) > 0;
  });
  const pitchedTotal = pitchedTracks.length;
  const pitchedSelected = (draft.selectedTrackIds || []).length;
  const percussionSelected = Object.keys(draft.drumTrackModes || {}).filter(function(trackId) {
    return draft.drumTrackModes[trackId] === 'percussion';
  }).length;

  return (
    <div>
      {(draft.selectedTrackIds || []).length > 8 ? (
        <Alert variant="info" className="small py-2 mb-2">
          Importing many tracks works best with the <strong>Note events</strong> strategy on the Interpret step.
          Leave <strong>Infer chord symbols</strong> off unless you specifically want a separate chord staff.
        </Alert>
      ) : null}
      <div className="d-flex flex-wrap gap-2 align-items-stretch mb-2 select-all-host">
        <SelectAllToggle
          size="sm"
          totalCount={pitchedTotal}
          selectedCount={pitchedSelected}
          onSelectAll={selectAllPitched}
          onSelectNone={selectNonePitched}
          ariaLabel="Select all pitched tracks"
        />
        <Button size="sm" variant="outline-secondary" onClick={importAllPercussion}>
          Import all percussion
        </Button>
        <Button size="sm" variant="outline-secondary" onClick={skipAllDrums}>
          Skip all drums
        </Button>
        <span className="small text-muted ms-1">
          {pitchedSelected} pitched + {percussionSelected} percussion selected
        </span>
      </div>
      <details className="small mb-2">
        <summary className="text-muted">Percussion import notes</summary>
        <ul className="mb-0 ps-3">
          <li>Drum tracks become separate percussion voices with GM drum map notation.</li>
          <li>Unmapped drum pitches may be omitted or shown as generic percussion.</li>
          <li>Quantization and cleanup can remove ghost notes and hi-hats.</li>
        </ul>
      </details>
      <Table striped bordered hover size="sm" className="track-map-table">
        <thead>
          <tr>
            <th>Import</th>
            <th>Track</th>
            <th>Instrument</th>
            <th>Notes</th>
            <th>Role</th>
            <th>Drums</th>
          </tr>
        </thead>
        <tbody>
          {tracks.map(function(track) {
            const selected = draft.selectedTrackIds.indexOf(track.index) >= 0;
            const isDrum = !!track.is_drum;
            const isEmpty = (track.note_count || 0) === 0;
            return (
              <tr
                key={'track-' + track.index}
                className={isEmpty ? 'midi-track-row-empty text-muted' : ''}
              >
                <td>
                  {!isDrum ? (
                    <CheckToggleButton
                      size="sm"
                      checked={selected}
                      disabled={isEmpty}
                      ariaLabel={'Import track ' + (track.name || track.index)}
                      onClick={function() { toggleTrack(track.index); }}
                    />
                  ) : null}
                </td>
                <td>{displayNameForMidiTrack({
                  id: track.index + 1,
                  name: track.name,
                  program: track.program,
                  isDrum: isDrum,
                  roleHint: track.role_hint,
                })}</td>
                <td>{isDrum ? 'Percussion' : gmLabel(track.program)}</td>
                <td>{track.note_count}</td>
                <td>{track.role_hint || 'unknown'}</td>
                <td>
                  {isDrum ? (
                    <Form.Select
                      size="sm"
                      value={(draft.drumTrackModes || {})[track.index] || 'skip'}
                      onChange={function(e) { setDrumMode(track.index, e.target.value); }}
                    >
                      <option value="skip">Skip</option>
                      <option value="percussion">Percussion voice</option>
                    </Form.Select>
                  ) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}

function MidiImportPlaybackBar(props) {
  const draft = props.draft;
  const interpretedAbc = props.interpretedAbc || '';
  const [midiPlaying, setMidiPlaying] = useState(false);
  const [midiLoading, setMidiLoading] = useState(false);
  const playback = useAbcPreviewSynth();
  const midiPlayback = useMidiFilePlayback({
    onLoading: setMidiLoading,
    onEnded: function() { setMidiPlaying(false); },
  });

  useEffect(function() {
    if (!draft.midiBytes) return undefined;
    setMidiPlaying(false);
    midiPlayback.init(draft.midiBytes.buffer
      ? draft.midiBytes.buffer.slice(
        draft.midiBytes.byteOffset,
        draft.midiBytes.byteOffset + draft.midiBytes.byteLength
      )
      : draft.midiBytes);
    return function() {
      midiPlayback.stop();
      setMidiPlaying(false);
    };
  }, [draft.midiBytes, draft.fileName]);

  return (
    <div className="midi-import-preview-playback mb-2 d-flex align-items-center gap-2 flex-wrap">
      <Button
        variant="outline-secondary"
        size="sm"
        title={playback.isPlaying ? 'Pause interpreted preview' : 'Play interpreted preview (quantized)'}
        disabled={!interpretedAbc || playback.loading}
        onClick={function() { playback.togglePlay(interpretedAbc); }}
      >
        {playback.loading ? <Spinner animation="border" size="sm" /> : icons[playback.isPlaying ? 'pause' : 'play']}
        <span className="ms-1">Interpreted</span>
      </Button>
      <Button
        variant="outline-secondary"
        size="sm"
        title="Rewind interpreted preview"
        disabled={!interpretedAbc || playback.loading}
        onClick={function() { playback.rewind(interpretedAbc); }}
      >
        {icons.rewind}
      </Button>
      <Button
        variant="outline-secondary"
        size="sm"
        title="Play original MIDI file"
        disabled={!draft.midiBytes || midiLoading}
        onClick={async function() {
          if (midiPlaying) {
            midiPlayback.pause();
            setMidiPlaying(false);
          } else {
            const started = await midiPlayback.start();
            setMidiPlaying(!!started);
          }
        }}
      >
        {midiPlaying ? 'Pause original' : 'Original MIDI'}
      </Button>
      {playback.error ? <span className="text-danger small">{playback.error}</span> : null}
    </div>
  );
}

function CleanupStep(props) {
  const draft = props.draft;
  const cleanup = draft.cleanupOptions || defaultCleanupOptions();
  const parsed = useMemo(function() {
    if (!draft.midiBytes) return { tracks: [], tempoBpm: 120 };
    return parseMidiBytesToTracks(draft.midiBytes);
  }, [draft.midiBytes]);

  const previewVoices = useMemo(function() {
    const tempo = draft.tempoBpm || parsed.tempoBpm || 120;
    const rawVoices = resolveCleanupPreviewVoices(
      parsed,
      draft.profile,
      draft.selectedTrackIds,
      draft.drumTrackModes
    );
    return rawVoices.map(function(voice) {
      const cleaned = applyMidiCleanup(voice.notes, cleanup, tempo);
      return Object.assign({}, voice, { notes: cleaned.notes });
    });
  }, [parsed, draft.profile, draft.selectedTrackIds, draft.drumTrackModes, cleanup, draft.tempoBpm, parsed.tempoBpm]);

  const cleanupStats = useMemo(function() {
    const tempo = draft.tempoBpm || parsed.tempoBpm || 120;
    const rawVoices = resolveCleanupPreviewVoices(
      parsed,
      draft.profile,
      draft.selectedTrackIds,
      draft.drumTrackModes
    );
    let beforeCount = 0;
    let afterCount = 0;
    rawVoices.forEach(function(voice) {
      beforeCount += voice.notes.length;
      afterCount += applyMidiCleanup(voice.notes, cleanup, tempo).notes.length;
    });
    if (!beforeCount) return null;
    const removedCount = Math.max(0, beforeCount - afterCount);
    return {
      removedCount: removedCount,
      removedPercent: Math.round((removedCount / beforeCount) * 100),
    };
  }, [parsed, draft.profile, draft.selectedTrackIds, draft.drumTrackModes, cleanup, draft.tempoBpm, parsed.tempoBpm]);

  function updateCleanup(patch) {
    props.onChange(Object.assign({}, draft, {
      cleanupOptions: Object.assign({}, cleanup, patch),
      cleanupSkipped: false,
    }));
  }

  const beatsPerBar = useMemo(function() {
    const meter = draft.timeSignature || (draft.profile && draft.profile.time_signature) || '4/4';
    return parseInt(String(meter).split('/')[0], 10) || 4;
  }, [draft.timeSignature, draft.profile]);

  const interpretedAbc = useMemo(function() {
    if (!previewVoices.length) return '';
    return buildCleanupScorePreviewAbc(previewVoices, {
      tempoBpm: draft.tempoBpm || parsed.tempoBpm || 120,
      meter: draft.timeSignature || (draft.profile && draft.profile.time_signature) || '4/4',
      key: draft.estimatedKey || (draft.profile && draft.profile.estimated_key) || 'C',
      beatsPerBar: beatsPerBar,
      slotsPerBeat: draft.quantSlotsPerBeat || 2,
      noteLength: draft.noteLength || '1/8',
    });
  }, [
    previewVoices,
    draft.tempoBpm,
    draft.timeSignature,
    draft.estimatedKey,
    draft.quantSlotsPerBeat,
    draft.noteLength,
    draft.profile,
    parsed.tempoBpm,
    beatsPerBar,
  ]);

  return (
    <div className="midi-cleanup-step d-flex flex-column flex-grow-1 min-h-0">
      <div className="d-flex flex-wrap gap-3 mb-2">
        <Form.Group>
          <FormLabelWithHelp
            label="Velocity gate"
            helpTitle={MIDI_CLEANUP_FIELD_HELP.velocityGate.title}
            helpBody={MIDI_CLEANUP_FIELD_HELP.velocityGate.body}
          />
          <Form.Range min={0} max={127} value={cleanup.velocityGate}
            onChange={function(e) { updateCleanup({ velocityGate: parseInt(e.target.value, 10) }); }} />
        </Form.Group>
        <Form.Group>
          <FormLabelWithHelp
            label="Min duration (ms)"
            helpTitle={MIDI_CLEANUP_FIELD_HELP.minDurationMs.title}
            helpBody={MIDI_CLEANUP_FIELD_HELP.minDurationMs.body}
          />
          <Form.Control type="number" min={0} max={500} size="sm" style={{ width: 90 }}
            value={cleanup.minDurationMs}
            onChange={function(e) { updateCleanup({ minDurationMs: parseFloat(e.target.value) || 0 }); }} />
        </Form.Group>
        <Form.Group>
          <FormLabelWithHelp
            label="Retrigger merge (ms)"
            helpTitle={MIDI_CLEANUP_FIELD_HELP.retriggerMergeMs.title}
            helpBody={MIDI_CLEANUP_FIELD_HELP.retriggerMergeMs.body}
          />
          <Form.Control type="number" min={0} max={500} size="sm" style={{ width: 90 }}
            value={cleanup.retriggerMergeMs}
            onChange={function(e) { updateCleanup({ retriggerMergeMs: parseFloat(e.target.value) || 0 }); }} />
        </Form.Group>
        <Form.Group>
          <FormLabelWithHelp
            label="Swing amount"
            helpTitle={MIDI_CLEANUP_FIELD_HELP.swingAmount.title}
            helpBody={MIDI_CLEANUP_FIELD_HELP.swingAmount.body}
          />
          <Form.Range min={0} max={50} value={Math.round(cleanup.swingAmount * 100)}
            onChange={function(e) { updateCleanup({ swingAmount: parseInt(e.target.value, 10) / 100 }); }} />
        </Form.Group>
      </div>
      {cleanupStats && cleanupStats.removedCount > 0 ? (
        <div className="small text-muted mb-2">
          Removed {cleanupStats.removedCount} notes ({cleanupStats.removedPercent}%)
        </div>
      ) : null}
      <MidiImportPlaybackBar draft={draft} interpretedAbc={interpretedAbc} />
      <div className="midi-cleanup-preview-panel flex-grow-1 min-h-0">
        <MidiCleanupNotationOverlay
          voices={previewVoices}
          tempoBpm={draft.tempoBpm || parsed.tempoBpm || 120}
          meter={draft.timeSignature || (draft.profile && draft.profile.time_signature) || '4/4'}
          key={draft.estimatedKey || (draft.profile && draft.profile.estimated_key) || 'C'}
          beatsPerBar={beatsPerBar}
          slotsPerBeat={draft.quantSlotsPerBeat || 2}
          noteLength={draft.noteLength || '1/8'}
        />
      </div>
      <Button
        variant="link"
        size="sm"
        className="px-0 mt-2"
        onClick={function() {
          props.onChange(Object.assign({}, draft, {
            cleanupOptions: null,
            cleanupSkipped: true,
          }));
          props.onContinue();
        }}
      >
        Skip cleanup
      </Button>
    </div>
  );
}

function InterpretStep(props) {
  const draft = props.draft;
  return (
    <div className="row g-3">
      <div className="col-md-6">
        <Form.Group>
          <Form.Label>Mode</Form.Label>
          <Form.Select value={draft.mode} onChange={function(e) {
            props.onChange(Object.assign({}, draft, { mode: e.target.value }));
          }}>
            <option value="melody">Melody only</option>
            <option value="multi_voice">Multi-voice</option>
          </Form.Select>
        </Form.Group>
      </div>
      <div className="col-md-6">
        <Form.Group>
          <Form.Label>Strategy</Form.Label>
          <Form.Select value={draft.strategy} onChange={function(e) {
            props.onChange(Object.assign({}, draft, { strategy: e.target.value }));
          }}>
            <option value="auto">Auto</option>
            <option value="note_events">Note events</option>
            <option value="musicxml">MusicXML</option>
            <option value="musescore">MuseScore</option>
          </Form.Select>
        </Form.Group>
      </div>
      <div className="col-md-4">
        <Form.Group>
          <Form.Label>Rhythm detail</Form.Label>
          <Form.Select value={draft.rhythmDetail || 'standard'} onChange={function(e) {
            props.onChange(Object.assign({}, draft, { rhythmDetail: e.target.value }));
          }}>
            <option value="simple">Simple (quarters &amp; halves)</option>
            <option value="standard">Standard (eighths &amp; triplets)</option>
            <option value="detailed">Detailed (sixteenths)</option>
          </Form.Select>
        </Form.Group>
      </div>
      <div className="col-md-4">
        <Form.Group>
          <Form.Label>Quantize strength ({Math.round((draft.quantStrength != null ? draft.quantStrength : 0.7) * 100)}%)</Form.Label>
          <Form.Range
            min={0}
            max={100}
            value={Math.round((draft.quantStrength != null ? draft.quantStrength : 0.7) * 100)}
            onChange={function(e) {
              props.onChange(Object.assign({}, draft, {
                quantStrength: parseInt(e.target.value, 10) / 100,
              }));
            }}
          />
        </Form.Group>
      </div>
      <div className="col-md-4">
        <Form.Group>
          <Form.Label>Tempo</Form.Label>
          <Form.Control type="number" value={draft.tempoBpm || ''} onChange={function(e) {
            props.onChange(Object.assign({}, draft, { tempoBpm: parseFloat(e.target.value) || null }));
          }} />
        </Form.Group>
      </div>
      <div className="col-md-4">
        <Form.Group>
          <Form.Label>Key</Form.Label>
          <Form.Control value={draft.estimatedKey || ''} onChange={function(e) {
            props.onChange(Object.assign({}, draft, { estimatedKey: e.target.value }));
          }} />
        </Form.Group>
      </div>
      <div className="col-md-4">
        <Form.Group>
          <Form.Label>Meter</Form.Label>
          <Form.Control value={draft.timeSignature || ''} onChange={function(e) {
            props.onChange(Object.assign({}, draft, { timeSignature: e.target.value }));
          }} />
        </Form.Group>
      </div>
      <div className="col-md-4">
        <Form.Check
          type="checkbox"
          label="Infer chord symbols"
          checked={!!draft.includeChords}
          onChange={function(e) {
            props.onChange(Object.assign({}, draft, { includeChords: e.target.checked }));
          }}
        />
        <Form.Text className="text-muted">
          Adds a chord staff. Usually off for multi-track orchestral imports.
        </Form.Text>
      </div>
    </div>
  );
}

function resolveWizardImportAbc(result, draft, abcjsParser) {
  if (!result) return '';
  let abc = resolveImportAbcFromResponse(result, draft.fileName, {
    trackIds: draft.selectedTrackIds,
  });
  return finalizeMidiImportAbc(abc, result, abcjsParser, {
    includeChords: draft.includeChords === true,
    trackIds: draft.selectedTrackIds,
  });
}

function PreviewStep(props) {
  const draft = props.draft;
  const result = draft.previewResult;
  const previewAbc = useMemo(function() {
    if (!result) return '';
    return resolveWizardImportAbc(result, props.draft, props.abcjsParser);
  }, [result, props.draft, props.abcjsParser]);

  if (!result && !previewAbc) {
    return <div className="text-muted">Click Continue to generate preview.</div>;
  }
  return (
    <div>
      {result ? (
        <div className="small mb-2">
          Strategy: {result.strategy} · Mode: {result.mode}
          {typeof result.confidence === 'number' ? ' · Confidence: ' + Math.round(result.confidence * 100) + '%' : ''}
          {result.diagnostics && result.diagnostics.quant_divisors
            ? ' · Divisors: ' + result.diagnostics.quant_divisors
            : ''}
          {result.diagnostics && typeof result.diagnostics.quant_error === 'number'
            ? ' · Quant error: ' + result.diagnostics.quant_error
            : ''}
        </div>
      ) : null}
      {((result && result.warnings) || []).map(function(warning, index) {
        return <Alert key={'warn-' + index} variant="warning" className="py-1 small">{warning}</Alert>;
      })}
      <MidiImportPlaybackBar draft={draft} interpretedAbc={previewAbc} />
      <div className="midi-import-notation-preview">
        <NotationPreview
          abc={previewAbc}
          fitWidth={true}
          wrapToWidth={true}
          maxHeight={null}
        />
      </div>
    </div>
  );
}

export default function MidiImportWizard(props) {
  const show = !!props.show;
  const [activeStep, setActiveStep] = useState('tracks');
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { status } = useMediaResolverHealth();
  const billingEnabled = !!(status && status.billingEnabled);
  const creditAffordance = useScoreConvertAffordance(
    props.accessToken,
    'midi_import',
    !!props.accessToken && billingEnabled
  );
  const creditMessage = scoreConvertCreditMessage(creditAffordance, 'MIDI import');

  useEffect(function() {
    if (!show) return;
    setActiveStep('tracks');
    setError('');
    setLoading(true);
    const pending = props.pendingMidi || {};

    async function loadProfile() {
      try {
        let bytes = pending.bytes;
        if (!bytes && pending.file) {
          const buffer = await pending.file.arrayBuffer();
          bytes = new Uint8Array(buffer);
        }
        if (!bytes) {
          throw new Error('No MIDI data');
        }
        const profile = await analyzeMidiBytes(bytes, pending.fileName, props.accessToken);
        const initial = initDraftFromProfile(
          createMidiImportDraft({
            fileName: pending.fileName,
            sourceUrl: pending.sourceUrl,
            midiBytes: bytes,
          }),
          profile
        );
        setDraft(initial);
      } catch (e) {
        setError((e && e.message) || 'Could not analyze MIDI');
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [show, props.pendingMidi, props.accessToken]);

  function handleClose() {
    setDraft(null);
    setError('');
    if (props.onClose) props.onClose();
  }

  async function runPreview() {
    if (!draft) return;
    setLoading(true);
    setError('');
    try {
      const importOpts = buildImportOptionsFromDraft(draft);
      const result = await importMidiToAbc(
        draft.midiBytes,
        draft.fileName,
        props.accessToken,
        importOpts
      );
      setDraft(function(current) {
        return Object.assign({}, current, { previewResult: result });
      });
      setActiveStep('preview');
    } catch (e) {
      setError((e && e.message) || 'Preview failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleFinish() {
    if (!draft) return;
    setLoading(true);
    setError('');
    try {
      let result = draft.previewResult;
      if (!result) {
        const importOpts = buildImportOptionsFromDraft(draft);
        result = await importMidiToAbc(
          draft.midiBytes,
          draft.fileName,
          props.accessToken,
          importOpts
        );
      }
      let abc = '';
      if (result) {
        abc = resolveWizardImportAbc(result, draft, props.abcjsParser);
      }
      const candidates = abcTextToCandidates(abc, props.tunebook, props.book).map(function(c) {
        c.sourceKind = 'midi';
        if (result.warnings && result.warnings.length) {
          c.importWarnings = result.warnings.slice();
        }
        c.midiImport = {
          strategy: result.strategy,
          mode: result.mode,
          confidence: result.confidence,
          diagnostics: result.diagnostics,
          profile: result.profile,
          chords: result.chords,
          chordSegments: result.chordSegments,
          harmonyAbc: result.harmonyAbc,
          harmonyVoiceName: result.harmonyVoiceName,
          wizardSettings: buildImportOptionsFromDraft(draft),
        };
        if (draft.midiBytes) {
          c.pendingFile = {
            name: draft.fileName || 'import.mid',
            type: 'audio/midi',
            blob: new Blob([draft.midiBytes], { type: 'audio/midi' }),
            source: 'import',
          };
        }
        if (draft.sourceUrl) {
          c.sourceUrl = draft.sourceUrl;
        }
        return c;
      });
      if (props.onComplete) {
        props.onComplete({ candidates: candidates, draft: draft, result: result });
      }
      handleClose();
    } catch (e) {
      setError((e && e.message) || 'Import failed');
      toast.error((e && e.message) || 'MIDI import failed');
    } finally {
      setLoading(false);
    }
  }

  function handleContinue() {
    if (creditAffordance.blocked && (activeStep === 'interpret' || activeStep === 'preview')) {
      setError(creditMessage || 'Insufficient resolver credit for MIDI import.');
      return;
    }
    if (activeStep === 'tracks') {
      setActiveStep('cleanup');
      return;
    }
    if (activeStep === 'cleanup') {
      setActiveStep('interpret');
      return;
    }
    if (activeStep === 'interpret') {
      runPreview();
      return;
    }
    if (activeStep === 'preview') {
      handleFinish();
    }
  }

  const stepIndex = STEPS.findIndex(function(s) { return s.key === activeStep; });

  const wizardActions = (
    <div className="midi-import-wizard-actions d-flex flex-wrap gap-2 align-items-center justify-content-end">
      <Button variant="secondary" size="sm" onClick={handleClose} disabled={loading}>Cancel</Button>
      {stepIndex > 0 ? (
        <Button variant="outline-secondary" size="sm" disabled={loading} onClick={function() {
          setActiveStep(STEPS[stepIndex - 1].key);
        }}>Back</Button>
      ) : null}
      <Button variant="primary" size="sm" disabled={loading || !draft || creditAffordance.blocked} onClick={handleContinue}>
        {loading ? <Spinner animation="border" size="sm" /> : null}
        {activeStep === 'preview' ? 'Import' : 'Continue'}
      </Button>
    </div>
  );

  return (
    <Modal
      show={show}
      onHide={handleClose}
      fullscreen
      className="midi-import-wizard"
      dialogClassName="midi-import-wizard-modal"
      contentClassName="midi-import-wizard-content"
    >
      <Modal.Header closeButton className="midi-import-wizard-header">
        <Modal.Title>MIDI import — {draft && draft.fileName ? draft.fileName : 'wizard'}</Modal.Title>
      </Modal.Header>
      <Modal.Body className="midi-import-wizard-body">
        <div className="midi-import-wizard-toolbar d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div className="wizard-step-nav d-flex gap-2 flex-wrap align-items-center">
            {STEPS.map(function(step, index) {
              return (
                <Button
                  key={step.key}
                  size="sm"
                  variant={step.key === activeStep ? 'primary' : 'outline-secondary'}
                  disabled={index > stepIndex + 1}
                  onClick={function() { setActiveStep(step.key); }}
                >
                  {index + 1}. {step.title}
                </Button>
              );
            })}
          </div>
          {wizardActions}
        </div>
        <div className="midi-import-wizard-step-content">
          {loading && !draft ? (
            <div className="text-center py-4"><Spinner animation="border" /> Analyzing MIDI…</div>
          ) : null}
          {error ? <Alert variant="danger">{error}</Alert> : null}
          {creditMessage && !error ? (
            <Alert variant={creditAffordance.blocked ? 'warning' : 'info'}>{creditMessage}</Alert>
          ) : null}
          {draft && activeStep === 'tracks' ? <TrackMapStep draft={draft} onChange={setDraft} /> : null}
          {draft && activeStep === 'cleanup' ? (
            <CleanupStep draft={draft} onChange={setDraft} onContinue={function() { setActiveStep('interpret'); }} />
          ) : null}
          {draft && activeStep === 'interpret' ? <InterpretStep draft={draft} onChange={setDraft} /> : null}
          {draft && activeStep === 'preview' ? (
            <PreviewStep draft={draft} abcjsParser={props.abcjsParser} />
          ) : null}
        </div>
      </Modal.Body>
    </Modal>
  );
}
