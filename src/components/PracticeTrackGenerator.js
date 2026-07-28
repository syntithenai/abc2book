import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, Modal, ProgressBar } from 'react-bootstrap';
import { toast } from 'react-toastify';
import {
  buildPracticeTrackRequestPayload,
  buildTimingSongPlan,
  refineTimingFromMelodyDuration,
  timingPlanHasBlockingWarnings,
  timingPlanNeedsAcknowledgement,
} from '../timingSongPlanExtractor';
import { renderAbcToAudioBuffer } from '../notationAudioExport';
import { encodeAudioBufferToWav } from '../encodeAudioBufferToWav';
import {
  downloadPracticeTrackAudio,
  startPracticeTrackGeneration,
  waitForPracticeTrackJob,
} from '../musicGenerationClient';
import { createAttachedAudioLink } from '../linkRecording';
import useMediaResolverHealth from '../useMediaResolverHealth';
import useAbcjsParser from '../useAbcjsParser';
import { getPracticeTrackAccess, getPracticeTrackGenerateLabel } from '../practiceTrackAccess';
import { resolveResolverAccessToken } from '../resolverAccessToken';
import { extractChordsPerBar, renderChordLayerWav } from '../practiceTrackChordLayer';
import {
  buildPracticeTrackMidiScore,
  downloadMidiScore,
  midiScoreToBlob,
} from '../practiceTrackMidiScore';
import {
  DEFAULT_RENDER_STYLE,
  getStylePreset,
  listStylePresetOptions,
} from '../practiceTrackStylePresets';

function formatSeconds(value) {
  const sec = Math.max(0, parseFloat(value) || 0);
  return sec.toFixed(1) + 's';
}

export default function PracticeTrackGenerator(props) {
  const tune = props.tune;
  const tunebook = props.tunebook;
  const token = props.token;
  const login = props.login;
  const onTuneChange = props.onTuneChange;

  const abcjsParser = useAbcjsParser({ tunebook: tunebook });
  const { available, checked, status, features, refreshMediaResolverHealth } = useMediaResolverHealth();
  const access = useMemo(function() {
    return getPracticeTrackAccess({
      resolverChecked: checked,
      resolverAvailable: available,
      resolverStatus: status,
      features: features,
      accessToken: token,
    });
  }, [checked, available, status, features, token]);

  useEffect(function() {
    if (!checked) return undefined;
    const timer = setInterval(function() {
      refreshMediaResolverHealth(token);
    }, 30000);
    return function() {
      clearInterval(timer);
    };
  }, [checked, token, refreshMediaResolverHealth]);
  const resolvedToken = resolveResolverAccessToken(token);

  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [backingPrompt, setBackingPrompt] = useState('');
  const [renderStyle, setRenderStyle] = useState(DEFAULT_RENDER_STYLE);
  const [melodySource, setMelodySource] = useState('notation_midi');
  const [includeDrumGuide, setIncludeDrumGuide] = useState(true);
  const [ackBarEstimate, setAckBarEstimate] = useState(false);
  const [validation, setValidation] = useState(null);
  const [melodyBlob, setMelodyBlob] = useState(null);
  const [chordsBlob, setChordsBlob] = useState(null);
  const [scoreMidiBytes, setScoreMidiBytes] = useState(null);
  const [includeChordLayer, setIncludeChordLayer] = useState(false);
  const [pendingGenerate, setPendingGenerate] = useState(false);
  const [pendingRegenerateBacking, setPendingRegenerateBacking] = useState(false);

  const styleOptions = useMemo(function() {
    return listStylePresetOptions();
  }, []);

  const abc = useMemo(function() {
    if (!tune || !tunebook || !tunebook.abcTools) return '';
    return tunebook.abcTools.json2abc(tune);
  }, [tune, tunebook]);

  const plan = useMemo(function() {
    if (!tune || !abc) return null;
    try {
      return buildTimingSongPlan(tune, abc, {
        abcTools: tunebook && tunebook.abcTools ? tunebook.abcTools : null,
        abcjsParser: abcjsParser,
        tunebook: tunebook,
        forPracticeTrack: true,
      });
    } catch (err) {
      return null;
    }
  }, [tune, abc, tunebook, abcjsParser]);

  useEffect(function() {
    if (plan && plan.backingPrompt) {
      setBackingPrompt(plan.backingPrompt);
    }
    if (plan) {
      setIncludeChordLayer(false);
      setRenderStyle(plan.renderStyle || DEFAULT_RENDER_STYLE);
      setIncludeDrumGuide(plan.includeDrumGuide !== false);
    }
  }, [plan]);

  const openModal = useCallback(function() {
    setError('');
    setValidation(null);
    setMelodyBlob(null);
    setChordsBlob(null);
    setScoreMidiBytes(null);
    setAckBarEstimate(false);
    setShowModal(true);
  }, []);

  const runGeneration = useCallback(async function(regenerateBackingOnly) {
    if (!plan) {
      setError('Could not build timing plan for this tune.');
      return;
    }
    if (timingPlanHasBlockingWarnings(plan) && !window.confirm(
      'This tune has notation structure errors. Generate anyway?'
    )) {
      return;
    }
    if (timingPlanNeedsAcknowledgement(plan) && !ackBarEstimate) {
      setError('Timing is estimated from bar count. Check the acknowledgement box to continue.');
      return;
    }

    setBusy(true);
    setError('');
    setProgress(5);
    setStatusMessage('Building MIDI score…');

    try {
      let melody = melodyBlob;
      let chords = chordsBlob;
      let scoreBytes = scoreMidiBytes;
      let activePlan = plan;
      if (!regenerateBackingOnly || !melody) {
        setStatusMessage('Building canonical MIDI score…');
        const midiScore = buildPracticeTrackMidiScore(tune, tunebook, plan);
        scoreBytes = midiScore.midiBytes;
        setScoreMidiBytes(scoreBytes);

        setStatusMessage('Rendering melody from notation…');
        const melodyAbc = melodySource === 'notation_midi'
          ? midiScore.abc
          : abc;
        const buffer = await renderAbcToAudioBuffer(melodyAbc, {
          chordsOff: melodySource !== 'notation_midi',
          tune: tune,
        });
        melody = encodeAudioBufferToWav(buffer);
        setMelodyBlob(melody);
        activePlan = refineTimingFromMelodyDuration(plan, buffer.duration);

        if (includeChordLayer && plan.includeChordLayer) {
          setStatusMessage('Rendering chord layer…');
          const chordsPerBar = extractChordsPerBar(tune, tunebook, abcjsParser);
          if (chordsPerBar.length) {
            chords = await renderChordLayerWav(tune, chordsPerBar);
            setChordsBlob(chords);
          } else {
            chords = null;
            setChordsBlob(null);
          }
        } else {
          chords = null;
          setChordsBlob(null);
        }
      }

      setProgress(15);
      setStatusMessage('Starting AI arrangement…');
      const stylePreset = getStylePreset(renderStyle);
      const payload = buildPracticeTrackRequestPayload(activePlan, {
        backingPrompt: renderStyle === 'custom' ? backingPrompt : undefined,
        renderStyle: renderStyle,
        melodySource: melodySource,
        includeChordLayer: includeChordLayer && !!chords,
        includeDrumGuide: includeDrumGuide && stylePreset.includeDrumGuideDefault,
        acknowledgeBarEstimate: activePlan.timing.source !== 'bar-estimate',
      });
      const started = await startPracticeTrackGeneration(payload, melody, {
        token: token,
        chordsBlob: includeChordLayer ? chords : null,
        scoreBlob: scoreBytes ? midiScoreToBlob(scoreBytes) : null,
      });

      setProgress(25);
      setStatusMessage('Generating styled backing…');
      const job = await waitForPracticeTrackJob(started.jobId, {
        token: token,
        intervalMs: 1200,
        onProgress: function(jobStatus) {
          if (jobStatus && typeof jobStatus.progress === 'number') {
            setProgress(Math.max(25, Math.min(90, jobStatus.progress)));
          }
          if (jobStatus && jobStatus.message) {
            setStatusMessage(jobStatus.message);
          }
        },
      });

      setValidation(Object.assign({}, job.validation || {}, {
        mix: job.mix || null,
        stems: job.stems || null,
      }));
      setProgress(95);
      setStatusMessage('Downloading mix…');
      const audioBlob = await downloadPracticeTrackAudio(job.audioUrl, {
        token: token,
        jobId: job.jobId || started.jobId,
      });

      const file = new File([audioBlob], (tune.name || 'practice-track') + '.wav', {
        type: 'audio/wav',
      });
      const linkResult = await createAttachedAudioLink({
        file: file,
        title: (tune.name || 'Practice track') + ' (AI arrangement)',
        tune: tune,
        token: token,
        uploadToDrive: false,
      });

      if (onTuneChange && linkResult && linkResult.link) {
        const updated = Object.assign({}, tune, {
          links: (Array.isArray(tune.links) ? tune.links : []).concat([linkResult.link]),
        });
        onTuneChange(updated);
      }

      toast.success('Practice track attached to tune.');
      setShowModal(false);
    } catch (err) {
      setError(err && err.message ? err.message : 'Practice track generation failed.');
    } finally {
      setBusy(false);
      setProgress(0);
      setStatusMessage('');
    }
  }, [
    plan,
    ackBarEstimate,
    melodyBlob,
    chordsBlob,
    scoreMidiBytes,
    includeChordLayer,
    includeDrumGuide,
    melodySource,
    renderStyle,
    abcjsParser,
    tunebook,
    backingPrompt,
    token,
    tune,
    abc,
    onTuneChange,
  ]);

  useEffect(function() {
    if (!pendingGenerate && !pendingRegenerateBacking) return undefined;
    if (!access.canGenerate || !resolvedToken) return undefined;
    const regenerateBackingOnly = pendingRegenerateBacking;
    setPendingGenerate(false);
    setPendingRegenerateBacking(false);
    runGeneration(regenerateBackingOnly);
    return undefined;
  }, [
    pendingGenerate,
    pendingRegenerateBacking,
    access.canGenerate,
    resolvedToken,
    runGeneration,
  ]);

  const requestLoginForGeneration = useCallback(function(regenerateBackingOnly) {
    if (typeof login !== 'function') {
      setError('Log in to generate practice tracks');
      return;
    }
    if (regenerateBackingOnly) {
      setPendingRegenerateBacking(true);
    } else {
      setPendingGenerate(true);
    }
    login().catch(function() {
      setPendingGenerate(false);
      setPendingRegenerateBacking(false);
    });
  }, [login]);

  const handleGenerateClick = useCallback(function(regenerateBackingOnly) {
    if (access.needsLogin) {
      requestLoginForGeneration(regenerateBackingOnly);
      return;
    }
    runGeneration(regenerateBackingOnly);
  }, [access.needsLogin, requestLoginForGeneration, runGeneration]);

  const handleDownloadScore = useCallback(function() {
    try {
      const bytes = scoreMidiBytes || buildPracticeTrackMidiScore(tune, tunebook, plan).midiBytes;
      downloadMidiScore(bytes, (tune && tune.name ? tune.name : 'score') + '.mid');
    } catch (err) {
      setError(err && err.message ? err.message : 'Could not export MIDI score.');
    }
  }, [scoreMidiBytes, tune, tunebook, plan]);

  if (!access.showButton || !tune || !abc) return null;

  return (
    <>
      <Button
        variant="outline-primary"
        style={{ marginLeft: '0.5em' }}
        onClick={openModal}
        title="Practice track: notation MIDI guides a styled AI full-band render"
      >
        Practice track
      </Button>

      <Modal show={showModal} onHide={function() { if (!busy) setShowModal(false); }} size="lg">
        <Modal.Header closeButton={!busy}>
          <Modal.Title>Generate practice track</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {plan ? (
            <>
              <p>
                Your tune is played accurately on the <strong>style lead instrument</strong> (from notation MIDI via FluidSynth).
                AI generates <strong>accompaniment only</strong> — no piano fill, no invented lead melody.
              </p>
              <p className="mb-2">
                Length <strong>{formatSeconds(plan.timing.totalDurationSec)}</strong>
                {' '}at {Math.round(plan.timing.tempoBpm)} BPM ({plan.timing.source} timing).
              </p>
              {plan.structureErrors && plan.structureErrors.length > 0 && (
                <Alert variant="danger">
                  {plan.structureErrors.map(function(msg, index) {
                    return <div key={index}>{msg}</div>;
                  })}
                </Alert>
              )}
              {plan.structureWarnings.length > 0 && (
                <Alert variant="warning">
                  {plan.structureWarnings.map(function(msg, index) {
                    return <div key={index}>{msg}</div>;
                  })}
                </Alert>
              )}
              {timingPlanNeedsAcknowledgement(plan) && (
                <Form.Check
                  type="checkbox"
                  label="I understand timing is estimated from bar count (abcjs render unavailable)."
                  checked={ackBarEstimate}
                  onChange={function(e) { setAckBarEstimate(e.target.checked); }}
                  disabled={busy}
                />
              )}
              <Form.Group className="mb-3">
                <Form.Label>Style</Form.Label>
                <Form.Select
                  value={renderStyle}
                  onChange={function(e) { setRenderStyle(e.target.value); }}
                  disabled={busy}
                >
                  {styleOptions.map(function(option) {
                    return (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    );
                  })}
                </Form.Select>
                <Form.Text muted>
                  {getStylePreset(renderStyle).description}
                </Form.Text>
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Melody source</Form.Label>
                <Form.Select
                  value={melodySource}
                  onChange={function(e) { setMelodySource(e.target.value); }}
                  disabled={busy}
                >
                  <option value="notation_midi">Notation MIDI (default)</option>
                  <option value="soundfont">Legacy soundfont (melody only)</option>
                </Form.Select>
              </Form.Group>
              {false && plan.includeChordLayer && (
                <Form.Check
                  type="checkbox"
                  className="mb-2"
                  label="Include chord layer from the tune chart"
                  checked={includeChordLayer}
                  onChange={function(e) { setIncludeChordLayer(e.target.checked); }}
                  disabled={busy}
                />
              )}
              <Form.Check
                type="checkbox"
                className="mb-3"
                label="Include beat-locked MIDI drum guide (recommended)"
                checked={includeDrumGuide}
                onChange={function(e) { setIncludeDrumGuide(e.target.checked); }}
                disabled={busy}
              />
              {renderStyle === 'custom' && (
                <Form.Group className="mb-3">
                  <Form.Label>Custom backing prompt</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    value={backingPrompt}
                    onChange={function(e) { setBackingPrompt(e.target.value); }}
                    disabled={busy}
                  />
                </Form.Group>
              )}
              <div className="mb-3">
                <Button
                  variant="outline-secondary"
                  size="sm"
                  disabled={busy}
                  onClick={handleDownloadScore}
                >
                  Download score.mid
                </Button>
              </div>
              <div style={{ fontSize: '0.9em', color: '#666' }}>
                Strains: {plan.structure.map(function(section) {
                  return section.strainLabel + ' (' + formatSeconds(section.durationSec) + ')';
                }).join(', ')}
              </div>
              {validation && (
                <Alert variant="info" className="mt-3">
                  {validation.stretchNotes && validation.stretchNotes.length > 0
                    ? validation.stretchNotes.join('; ')
                    : 'Timing validation complete.'}
                  {validation.sectional ? ' Sectional backing stitched.' : ''}
                  {validation.loopDurationSec
                    ? (' Loop tile ~' + formatSeconds(validation.loopDurationSec) + '.')
                    : ''}
                  {validation.styleMelodyStem || (validation.stems && validation.stems.styleMelodyStem)
                    ? ' Style lead from notation MIDI.'
                    : ' AI accompaniment only (FluidSynth melody stem unavailable).'}
                  {validation.mix && validation.mix.chordLayer ? ' Chord layer included.' : ''}
                  {validation.mix && validation.mix.drumGuide ? ' Drum guide included.' : ''}
                  {validation.stems ? (
                    <div className="mt-1">
                      Stems: {validation.stems.arrangement ? 'AI arrangement' : 'backing'}
                      {validation.stems.melody ? ', notation melody' : ''}
                      {validation.stems.chords ? ', chords' : ''}
                      {validation.stems.drumGuide ? ', drum guide' : ''}
                      {validation.stems.scoreMid ? ', score.mid (guide)' : ''}
                    </div>
                  ) : null}
                </Alert>
              )}
            </>
          ) : (
            <Alert variant="danger">Could not analyze tune structure.</Alert>
          )}
          {error && <Alert variant="danger" className="mt-2">{error}</Alert>}
          {busy && (
            <div className="mt-3">
              <ProgressBar now={progress} label={statusMessage || (progress + '%')} animated striped />
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" disabled={busy} onClick={function() { setShowModal(false); }}>
            Cancel
          </Button>
          {melodyBlob && (
            <Button
              variant="outline-primary"
              disabled={busy || !plan}
              onClick={function() { handleGenerateClick(true); }}
            >
              {getPracticeTrackGenerateLabel(access, { busy: busy, regenerateBackingOnly: true })}
            </Button>
          )}
          <Button
            variant="primary"
            disabled={busy || !plan}
            onClick={function() { handleGenerateClick(false); }}
            title={access.needsLogin && access.loginWarning ? access.loginWarning.message : ''}
          >
            {getPracticeTrackGenerateLabel(access, { busy: busy })}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
