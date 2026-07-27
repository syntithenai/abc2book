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
import { getPracticeTrackAccess, getPracticeTrackGenerateLabel } from '../practiceTrackAccess';
import { resolveResolverAccessToken } from '../resolverAccessToken';

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
  const [ackBarEstimate, setAckBarEstimate] = useState(false);
  const [validation, setValidation] = useState(null);
  const [melodyBlob, setMelodyBlob] = useState(null);
  const [pendingGenerate, setPendingGenerate] = useState(false);
  const [pendingRegenerateBacking, setPendingRegenerateBacking] = useState(false);

  const abc = useMemo(function() {
    if (!tune || !tunebook || !tunebook.abcTools) return '';
    return tunebook.abcTools.json2abc(tune);
  }, [tune, tunebook]);

  const plan = useMemo(function() {
    if (!tune || !abc) return null;
    try {
      return buildTimingSongPlan(tune, abc, {
        abcTools: tunebook && tunebook.abcTools ? tunebook.abcTools : null,
        forPracticeTrack: true,
      });
    } catch (err) {
      return null;
    }
  }, [tune, abc, tunebook]);

  useEffect(function() {
    if (plan && plan.backingPrompt) {
      setBackingPrompt(plan.backingPrompt);
    }
  }, [plan]);

  const openModal = useCallback(function() {
    setError('');
    setValidation(null);
    setMelodyBlob(null);
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
    setStatusMessage('Rendering melody…');

    try {
      let melody = melodyBlob;
      let activePlan = plan;
      if (!regenerateBackingOnly || !melody) {
        const buffer = await renderAbcToAudioBuffer(abc, { chordsOff: true });
        melody = encodeAudioBufferToWav(buffer);
        setMelodyBlob(melody);
        activePlan = refineTimingFromMelodyDuration(plan, buffer.duration);
      }

      setProgress(15);
      setStatusMessage('Starting AI backing…');
      const payload = buildPracticeTrackRequestPayload(activePlan, {
        backingPrompt: backingPrompt,
        acknowledgeBarEstimate: activePlan.timing.source !== 'bar-estimate',
      });
      const started = await startPracticeTrackGeneration(payload, melody, {
        token: token,
      });

      setProgress(25);
      setStatusMessage('Generating backing…');
      const job = await waitForPracticeTrackJob(started.jobId, {
        token: token,
        intervalMs: 1200,
        onProgress: function(status) {
          if (status && typeof status.progress === 'number') {
            setProgress(Math.max(25, Math.min(90, status.progress)));
          }
          if (status && status.message) {
            setStatusMessage(status.message);
          }
        },
      });

      setValidation(job.validation || null);
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
        title: (tune.name || 'Practice track') + ' (AI backing)',
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

  if (!access.showButton || !tune || !abc) return null;

  return (
    <>
      <Button
        variant="outline-primary"
        style={{ marginLeft: '0.5em' }}
        onClick={openModal}
        title="Generate timing-accurate practice track (notation melody + AI backing)"
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
                Melody from notation (exact timing) + AI rhythm backing at{' '}
                <strong>{formatSeconds(plan.timing.totalDurationSec)}</strong>
                {' '}({Math.round(plan.timing.tempoBpm)} BPM, {plan.timing.source} timing).
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
                <Form.Label>Backing prompt</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={backingPrompt}
                  onChange={function(e) { setBackingPrompt(e.target.value); }}
                  disabled={busy}
                />
              </Form.Group>
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
