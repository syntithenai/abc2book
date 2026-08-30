import { useEffect, useMemo, useState } from 'react';
import { Accordion, Alert, Button, ButtonGroup, Form, Modal, Spinner, Table } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { icons } from '../Icons';
import useAbcPreviewSynth from '../useAbcPreviewSynth';
import MidiCleanupNotationOverlay from './MidiCleanupNotationOverlay';
import MidiSplitTracksDialog from './MidiSplitTracksDialog';
import { FormLabelWithHelp } from './FormFieldHelp';
import { MIDI_CLEANUP_FIELD_HELP, MIDI_IMPORT_WIZARD_HELP } from '../formFieldHelpText';
import { analyzeMidiBytes } from '../midiAnalyzeClient';
import { importMidiToAbc } from '../midiToAbcClient';
import { applyMidiCleanup, CLEANUP_PRESETS } from '../midiCleanupPreview';
import {
  audibleTrackIds,
  applyPitchSplitToDraft,
  assignTracksToMergeGroup,
  buildImportOptionsFromDraft,
  createMidiImportDraft,
  defaultCleanupOptions,
  estimateTempoFromDraft,
  filterTracksForDisplay,
  initDraftFromProfile,
  KEY_OPTIONS,
  METER_OPTIONS,
  midiNoteName,
  noteLengthFromRhythmDetail,
  resolveImportVoiceNotes,
  resolveImportVoices,
  slotsPerBeatFromRhythmDetail,
  sortTracksByNoteCount,
  STAFF_OPTIONS,
  ungroupTracks,
  wizardSummary,
} from '../midiImportWizardState';
import { buildCleanupScorePreviewAbc } from '../midiCleanupNotationPreview';
import { gridBeatsPerBarFromMeter } from '../midiAbcQuantize';
import { buildLocalMidiImportResult } from '../midiImportPreview';
import { resolveImportAbcFromResponse } from '../midiImportAbcResolve';
import { finalizeMidiImportAbc } from '../midiImportFinalize';
import SelectAllToggle from './SelectAllToggle';
import CheckToggleButton from './CheckToggleButton';
import { displayNameForMidiTrack } from '../midiTrackNaming';
import useMidiFilePlayback from '../useMidiFilePlayback';
import { NotationPreview } from './SuggestionPreviewDialog';
import { abcTextToCandidates } from '../importSourceParse';
import { useScoreConvertAffordance, scoreConvertCreditMessage } from '../scoreConvertAffordance';
import useMediaResolverHealth from '../useMediaResolverHealth';
import './MidiImportWizard.css';

const STEPS = [
  { key: 'select', title: 'Select' },
  { key: 'tracks', title: 'Tracks' },
  { key: 'cleanup', title: 'Cleanup' },
  { key: 'preview', title: 'Preview' },
];

const SYSTEM_OPTIONS = ['own', '1', '2', '3', '4'];
const ROLE_FILTER_OPTIONS = [
  { value: 'all', label: 'All roles' },
  { value: 'melody', label: 'Melody' },
  { value: 'harmony', label: 'Harmony' },
  { value: 'bass', label: 'Bass' },
  { value: 'drum', label: 'Drums' },
];

const CLEANUP_PRESET_LABELS = {
  ghost: 'Ghost notes',
  piano: 'Piano',
  orchestral: 'Orchestral',
  drums: 'Drums',
};

function midiArrayBuffer(midiBytes) {
  if (!midiBytes) return null;
  if (midiBytes.buffer) {
    return midiBytes.buffer.slice(
      midiBytes.byteOffset,
      midiBytes.byteOffset + midiBytes.byteLength
    );
  }
  return midiBytes;
}

function trackByIndex(profile, trackId) {
  const tracks = (profile && profile.tracks) || [];
  return tracks.find(function(t) { return t.index === trackId; }) || null;
}

function importCheckedPitchedIds(draft) {
  return (draft.selectedTrackIds || []).filter(function(trackId) {
    const track = trackByIndex(draft.profile, trackId);
    return track && !track.is_drum;
  });
}

function formatSummaryText(summary) {
  if (!summary) return '';
  const parts = [
    summary.voiceCount + ' voice' + (summary.voiceCount === 1 ? '' : 's'),
  ];
  if (summary.groupCount) {
    parts.push(summary.groupCount + ' group' + (summary.groupCount === 1 ? '' : 's'));
  }
  if (summary.drumsIncluded) {
    parts.push(summary.drumsIncluded + ' drum' + (summary.drumsIncluded === 1 ? '' : 's') + ' included');
  }
  if (summary.drumsSkipped) {
    parts.push(summary.drumsSkipped + ' drum' + (summary.drumsSkipped === 1 ? '' : 's') + ' skipped');
  }
  parts.push(summary.meter, summary.key, summary.tempoBpm + ' BPM');
  return parts.join(' · ');
}

function StickyGridStrip(props) {
  const draft = props.draft;
  const summary = useMemo(function() { return wizardSummary(draft); }, [draft]);

  function patchDraft(patch) {
    props.onChange(Object.assign({}, draft, patch, { previewResult: null }));
  }

  return (
    <div className="midi-sticky-grid-strip d-flex flex-wrap gap-3 align-items-end">
      <div className="midi-sticky-summary small text-muted">
        {formatSummaryText(summary)}
      </div>
      <Form.Group className="mb-0">
        <Form.Label className="small mb-0">Tempo</Form.Label>
        <div className="d-flex flex-wrap gap-1 align-items-center">
          <Form.Control
            type="number"
            size="sm"
            style={{ width: 72 }}
            value={draft.tempoBpm != null ? draft.tempoBpm : ''}
            disabled={!!draft.tempoLocked}
            onChange={function(e) {
              patchDraft({ tempoBpm: parseFloat(e.target.value) || null });
            }}
          />
          <Button
            size="sm"
            variant="outline-secondary"
            disabled={draft.detectedTempoBpm == null}
            onClick={function() { patchDraft({ tempoBpm: draft.detectedTempoBpm }); }}
          >
            Detected
          </Button>
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={function() {
              const bpm = estimateTempoFromDraft(draft);
              if (bpm) patchDraft({ tempoBpm: bpm });
            }}
          >
            Recalc
          </Button>
          <Form.Check
            type="checkbox"
            className="small mb-0"
            label="Lock"
            checked={!!draft.tempoLocked}
            onChange={function(e) { patchDraft({ tempoLocked: e.target.checked }); }}
          />
        </div>
      </Form.Group>
      <Form.Group className="mb-0">
        <Form.Label className="small mb-0">Meter</Form.Label>
        <div className="d-flex flex-wrap gap-1 align-items-center">
          <Form.Select
            size="sm"
            style={{ width: 88 }}
            value={draft.timeSignature || '4/4'}
            disabled={!!draft.meterLocked}
            onChange={function(e) { patchDraft({ timeSignature: e.target.value }); }}
          >
            {METER_OPTIONS.map(function(m) {
              return <option key={m} value={m}>{m}</option>;
            })}
          </Form.Select>
          <Form.Check
            type="checkbox"
            className="small mb-0"
            label="Lock"
            checked={!!draft.meterLocked}
            onChange={function(e) { patchDraft({ meterLocked: e.target.checked }); }}
          />
        </div>
      </Form.Group>
      <Form.Group className="mb-0">
        <Form.Label className="small mb-0">Key</Form.Label>
        <div className="d-flex flex-wrap gap-1 align-items-center">
          <Form.Select
            size="sm"
            style={{ width: 88 }}
            value={draft.estimatedKey || 'C'}
            onChange={function(e) { patchDraft({ estimatedKey: e.target.value }); }}
          >
            {KEY_OPTIONS.map(function(k) {
              return <option key={k} value={k}>{k}</option>;
            })}
          </Form.Select>
          <span className="small text-muted">
            Detected: {draft.detectedKey || summary.key}
          </span>
        </div>
      </Form.Group>
    </div>
  );
}

function SelectStep(props) {
  const draft = props.draft;
  const [replacing, setReplacing] = useState(false);

  async function handleFileChange(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setReplacing(true);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const profile = await analyzeMidiBytes(bytes, file.name, props.accessToken);
      if (!profile || !Array.isArray(profile.tracks) || !profile.tracks.length) {
        throw new Error((profile && profile.reject_reason) || 'This MIDI file has no tracks');
      }
      const base = createMidiImportDraft({
        fileName: file.name,
        sourceUrl: '',
        midiBytes: bytes,
      });
      const next = initDraftFromProfile(base, profile);
      props.onChange(next);
      props.onReplaced();
    } catch (e) {
      toast.error((e && e.message) || 'Could not analyze MIDI');
    } finally {
      setReplacing(false);
    }
  }

  return (
    <div>
      <p className="mb-2">
        Current file: <strong>{draft.fileName || 'import.mid'}</strong>
        {draft.sourceUrl ? (
          <span className="small text-muted ms-2">{draft.sourceUrl}</span>
        ) : null}
      </p>
      <Form.Group>
        <Form.Label>Replace MIDI file</Form.Label>
        <Form.Control
          type="file"
          accept=".mid,.midi,audio/midi,audio/x-midi"
          disabled={replacing}
          onChange={handleFileChange}
        />
        <Form.Text className="text-muted">
          Pick a .mid or .midi file. Replacing re-analyzes the file and resets track groups, splits, and preview.
        </Form.Text>
      </Form.Group>
      {replacing ? (
        <div className="mt-2"><Spinner animation="border" size="sm" /> Analyzing…</div>
      ) : null}
    </div>
  );
}

function TracksStep(props) {
  const draft = props.draft;
  const profile = draft.profile || {};
  const allTracks = sortTracksByNoteCount(profile.tracks || []);
  const filter = draft.trackFilter || { role: 'all', minNotes: 0, hideEmpty: true };
  const visibleTracks = filterTracksForDisplay(allTracks, filter);
  const audible = useMemo(function() { return audibleTrackIds(draft); }, [draft]);
  const resolvedVoices = useMemo(function() { return resolveImportVoices(draft); }, [draft]);
  const [midiPlaying, setMidiPlaying] = useState(false);
  const [midiLoading, setMidiLoading] = useState(false);

  const midiPlayback = useMidiFilePlayback({
    audibleTrackIds: audible,
    onLoading: setMidiLoading,
    onEnded: function() { setMidiPlaying(false); },
  });

  useEffect(function() {
    if (!draft.midiBytes) return undefined;
    setMidiPlaying(false);
    midiPlayback.init(midiArrayBuffer(draft.midiBytes));
    return function() {
      midiPlayback.stop();
      setMidiPlaying(false);
    };
  }, [draft.midiBytes, draft.fileName]);

  function updateDraft(patch) {
    props.onChange(Object.assign({}, draft, patch, { previewResult: null }));
  }

  function toggleImport(trackId) {
    const ids = (draft.selectedTrackIds || []).slice();
    const index = ids.indexOf(trackId);
    if (index >= 0) ids.splice(index, 1);
    else ids.push(trackId);
    updateDraft({
      selectedTrackIds: ids,
      mode: ids.length >= 2 ? 'multi_voice' : 'melody',
      strategy: ids.length > 8 ? 'note_events' : draft.strategy,
    });
  }

  function toggleMute(trackId) {
    const muted = (draft.mutedTrackIds || []).slice();
    const index = muted.indexOf(trackId);
    if (index >= 0) muted.splice(index, 1);
    else muted.push(trackId);
    updateDraft({ mutedTrackIds: muted });
  }

  function toggleSolo(trackId) {
    const solos = (draft.soloTrackIds || []).slice();
    const index = solos.indexOf(trackId);
    if (index >= 0) solos.splice(index, 1);
    else solos.push(trackId);
    updateDraft({ soloTrackIds: solos });
  }

  function setDrumMode(trackId, mode) {
    const drumTrackModes = Object.assign({}, draft.drumTrackModes || {});
    drumTrackModes[trackId] = mode;
    updateDraft({ drumTrackModes: drumTrackModes });
  }

  function setTrackStaff(key, staff) {
    const trackStaff = Object.assign({}, draft.trackStaff || {});
    trackStaff[key] = staff;
    updateDraft({ trackStaff: trackStaff });
  }

  function setTrackSystem(key, system) {
    const trackSystem = Object.assign({}, draft.trackSystem || {});
    trackSystem[key] = system;
    updateDraft({ trackSystem: trackSystem });
  }

  function setCollapseChords(key, checked) {
    const collapseChordsByVoice = Object.assign({}, draft.collapseChordsByVoice || {});
    if (checked) collapseChordsByVoice[key] = true;
    else delete collapseChordsByVoice[key];
    updateDraft({ collapseChordsByVoice: collapseChordsByVoice });
  }

  function selectAllPitched() {
    const ids = allTracks
      .filter(function(track) { return !track.is_drum && (track.note_count || 0) > 0; })
      .map(function(track) { return track.index; });
    updateDraft({
      selectedTrackIds: ids,
      mode: ids.length >= 2 ? 'multi_voice' : 'melody',
      strategy: ids.length > 8 ? 'note_events' : draft.strategy,
    });
  }

  function selectNonePitched() {
    updateDraft({ selectedTrackIds: [] });
  }

  function groupSelected() {
    const ids = importCheckedPitchedIds(draft);
    if (ids.length < 2) {
      toast.info('Select at least two pitched tracks to group.');
      return;
    }
    updateDraft(assignTracksToMergeGroup(draft, ids, '__new__'));
  }

  function ungroupSelected() {
    const ids = importCheckedPitchedIds(draft);
    if (!ids.length) return;
    updateDraft(ungroupTracks(draft, ids));
  }

  const pitchedTotal = allTracks.filter(function(t) {
    return !t.is_drum && (t.note_count || 0) > 0;
  }).length;
  const pitchedSelected = (draft.selectedTrackIds || []).length;

  function groupLabel(trackId) {
    const gid = draft.mergeGroupId && draft.mergeGroupId[trackId];
    if (!gid) return '—';
    const group = draft.groups && draft.groups[gid];
    return group && group.name ? group.name : gid;
  }

  function collapseKeyForTrack(trackId) {
    const gid = draft.mergeGroupId && draft.mergeGroupId[trackId];
    return gid || String(trackId);
  }

  function pitchRangeLabel(track) {
    if (track.min_pitch == null && track.max_pitch == null) return '—';
    const lo = track.min_pitch != null ? midiNoteName(track.min_pitch) : '?';
    const hi = track.max_pitch != null ? midiNoteName(track.max_pitch) : '?';
    return lo + '–' + hi;
  }

  return (
    <div>
      {(draft.selectedTrackIds || []).length > 8 ? (
        <Alert variant="info" className="small py-2 mb-2">
          Importing many tracks works best with the <strong>Note events</strong> import strategy on Cleanup.
          Leave <strong>Infer chord symbols</strong> off unless you want a separate chord staff.
        </Alert>
      ) : null}
      <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
        <SelectAllToggle
          size="sm"
          totalCount={pitchedTotal}
          selectedCount={pitchedSelected}
          onSelectAll={selectAllPitched}
          onSelectNone={selectNonePitched}
          ariaLabel="Select all pitched tracks for import"
        />
        <Button size="sm" variant="outline-secondary" onClick={groupSelected}>Group selected</Button>
        <Button size="sm" variant="outline-secondary" onClick={ungroupSelected}>Ungroup</Button>
        <Form.Check
          type="checkbox"
          className="small mb-0"
          label="Hide empty"
          checked={filter.hideEmpty !== false}
          onChange={function(e) {
            updateDraft({
              trackFilter: Object.assign({}, filter, { hideEmpty: e.target.checked }),
            });
          }}
        />
        <Button
          size="sm"
          variant={midiPlaying ? 'danger' : 'outline-success'}
          className={'midi-tracks-play-btn' + (midiPlaying ? ' is-playing' : '')}
          title={midiPlaying ? 'Pause MIDI preview' : 'Play MIDI preview'}
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
          {midiLoading ? <Spinner animation="border" size="sm" /> : icons[midiPlaying ? 'pause' : 'play']}
        </Button>
        <Form.Check
          type="checkbox"
          className="small mb-0 ms-auto"
          label="Show advanced columns"
          checked={!!draft.showAdvancedTracks}
          onChange={function(e) { updateDraft({ showAdvancedTracks: e.target.checked }); }}
        />
      </div>
      <div className="d-flex flex-wrap gap-3 align-items-end mb-2">
        <Form.Group className="mb-0">
          <FormLabelWithHelp
            label="Role filter"
            helpTitle="Track role filter"
            helpBody="Visibility only — hidden tracks stay selected for import. Does not change Import checkboxes."
            className="small mb-0"
          />
          <Form.Select
            size="sm"
            value={filter.role || 'all'}
            onChange={function(e) {
              updateDraft({
                trackFilter: Object.assign({}, filter, { role: e.target.value }),
              });
            }}
          >
            {ROLE_FILTER_OPTIONS.map(function(opt) {
              return <option key={opt.value} value={opt.value}>{opt.label}</option>;
            })}
          </Form.Select>
        </Form.Group>
        <Form.Group className="mb-0">
          <Form.Label className="small mb-0">Min notes</Form.Label>
          <Form.Control
            type="number"
            size="sm"
            style={{ width: 80 }}
            min={0}
            value={filter.minNotes || 0}
            onChange={function(e) {
              updateDraft({
                trackFilter: Object.assign({}, filter, { minNotes: parseInt(e.target.value, 10) || 0 }),
              });
            }}
          />
        </Form.Group>
      </div>
      <Table striped bordered hover size="sm" className="track-map-table">
        <thead>
          <tr>
            <th>Import</th>
            <th>Mute</th>
            <th>Solo</th>
            <th>Name</th>
            <th>Notes</th>
            <th>Role</th>
            <th>Group</th>
            {draft.showAdvancedTracks ? (
              <>
                <th>Ch</th>
                <th>Range</th>
                <th>Staff</th>
                <th>System</th>
                <th>Drums</th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {visibleTracks.map(function(track) {
            const isDrum = !!track.is_drum;
            const isEmpty = (track.note_count || 0) === 0;
            const imported = !isDrum && (draft.selectedTrackIds || []).indexOf(track.index) >= 0;
            const muted = (draft.mutedTrackIds || []).indexOf(track.index) >= 0;
            const solo = (draft.soloTrackIds || []).indexOf(track.index) >= 0;
            const audibleRow = isDrum
              ? (draft.drumTrackModes || {})[track.index] === 'percussion'
              : imported;
            const collapseKey = collapseKeyForTrack(track.index);
            return (
              <tr
                key={'track-' + track.index}
                className={isEmpty ? 'midi-track-row-empty text-muted' : ''}
              >
                <td>
                  {!isDrum ? (
                    <CheckToggleButton
                      size="sm"
                      checked={imported}
                      disabled={isEmpty}
                      ariaLabel={'Import track ' + (track.name || track.index)}
                      onClick={function() { toggleImport(track.index); }}
                    />
                  ) : null}
                </td>
                <td>
                  {audibleRow ? (
                    <CheckToggleButton
                      size="sm"
                      checked={muted}
                      ariaLabel={'Mute track ' + (track.name || track.index)}
                      onClick={function() { toggleMute(track.index); }}
                    />
                  ) : '—'}
                </td>
                <td>
                  {audibleRow ? (
                    <CheckToggleButton
                      size="sm"
                      checked={solo}
                      ariaLabel={'Solo track ' + (track.name || track.index)}
                      onClick={function() { toggleSolo(track.index); }}
                    />
                  ) : '—'}
                </td>
                <td>{displayNameForMidiTrack({
                  id: track.index + 1,
                  name: track.name,
                  program: track.program,
                  isDrum: isDrum,
                  roleHint: track.role_hint,
                })}</td>
                <td>{track.note_count}</td>
                <td>{track.role_hint || 'unknown'}</td>
                <td>{groupLabel(track.index)}</td>
                {draft.showAdvancedTracks ? (
                  <>
                    <td>
                      {!isDrum && imported ? (
                        <Form.Check
                          type="checkbox"
                          checked={!!(draft.collapseChordsByVoice || {})[collapseKey]}
                          aria-label="Collapse chords"
                          onChange={function(e) { setCollapseChords(collapseKey, e.target.checked); }}
                        />
                      ) : '—'}
                    </td>
                    <td>{isDrum ? '—' : pitchRangeLabel(track)}</td>
                    <td>
                      {!isDrum && imported ? (
                        <Form.Select
                          size="sm"
                          value={(draft.trackStaff || {})[track.index] || 'auto'}
                          onChange={function(e) { setTrackStaff(track.index, e.target.value); }}
                        >
                          {STAFF_OPTIONS.map(function(staff) {
                            return <option key={staff} value={staff}>{staff}</option>;
                          })}
                        </Form.Select>
                      ) : '—'}
                    </td>
                    <td>
                      {!isDrum && imported ? (
                        <Form.Select
                          size="sm"
                          value={(draft.trackSystem || {})[track.index] || 'own'}
                          onChange={function(e) { setTrackSystem(track.index, e.target.value); }}
                        >
                          {SYSTEM_OPTIONS.map(function(system) {
                            return <option key={system} value={system}>{system}</option>;
                          })}
                        </Form.Select>
                      ) : '—'}
                    </td>
                    <td>
                      {isDrum ? (
                        <Form.Select
                          size="sm"
                          value={(draft.drumTrackModes || {})[track.index] || 'skip'}
                          onChange={function(e) { setDrumMode(track.index, e.target.value); }}
                        >
                          <option value="skip">Skip</option>
                          <option value="percussion">Percussion</option>
                        </Form.Select>
                      ) : '—'}
                    </td>
                  </>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </Table>
      {resolvedVoices.length ? (
        <div className="midi-resolved-voices">
          <h6 className="mb-2">Import voices</h6>
          <Table striped bordered size="sm">
            <thead>
              <tr>
                <th>Voice</th>
                <th>Staff</th>
                <th>System</th>
              </tr>
            </thead>
            <tbody>
              {resolvedVoices.map(function(voice) {
                const key = voice.voiceKey;
                return (
                  <tr key={'voice-' + key}>
                    <td>{voice.displayName}</td>
                    <td>
                      <Form.Select
                        size="sm"
                        value={(draft.trackStaff || {})[key] || voice.staff || 'auto'}
                        onChange={function(e) { setTrackStaff(key, e.target.value); }}
                      >
                        {STAFF_OPTIONS.map(function(staff) {
                          return <option key={staff} value={staff}>{staff}</option>;
                        })}
                      </Form.Select>
                    </td>
                    <td>
                      <Form.Select
                        size="sm"
                        value={(draft.trackSystem || {})[key] || voice.system || 'own'}
                        onChange={function(e) { setTrackSystem(key, e.target.value); }}
                      >
                        {SYSTEM_OPTIONS.map(function(system) {
                          return <option key={system} value={system}>{system}</option>;
                        })}
                      </Form.Select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}

function TransportButtonGroup(props) {
  const playback = props.playback;
  const abc = props.abc || '';
  const label = props.label;
  const disabled = props.disabled;
  const midiPlayback = props.midiPlayback;
  const midiPlaying = props.midiPlaying;
  const onMidiToggle = props.onMidiToggle;
  const midiDisabled = props.midiDisabled;

  const onPlayToggle = props.onPlayToggle;

  return (
    <ButtonGroup size="sm" className="midi-transport-group">
      <Button
        variant="outline-secondary"
        title={'Rewind ' + label}
        disabled={disabled || (midiPlayback ? midiDisabled : (!abc || playback.loading))}
        onClick={function() {
          if (midiPlayback) {
            midiPlayback.stop();
            if (props.onMidiEnded) props.onMidiEnded();
          } else {
            playback.rewind(abc);
          }
        }}
      >
        {icons.rewind}
      </Button>
      <Button variant="outline-secondary" disabled className="midi-transport-label">{label}</Button>
      <Button
        variant="outline-secondary"
        title={midiPlayback
          ? (midiPlaying ? 'Pause ' + label : 'Play ' + label)
          : (playback.isPlaying ? 'Pause ' + label : 'Play ' + label)}
        disabled={disabled || (midiPlayback ? midiDisabled : (!abc || playback.loading))}
        onClick={function() {
          if (typeof onPlayToggle === 'function') {
            onPlayToggle();
            return;
          }
          if (midiPlayback && onMidiToggle) onMidiToggle();
          else playback.togglePlay(abc);
        }}
      >
        {midiPlayback && props.midiLoading ? (
          <Spinner animation="border" size="sm" />
        ) : icons[(midiPlayback ? midiPlaying : playback.isPlaying) ? 'pause' : 'play']}
      </Button>
    </ButtonGroup>
  );
}

function CleanupStep(props) {
  const draft = props.draft;
  const cleanup = draft.cleanupOptions || defaultCleanupOptions();
  const tempo = draft.tempoBpm || (draft.profile && draft.profile.tempo_bpm) || 120;
  const meter = draft.timeSignature || (draft.profile && draft.profile.time_signature) || '4/4';
  const beatsPerBar = gridBeatsPerBarFromMeter(meter);
  const slotsPerBeat = draft.quantSlotsPerBeat || slotsPerBeatFromRhythmDetail(draft.rhythmDetail || 'standard');
  const noteLength = draft.noteLength || noteLengthFromRhythmDetail(draft.rhythmDetail || 'standard');
  const quantStrength = draft.quantStrength != null ? draft.quantStrength : 0.7;
  const audible = useMemo(function() { return audibleTrackIds(draft); }, [draft]);
  const [midiPlaying, setMidiPlaying] = useState(false);
  const [midiLoading, setMidiLoading] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitTrackId, setSplitTrackId] = useState(null);
  const abcPlayback = useAbcPreviewSynth();

  const midiPlayback = useMidiFilePlayback({
    audibleTrackIds: audible,
    onLoading: setMidiLoading,
    onEnded: function() { setMidiPlaying(false); },
  });

  useEffect(function() {
    if (!draft.midiBytes) return undefined;
    setMidiPlaying(false);
    midiPlayback.init(midiArrayBuffer(draft.midiBytes));
    return function() {
      midiPlayback.stop();
      setMidiPlaying(false);
    };
  }, [draft.midiBytes, draft.fileName]);

  const rawVoices = useMemo(function() {
    return resolveImportVoiceNotes(draft);
  }, [draft]);

  const previewVoices = useMemo(function() {
    return rawVoices.map(function(voice) {
      const cleaned = applyMidiCleanup(voice.notes, cleanup, tempo);
      return Object.assign({}, voice, { notes: cleaned.notes });
    });
  }, [rawVoices, cleanup, tempo]);

  const voiceStats = useMemo(function() {
    return rawVoices.map(function(voice) {
      const cleaned = applyMidiCleanup(voice.notes, cleanup, tempo);
      return {
        name: voice.displayName,
        before: voice.notes.length,
        after: cleaned.notes.length,
      };
    });
  }, [rawVoices, cleanup, tempo]);

  const interpretedAbc = useMemo(function() {
    if (!previewVoices.length) return '';
    return buildCleanupScorePreviewAbc(previewVoices, {
      tempoBpm: tempo,
      meter: meter,
      key: draft.estimatedKey || (draft.profile && draft.profile.estimated_key) || 'C',
      beatsPerBar: beatsPerBar,
      slotsPerBeat: slotsPerBeat,
      noteLength: noteLength,
      quantStrength: quantStrength,
    });
  }, [previewVoices, tempo, meter, draft.estimatedKey, draft.profile, beatsPerBar, slotsPerBeat, noteLength, quantStrength]);

  function updateDraft(patch) {
    props.onChange(Object.assign({}, draft, patch, { previewResult: null }));
  }

  function updateCleanup(patch) {
    updateDraft({
      cleanupOptions: Object.assign({}, cleanup, patch),
      cleanupSkipped: false,
    });
  }

  function applyPreset(presetKey) {
    if (!presetKey || !CLEANUP_PRESETS[presetKey]) return;
    updateDraft({
      cleanupOptions: Object.assign({}, CLEANUP_PRESETS[presetKey]),
      cleanupSkipped: false,
    });
  }

  function openSplitDialog() {
    const candidates = importCheckedPitchedIds(draft).filter(function(trackId) {
      return !(draft.splitVoices && draft.splitVoices[trackId]);
    });
    if (!candidates.length) {
      toast.info('Select a pitched track that is not already split.');
      return;
    }
    setSplitTrackId(candidates[0]);
    setSplitOpen(true);
  }

  const splitVoice = splitTrackId != null
    ? rawVoices.find(function(v) {
      return v.sourceIds && v.sourceIds.length === 1 && v.sourceIds[0] === splitTrackId && !v.splitHalf;
    })
    : null;

  return (
    <div className="midi-cleanup-step d-flex flex-column flex-grow-1 min-h-0">
      <div className="row g-3 mb-2">
        <div className="col-md-3">
          <Form.Group>
            <Form.Label>Mode</Form.Label>
            <Form.Select value={draft.mode} onChange={function(e) { updateDraft({ mode: e.target.value }); }}>
              <option value="melody">Melody only</option>
              <option value="multi_voice">Multi-voice</option>
            </Form.Select>
          </Form.Group>
        </div>
        <div className="col-md-3">
          <Form.Group>
            <Form.Label>Import strategy</Form.Label>
            <Form.Select value={draft.strategy} onChange={function(e) { updateDraft({ strategy: e.target.value }); }}>
              <option value="auto">Auto</option>
              <option value="note_events">Note events</option>
              <option value="musicxml">MusicXML</option>
              <option value="musescore">MuseScore</option>
            </Form.Select>
          </Form.Group>
        </div>
        <div className="col-md-3">
          <Form.Group>
            <FormLabelWithHelp
              label="Rhythm detail"
              helpTitle={MIDI_CLEANUP_FIELD_HELP.rhythmDetail.title}
              helpBody={MIDI_CLEANUP_FIELD_HELP.rhythmDetail.body}
            />
            <Form.Select
              value={draft.rhythmDetail || 'standard'}
              onChange={function(e) {
                const detail = e.target.value;
                updateDraft({
                  rhythmDetail: detail,
                  quantSlotsPerBeat: slotsPerBeatFromRhythmDetail(detail),
                  noteLength: noteLengthFromRhythmDetail(detail),
                });
              }}
            >
              <option value="simple">Simple (quarters &amp; halves)</option>
              <option value="standard">Standard (eighths &amp; triplets)</option>
              <option value="detailed">Detailed (sixteenths)</option>
            </Form.Select>
          </Form.Group>
        </div>
        <div className="col-md-3">
          <Form.Group>
            <FormLabelWithHelp
              label={'Quantize strength (' + Math.round(quantStrength * 100) + '%)'}
              helpTitle={MIDI_CLEANUP_FIELD_HELP.quantStrength.title}
              helpBody={MIDI_CLEANUP_FIELD_HELP.quantStrength.body}
            />
            <Form.Range
              min={0}
              max={100}
              value={Math.round(quantStrength * 100)}
              onChange={function(e) {
                updateDraft({ quantStrength: parseInt(e.target.value, 10) / 100 });
              }}
            />
          </Form.Group>
        </div>
        <div className="col-md-4">
          <Form.Check
            type="checkbox"
            label="Infer chord symbols"
            checked={!!draft.includeChords}
            onChange={function(e) { updateDraft({ includeChords: e.target.checked }); }}
          />
          <Form.Text className="text-muted">
            Adds a chord staff. Usually off for multi-track orchestral imports.
          </Form.Text>
        </div>
        <div className="col-md-4">
          <Form.Group>
            <Form.Label>Cleanup preset</Form.Label>
            <Form.Select size="sm" defaultValue="" onChange={function(e) { applyPreset(e.target.value); }}>
              <option value="">Custom</option>
              {Object.keys(CLEANUP_PRESETS).map(function(key) {
                return (
                  <option key={key} value={key}>{CLEANUP_PRESET_LABELS[key] || key}</option>
                );
              })}
            </Form.Select>
          </Form.Group>
        </div>
        <div className="col-md-4 d-flex align-items-end">
          <Button size="sm" variant="outline-secondary" onClick={openSplitDialog}>
            Split tracks…
          </Button>
        </div>
      </div>
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
            label="Velocity max"
            helpTitle={MIDI_CLEANUP_FIELD_HELP.velocityMax.title}
            helpBody={MIDI_CLEANUP_FIELD_HELP.velocityMax.body}
          />
          <Form.Range min={0} max={127} value={cleanup.velocityMax}
            onChange={function(e) { updateCleanup({ velocityMax: parseInt(e.target.value, 10) }); }} />
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
            label="Max duration (ms)"
            helpTitle={MIDI_CLEANUP_FIELD_HELP.maxDurationMs.title}
            helpBody={MIDI_CLEANUP_FIELD_HELP.maxDurationMs.body}
          />
          <Form.Control type="number" min={0} size="sm" style={{ width: 90 }}
            value={cleanup.maxDurationMs}
            onChange={function(e) { updateCleanup({ maxDurationMs: parseFloat(e.target.value) || 0 }); }} />
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
            label="Pitch min"
            helpTitle={MIDI_CLEANUP_FIELD_HELP.pitchMin.title}
            helpBody={MIDI_CLEANUP_FIELD_HELP.pitchMin.body}
          />
          <Form.Control type="number" min={0} max={127} size="sm" style={{ width: 72 }}
            value={cleanup.pitchMin}
            onChange={function(e) { updateCleanup({ pitchMin: parseInt(e.target.value, 10) || 0 }); }} />
        </Form.Group>
        <Form.Group>
          <FormLabelWithHelp
            label="Pitch max"
            helpTitle={MIDI_CLEANUP_FIELD_HELP.pitchMax.title}
            helpBody={MIDI_CLEANUP_FIELD_HELP.pitchMax.body}
          />
          <Form.Control type="number" min={0} max={127} size="sm" style={{ width: 72 }}
            value={cleanup.pitchMax}
            onChange={function(e) { updateCleanup({ pitchMax: parseInt(e.target.value, 10) || 127 }); }} />
        </Form.Group>
        <Form.Group>
          <Form.Check
            type="checkbox"
            className="mt-4"
            label="Keep polyphonic chords"
            checked={cleanup.keepPolyphonicChords !== false}
            onChange={function(e) { updateCleanup({ keepPolyphonicChords: e.target.checked }); }}
          />
        </Form.Group>
        <Form.Group>
          <Form.Check
            type="checkbox"
            className="mt-4"
            label="Sustain trim"
            checked={!!cleanup.sustainTrim}
            onChange={function(e) { updateCleanup({ sustainTrim: e.target.checked }); }}
          />
        </Form.Group>
      </div>
      {voiceStats.length ? (
        <div className="small text-muted mb-2">
          {voiceStats.map(function(stat, index) {
            return (
              <span key={'stat-' + index} className="me-3">
                {stat.name}: {stat.before} → {stat.after}
              </span>
            );
          })}
        </div>
      ) : null}
      <div className="midi-import-preview-playback mb-2 d-flex flex-wrap gap-2 align-items-center">
        <TransportButtonGroup
          label="Original"
          playback={abcPlayback}
          midiPlayback={midiPlayback}
          midiPlaying={midiPlaying}
          midiLoading={midiLoading}
          midiDisabled={!draft.midiBytes || midiLoading}
          onMidiToggle={async function() {
            if (midiPlaying) {
              midiPlayback.pause();
              setMidiPlaying(false);
            } else {
              abcPlayback.pause();
              const started = await midiPlayback.start();
              setMidiPlaying(!!started);
            }
          }}
          onMidiEnded={function() { setMidiPlaying(false); }}
        />
        <TransportButtonGroup
          label="Interpreted"
          playback={abcPlayback}
          abc={interpretedAbc}
          disabled={!interpretedAbc}
          onPlayToggle={async function() {
            if (midiPlaying) {
              midiPlayback.pause();
              setMidiPlaying(false);
            }
            await abcPlayback.togglePlay(interpretedAbc);
          }}
        />
        {abcPlayback.error ? <span className="text-danger small">{abcPlayback.error}</span> : null}
      </div>
      <div className="midi-cleanup-preview-panel flex-grow-1 min-h-0">
        <MidiCleanupNotationOverlay
          voices={previewVoices}
          tempoBpm={tempo}
          meter={meter}
          key={draft.estimatedKey || (draft.profile && draft.profile.estimated_key) || 'C'}
          beatsPerBar={beatsPerBar}
          slotsPerBeat={slotsPerBeat}
          noteLength={noteLength}
          quantStrength={quantStrength}
        />
      </div>
      <MidiSplitTracksDialog
        show={splitOpen}
        notes={(splitVoice && splitVoice.notes) || []}
        initialPitch={(draft.splitVoices && splitTrackId != null && draft.splitVoices[splitTrackId]
          && draft.splitVoices[splitTrackId].pitch) || 60}
        voiceName={splitVoice && splitVoice.displayName}
        tempoBpm={tempo}
        meter={meter}
        keySig={draft.estimatedKey || 'C'}
        beatsPerBar={beatsPerBar}
        slotsPerBeat={slotsPerBeat}
        noteLength={noteLength}
        quantStrength={quantStrength}
        onHide={function() { setSplitOpen(false); }}
        onConfirm={function(pitch) {
          setSplitOpen(false);
          props.onSplitApplied(applyPitchSplitToDraft(draft, splitTrackId, pitch));
        }}
      />
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
    return resolveWizardImportAbc(result, draft, props.abcjsParser);
  }, [result, draft, props.abcjsParser]);

  if (props.loading && !result) {
    return (
      <div className="text-center py-4">
        <Spinner animation="border" /> Generating preview…
      </div>
    );
  }

  if (!result && !previewAbc) {
    return <div className="text-muted">Continue from Cleanup to generate preview.</div>;
  }

  return (
    <div>
      {result ? (
        <div className="small mb-2">
          Strategy: {result.strategy} · Mode: {result.mode}
          {typeof result.confidence === 'number'
            ? ' · Confidence: ' + Math.round(result.confidence * 100) + '%'
            : ''}
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

function WizardHelpModal(props) {
  const help = MIDI_IMPORT_WIZARD_HELP;
  return (
    <Modal show={props.show} onHide={props.onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>{help.title}</Modal.Title>
      </Modal.Header>
      <Modal.Body className="midi-import-help-body">
        <p>{help.overview}</p>
        <Accordion alwaysOpen>
          {(help.sections || []).map(function(section, index) {
            return (
              <Accordion.Item eventKey={String(index)} key={'help-' + index}>
                <Accordion.Header>{section.title}</Accordion.Header>
                <Accordion.Body>{section.body}</Accordion.Body>
              </Accordion.Item>
            );
          })}
        </Accordion>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={props.onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  );
}

export default function MidiImportWizard(props) {
  const show = !!props.show;
  const [activeStep, setActiveStep] = useState('tracks');
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
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
    const pending = props.pendingMidi || {};
    const hasPendingFile = !!(pending.bytes || pending.file);
    setActiveStep(hasPendingFile ? 'tracks' : 'select');
    setError('');
    setLoading(true);

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
        if (!profile || !Array.isArray(profile.tracks) || !profile.tracks.length) {
          throw new Error((profile && profile.reject_reason) || 'This MIDI file has no tracks');
        }
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
    setHelpOpen(false);
    if (props.onClose) props.onClose();
  }

  async function generatePreviewResult(working) {
    const hasSplits = working.splitVoices && Object.keys(working.splitVoices).length > 0;
    if (hasSplits) {
      return buildLocalMidiImportResult(working);
    }
    try {
      const importOpts = buildImportOptionsFromDraft(working);
      return await importMidiToAbc(
        working.midiBytes,
        working.fileName,
        props.accessToken,
        importOpts
      );
    } catch (e) {
      const local = buildLocalMidiImportResult(working);
      if (!local.abc) throw e;
      return local;
    }
  }

  async function runPreview(currentDraft) {
    const working = currentDraft || draft;
    if (!working) return;
    setLoading(true);
    setError('');
    try {
      const result = await generatePreviewResult(working);
      setDraft(function(prev) {
        return Object.assign({}, prev || working, { previewResult: result });
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
        result = await generatePreviewResult(draft);
        setDraft(function(prev) {
          return Object.assign({}, prev, { previewResult: result });
        });
      }
      if (!result) {
        throw new Error('Preview not available');
      }
      let abc = resolveWizardImportAbc(result, draft, props.abcjsParser);
      const candidates = abcTextToCandidates(abc, props.tunebook, props.book).map(function(c) {
        c.sourceKind = 'midi';
        c.abc = abc;
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
    if (creditAffordance.blocked && (activeStep === 'cleanup' || activeStep === 'preview')) {
      setError(creditMessage || 'Insufficient resolver credit for MIDI import.');
      return;
    }
    if (activeStep === 'select') {
      setActiveStep('tracks');
      return;
    }
    if (activeStep === 'tracks') {
      setActiveStep('cleanup');
      return;
    }
    if (activeStep === 'cleanup') {
      runPreview(draft);
      return;
    }
    if (activeStep === 'preview') {
      handleFinish();
    }
  }

  const stepIndex = STEPS.findIndex(function(s) { return s.key === activeStep; });
  const showStickyStrip = draft && activeStep !== 'select';

  const wizardActions = (
    <div className="midi-import-wizard-actions d-flex flex-wrap gap-2 align-items-center justify-content-end">
      <Button variant="secondary" size="sm" onClick={handleClose} disabled={loading}>Cancel</Button>
      {stepIndex > 0 ? (
        <Button variant="outline-secondary" size="sm" disabled={loading} onClick={function() {
          setActiveStep(STEPS[stepIndex - 1].key);
        }}>Back</Button>
      ) : null}
      <Button
        variant="primary"
        size="sm"
        disabled={loading || !draft || (creditAffordance.blocked && (activeStep === 'cleanup' || activeStep === 'preview'))}
        onClick={handleContinue}
      >
        {loading ? <Spinner animation="border" size="sm" /> : null}
        {activeStep === 'preview' ? 'Import' : 'Continue'}
      </Button>
    </div>
  );

  return (
    <>
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
                    disabled={!draft || index > stepIndex + 1}
                    onClick={function() { setActiveStep(step.key); }}
                  >
                    {index + 1}. {step.title}
                  </Button>
                );
              })}
              <Button
                size="sm"
                variant="outline-secondary"
                className="ms-1"
                onClick={function() { setHelpOpen(true); }}
                aria-label="MIDI import help"
              >
                ?
              </Button>
            </div>
            {wizardActions}
          </div>
          {showStickyStrip ? (
            <StickyGridStrip draft={draft} onChange={setDraft} />
          ) : null}
          <div className="midi-import-wizard-step-content">
            {loading && !draft ? (
              <div className="text-center py-4"><Spinner animation="border" /> Analyzing MIDI…</div>
            ) : null}
            {error ? <Alert variant="danger">{error}</Alert> : null}
            {creditAffordance.blocked && creditMessage && !error ? (
              <Alert variant="warning">{creditMessage}</Alert>
            ) : null}
            {draft && activeStep === 'select' ? (
              <SelectStep
                draft={draft}
                accessToken={props.accessToken}
                onChange={setDraft}
                onReplaced={function() { setActiveStep('tracks'); }}
              />
            ) : null}
            {draft && activeStep === 'tracks' ? (
              <TracksStep draft={draft} onChange={setDraft} />
            ) : null}
            {draft && activeStep === 'cleanup' ? (
              <CleanupStep
                draft={draft}
                onChange={setDraft}
                onSplitApplied={function(nextDraft) {
                  setDraft(nextDraft);
                  setActiveStep('tracks');
                }}
              />
            ) : null}
            {draft && activeStep === 'preview' ? (
              <PreviewStep draft={draft} abcjsParser={props.abcjsParser} loading={loading} />
            ) : null}
          </div>
        </Modal.Body>
      </Modal>
      <WizardHelpModal show={helpOpen} onHide={function() { setHelpOpen(false); }} />
    </>
  );
}
