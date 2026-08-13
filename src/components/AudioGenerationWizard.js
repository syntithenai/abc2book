import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, ListGroup, Modal } from 'react-bootstrap';
import {
  buildPracticeTrackRequestPayload,
  buildTimingSongPlan,
  refineTimingFromMelodyDuration,
  timingPlanHasBlockingWarnings,
  timingPlanNeedsAcknowledgement,
} from '../timingSongPlanExtractor';
import { drumGuideOptionsFromTune } from '../practiceTrackDrumGuide';
import { renderAbcToAudioBuffer } from '../notationAudioExport';
import { encodeAudioBufferToWav } from '../encodeAudioBufferToWav';
import {
  fetchAudioGenerationBackends,
  startLinkedCoverGeneration,
  startPracticeTrackGeneration,
} from '../musicGenerationClient';
import useMediaResolverHealth from '../useMediaResolverHealth';
import useAbcjsParser from '../useAbcjsParser';
import { getAudioGenerationAccess, getPracticeTrackGenerateLabel } from '../audioGenerationAccess';
import { useCreditAffordance } from '../useCreditAffordance';
import { openCreditSettings } from '../resolverCreditAccess';
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
import {
  TASK_LINKED_COVER,
  TASK_OPTIONS,
  TASK_PRACTICE_TRACK,
  defaultPresetForTask,
  mergeBackendsPresets,
  presetLabel,
  PRESET_ORDER,
  taskLabel,
} from '../audioGenerationPresets';
import { enqueueAudioGenerationJob } from '../audioGenerationJobStore';
import { defaultCoverStylePrompt } from '../audioGenerationActions';
import { getLinkSrcType } from '../checkTuneLinkPlayback';

const STEPS = [
  { key: 'task', title: 'Task' },
  { key: 'source', title: 'Source' },
  { key: 'options', title: 'Options' },
  { key: 'quality', title: 'Quality' },
  { key: 'start', title: 'Start' },
];

function formatSeconds(value) {
  const sec = Math.max(0, parseFloat(value) || 0);
  return sec.toFixed(1) + 's';
}

function formatLinkDetail(link) {
  if (!link) return '';
  if (link.title && String(link.title).trim()) return String(link.title).trim();
  if (link.link && String(link.link).trim()) {
    const url = String(link.link).trim();
    return url.length > 72 ? url.slice(0, 69) + '…' : url;
  }
  return 'Untitled link';
}

function visibleSteps(taskId) {
  if (taskId === TASK_LINKED_COVER) return STEPS;
  return STEPS.filter(function(step) { return step.key !== 'source'; });
}

function buttonLabel(access, backends) {
  const practice = access.practiceTrackAvailable;
  const cover = access.linkedCoverAvailable;
  if (practice && cover) return 'Generate audio';
  if (cover) return 'Generate cover';
  return 'Practice track';
}

export default function AudioGenerationWizard(props) {
  const tune = props.tune;
  const tunebook = props.tunebook;
  const token = props.token;
  const login = props.login;
  const onTuneChange = props.onTuneChange;
  const forceRefresh = props.forceRefresh;

  const abcjsParser = useAbcjsParser({ tunebook: tunebook });
  const { available, checked, status, features, refreshMediaResolverHealth } = useMediaResolverHealth();
  const [backends, setBackends] = useState(null);
  const [backendsError, setBackendsError] = useState('');

  const practiceAffordance = useCreditAffordance(token, 'practice_track');
  const coverAffordance = useCreditAffordance(token, 'linked_cover');
  const combinedAffordance = useMemo(function() {
    if (!practiceAffordance.checked || !coverAffordance.checked) {
      return { checked: false, affordable: true };
    }
    return {
      checked: true,
      affordable: practiceAffordance.affordable && coverAffordance.affordable,
      estimateCents: Math.max(
        Number(practiceAffordance.estimateCents) || 0,
        Number(coverAffordance.estimateCents) || 0
      ),
      availableCents: Math.min(
        Number(practiceAffordance.availableCents) || Infinity,
        Number(coverAffordance.availableCents) || Infinity
      ),
      shortfallCents: Math.max(
        Number(practiceAffordance.shortfallCents) || 0,
        Number(coverAffordance.shortfallCents) || 0
      ),
      creditUnlimited: practiceAffordance.creditUnlimited || coverAffordance.creditUnlimited,
      error: practiceAffordance.error || coverAffordance.error,
    };
  }, [practiceAffordance, coverAffordance]);

  const access = useMemo(function() {
    return getAudioGenerationAccess({
      resolverChecked: checked,
      resolverAvailable: available,
      resolverStatus: status,
      features: features,
      accessToken: token,
      user: props.user,
      backends: backends,
      affordance: combinedAffordance,
    });
  }, [checked, available, status, features, token, props.user, backends, combinedAffordance]);

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
  const isYoutubeLink = tunebook && tunebook.utils && tunebook.utils.isYoutubeLink;

  const [showModal, setShowModal] = useState(false);
  const [activeStep, setActiveStep] = useState('task');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [taskId, setTaskId] = useState(TASK_PRACTICE_TRACK);
  const [presetId, setPresetId] = useState(defaultPresetForTask(TASK_PRACTICE_TRACK));
  const [selectedLinkIndex, setSelectedLinkIndex] = useState(null);
  const [backingPrompt, setBackingPrompt] = useState('');
  const [coverStylePrompt, setCoverStylePrompt] = useState('');
  const [coverLyrics, setCoverLyrics] = useState('');
  const [renderStyle, setRenderStyle] = useState(DEFAULT_RENDER_STYLE);
  const [melodySource, setMelodySource] = useState('notation_midi');
  const [includeDrumGuide, setIncludeDrumGuide] = useState(true);
  const [ackBarEstimate, setAckBarEstimate] = useState(false);
  const [includeChordLayer, setIncludeChordLayer] = useState(false);
  const [pendingGenerate, setPendingGenerate] = useState(false);

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

  const playableLinks = useMemo(function() {
    const links = tune && Array.isArray(tune.links) ? tune.links : [];
    return links.map(function(link, index) {
      if (!link || !link.link || !String(link.link).trim()) return null;
      const srcType = getLinkSrcType(link, isYoutubeLink);
      if (srcType === 'empty') return null;
      return { link: link, index: index, srcType: srcType };
    }).filter(Boolean);
  }, [tune, isYoutubeLink]);

  const presetOptions = useMemo(function() {
    return mergeBackendsPresets(backends, taskId);
  }, [backends, taskId]);

  const steps = useMemo(function() {
    return visibleSteps(taskId);
  }, [taskId]);

  const stepIndex = steps.findIndex(function(step) { return step.key === activeStep; });

  useEffect(function() {
    if (plan && plan.backingPrompt) {
      setBackingPrompt(plan.backingPrompt);
    }
    if (plan && taskId === TASK_LINKED_COVER) {
      setCoverStylePrompt(defaultCoverStylePrompt(tune, plan));
    }
    if (plan) {
      setIncludeChordLayer(false);
      setRenderStyle(plan.renderStyle || DEFAULT_RENDER_STYLE);
      setIncludeDrumGuide(plan.includeDrumGuide !== false);
    }
  }, [plan, taskId, tune]);

  useEffect(function() {
    setPresetId(defaultPresetForTask(taskId));
  }, [taskId]);

  const loadBackends = useCallback(async function() {
    if (!resolvedToken) return;
    setBackendsError('');
    try {
      const payload = await fetchAudioGenerationBackends({ token: token });
      setBackends(payload);
    } catch (err) {
      setBackends(null);
      setBackendsError(err && err.message ? err.message : 'Could not load audio generation backends');
    }
  }, [token, resolvedToken]);

  const openModal = useCallback(function() {
    setError('');
    setActiveStep('task');
    setAckBarEstimate(false);
    setShowModal(true);
    loadBackends();
  }, [loadBackends]);

  const goNext = useCallback(function() {
    const next = steps[stepIndex + 1];
    if (next) setActiveStep(next.key);
  }, [steps, stepIndex]);

  const goBack = useCallback(function() {
    const prev = steps[stepIndex - 1];
    if (prev) setActiveStep(prev.key);
  }, [steps, stepIndex]);

  const getTuneContext = useCallback(function(tuneId) {
    if (!tune || String(tune.id) !== String(tuneId)) return null;
    return {
      tune: tune,
      tunebook: tunebook,
      onTuneChange: onTuneChange,
      forceRefresh: forceRefresh,
    };
  }, [tune, tunebook, onTuneChange, forceRefresh]);

  const startGeneration = useCallback(async function() {
    if (taskId === TASK_PRACTICE_TRACK) {
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
    } else if (selectedLinkIndex === null || selectedLinkIndex === undefined) {
      setError('Select a linked recording.');
      return;
    } else if (!coverStylePrompt.trim()) {
      setError('Enter a style prompt for the cover.');
      return;
    }

    setStarting(true);
    setError('');

    try {
      let resolverJobId;
      const selectedPreset = presetOptions.find(function(item) { return item.id === presetId; })
        || { id: presetId, label: presetLabel(presetId) };

      if (taskId === TASK_PRACTICE_TRACK) {
        const midiScore = buildPracticeTrackMidiScore(tune, tunebook, plan);
        const melodyAbc = melodySource === 'notation_midi' ? midiScore.abc : abc;
        const buffer = await renderAbcToAudioBuffer(melodyAbc, {
          chordsOff: melodySource !== 'notation_midi',
          tune: tune,
        });
        const melody = encodeAudioBufferToWav(buffer);
        const activePlan = refineTimingFromMelodyDuration(plan, buffer.duration);

        let chords = null;
        if (includeChordLayer && plan.includeChordLayer) {
          const chordsPerBar = extractChordsPerBar(tune, tunebook, abcjsParser);
          if (chordsPerBar.length) {
            chords = await renderChordLayerWav(tune, chordsPerBar);
          }
        }

        const stylePreset = getStylePreset(renderStyle);
        const payload = buildPracticeTrackRequestPayload(activePlan, drumGuideOptionsFromTune(tune, activePlan, {
          backingPrompt: renderStyle === 'custom' ? backingPrompt : undefined,
          renderStyle: renderStyle,
          melodySource: melodySource,
          includeChordLayer: includeChordLayer && !!chords,
          includeDrumGuide: includeDrumGuide && stylePreset.includeDrumGuideDefault,
          acknowledgeBarEstimate: activePlan.timing.source !== 'bar-estimate',
          presetId: presetId,
        }));
        const started = await startPracticeTrackGeneration(payload, melody, {
          token: token,
          presetId: presetId,
          chordsBlob: includeChordLayer ? chords : null,
          scoreBlob: midiScoreToBlob(midiScore.midiBytes),
        });
        resolverJobId = started.jobId;
      } else {
        const link = playableLinks.find(function(entry) { return entry.index === selectedLinkIndex; });
        if (!link) throw new Error('Selected link is no longer available');
        const requestPayload = {
          taskId: TASK_LINKED_COVER,
          presetId: presetId,
          sourceUrl: link.link.link,
          sourceType: link.srcType,
          stylePrompt: coverStylePrompt.trim(),
          lyrics: coverLyrics.trim(),
          title: link.link.title || tune.name || '',
          startAt: link.srcType === 'midifile' ? 0 : (parseFloat(link.link.startAt) || 0),
          endAt: link.srcType === 'midifile' ? 0 : (parseFloat(link.link.endAt) || 0),
        };
        const started = await startLinkedCoverGeneration(requestPayload, {
          token: token,
          presetId: presetId,
        });
        resolverJobId = started.jobId;
      }

      enqueueAudioGenerationJob({
        tuneId: tune.id,
        tuneName: tune.name || '',
        taskId: taskId,
        presetId: presetId,
        presetLabel: selectedPreset.label || presetLabel(presetId),
        resolverJobId: resolverJobId,
        accessToken: token,
        tune: tune,
        tunebook: tunebook,
        onTuneChange: onTuneChange,
        forceRefresh: forceRefresh,
        getTuneContext: getTuneContext,
      });

      setShowModal(false);
    } catch (err) {
      setError(err && err.message ? err.message : 'Could not start audio generation.');
    } finally {
      setStarting(false);
    }
  }, [
    taskId,
    plan,
    ackBarEstimate,
    selectedLinkIndex,
    coverStylePrompt,
    coverLyrics,
    presetId,
    presetOptions,
    melodySource,
    renderStyle,
    backingPrompt,
    includeChordLayer,
    includeDrumGuide,
    tune,
    tunebook,
    abc,
    abcjsParser,
    token,
    onTuneChange,
    getTuneContext,
    playableLinks,
  ]);

  useEffect(function() {
    if (!pendingGenerate) return undefined;
    if (!access.canGenerate || !resolvedToken) return undefined;
    setPendingGenerate(false);
    startGeneration();
    return undefined;
  }, [pendingGenerate, access.canGenerate, resolvedToken, startGeneration]);

  const requestLoginForGeneration = useCallback(function() {
    if (resolvedToken) {
      setPendingGenerate(false);
      startGeneration();
      return;
    }
    if (typeof login !== 'function') {
      setError('Log in to generate audio');
      return;
    }
    setPendingGenerate(true);
    login().catch(function() {
      setPendingGenerate(false);
    });
  }, [login, resolvedToken, startGeneration]);

  const handleGenerateClick = useCallback(function() {
    if (access.needsLogin) {
      requestLoginForGeneration();
      return;
    }
    if (access.needsCredit || access.cannotAfford) {
      openCreditSettings();
      return;
    }
    startGeneration();
  }, [access.needsLogin, access.needsCredit, requestLoginForGeneration, startGeneration]);

  const handleDownloadScore = useCallback(function() {
    try {
      const bytes = buildPracticeTrackMidiScore(tune, tunebook, plan).midiBytes;
      downloadMidiScore(bytes, (tune && tune.name ? tune.name : 'score') + '.mid');
    } catch (err) {
      setError(err && err.message ? err.message : 'Could not export MIDI score.');
    }
  }, [tune, tunebook, plan]);

  const availableTasks = useMemo(function() {
    return TASK_OPTIONS.filter(function(option) {
      if (option.id === TASK_PRACTICE_TRACK) return access.practiceTrackAvailable;
      if (option.id === TASK_LINKED_COVER) return access.linkedCoverAvailable;
      return false;
    });
  }, [access.practiceTrackAvailable, access.linkedCoverAvailable]);

  useEffect(function() {
    if (!showModal || availableTasks.length === 0) return;
    if (!availableTasks.some(function(item) { return item.id === taskId; })) {
      setTaskId(availableTasks[0].id);
    }
  }, [showModal, availableTasks, taskId]);

  if (!access.showButton || !tune || !abc) return null;

  function renderStepBody() {
    if (activeStep === 'task') {
      return (
        <>
          <p className="text-muted">Choose what to generate for this tune.</p>
          {backendsError ? <Alert variant="warning">{backendsError}</Alert> : null}
          <div className="d-flex flex-column gap-2">
            {availableTasks.map(function(option) {
              return (
                <Button
                  key={option.id}
                  variant={taskId === option.id ? 'primary' : 'outline-primary'}
                  className="text-start"
                  onClick={function() { setTaskId(option.id); }}
                  disabled={starting}
                >
                  <strong>{option.label}</strong>
                  <div className="small">{option.description}</div>
                </Button>
              );
            })}
          </div>
        </>
      );
    }

    if (activeStep === 'source') {
      return (
        <>
          <p className="text-muted">Pick the linked recording to use as the cover source.</p>
          {playableLinks.length === 0 ? (
            <Alert variant="warning">This tune has no playable media links yet.</Alert>
          ) : (
            <ListGroup>
              {playableLinks.map(function(entry) {
                const selected = selectedLinkIndex === entry.index;
                return (
                  <ListGroup.Item
                    key={entry.index}
                    action
                    active={selected}
                    onClick={function() { setSelectedLinkIndex(entry.index); }}
                  >
                    <strong>{formatLinkDetail(entry.link)}</strong>
                    <div className="small text-muted">{entry.srcType}</div>
                  </ListGroup.Item>
                );
              })}
            </ListGroup>
          )}
        </>
      );
    }

    if (activeStep === 'options') {
      if (taskId === TASK_LINKED_COVER) {
        return (
          <>
            <Form.Group className="mb-3">
              <Form.Label>Style prompt</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={coverStylePrompt}
                onChange={function(e) { setCoverStylePrompt(e.target.value); }}
                disabled={starting}
                placeholder="e.g. upbeat jazz trio with brushed drums"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Lyrics (optional)</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                value={coverLyrics}
                onChange={function(e) { setCoverLyrics(e.target.value); }}
                disabled={starting}
              />
            </Form.Group>
          </>
        );
      }

      if (!plan) {
        return <Alert variant="danger">Could not analyze tune structure.</Alert>;
      }

      return (
        <>
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
              className="mb-3"
              label="I understand timing is estimated from bar count (abcjs render unavailable)."
              checked={ackBarEstimate}
              onChange={function(e) { setAckBarEstimate(e.target.checked); }}
              disabled={starting}
            />
          )}
          <Form.Group className="mb-3">
            <Form.Label>Style</Form.Label>
            <Form.Select
              value={renderStyle}
              onChange={function(e) { setRenderStyle(e.target.value); }}
              disabled={starting}
            >
              {styleOptions.map(function(option) {
                return (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                );
              })}
            </Form.Select>
            <Form.Text muted>{getStylePreset(renderStyle).description}</Form.Text>
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Melody source</Form.Label>
            <Form.Select
              value={melodySource}
              onChange={function(e) { setMelodySource(e.target.value); }}
              disabled={starting}
            >
              <option value="notation_midi">Notation MIDI (default)</option>
              <option value="soundfont">Legacy soundfont (melody only)</option>
            </Form.Select>
          </Form.Group>
          <Form.Check
            type="checkbox"
            className="mb-3"
            label="Include beat-locked MIDI drum guide (recommended)"
            checked={includeDrumGuide}
            onChange={function(e) { setIncludeDrumGuide(e.target.checked); }}
            disabled={starting}
          />
          {renderStyle === 'custom' && (
            <Form.Group className="mb-3">
              <Form.Label>Custom backing prompt</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={backingPrompt}
                onChange={function(e) { setBackingPrompt(e.target.value); }}
                disabled={starting}
              />
            </Form.Group>
          )}
          <Button
            variant="outline-secondary"
            size="sm"
            disabled={starting}
            onClick={handleDownloadScore}
          >
            Download score.mid
          </Button>
        </>
      );
    }

    if (activeStep === 'quality') {
      const options = presetOptions.length ? presetOptions : PRESET_ORDER.map(function(id) {
        return { id: id, label: presetLabel(id), available: true };
      });
      return (
        <>
          <p className="text-muted">Choose quality vs speed. Fast is selected by default.</p>
          <div className="d-flex flex-column gap-2">
            {options.map(function(preset) {
              const unavailable = preset.available === false;
              return (
                <Button
                  key={preset.id}
                  variant={presetId === preset.id ? 'primary' : 'outline-primary'}
                  className="text-start"
                  disabled={starting || unavailable}
                  onClick={function() { setPresetId(preset.id); }}
                >
                  <strong>{preset.label || presetLabel(preset.id)}</strong>
                  {unavailable ? <span className="ms-2 text-warning">(unavailable)</span> : null}
                  {preset.description ? <div className="small">{preset.description}</div> : null}
                </Button>
              );
            })}
          </div>
        </>
      );
    }

    return (
      <>
        <p><strong>{taskLabel(taskId)}</strong> · {presetLabel(presetId)}</p>
        {taskId === TASK_LINKED_COVER && selectedLinkIndex !== null ? (
          <p className="text-muted">
            Source: {formatLinkDetail(
              (playableLinks.find(function(entry) { return entry.index === selectedLinkIndex; }) || {}).link
            )}
          </p>
        ) : null}
        {taskId === TASK_PRACTICE_TRACK && plan ? (
          <p className="text-muted">
            {formatSeconds(plan.timing.totalDurationSec)} at {Math.round(plan.timing.tempoBpm)} BPM
          </p>
        ) : null}
        <p className="text-muted mb-0">
          Generation runs in the background. You can close this dialog and keep browsing.
          Track progress in Settings → Background jobs.
        </p>
      </>
    );
  }

  function canAdvanceFromStep() {
    if (activeStep === 'task') return !!taskId;
    if (activeStep === 'source') return selectedLinkIndex !== null && selectedLinkIndex !== undefined;
    if (activeStep === 'options') {
      if (taskId === TASK_LINKED_COVER) return !!coverStylePrompt.trim();
      if (!plan) return false;
      if (timingPlanNeedsAcknowledgement(plan) && !ackBarEstimate) return false;
      return true;
    }
    if (activeStep === 'quality') return !!presetId;
    return true;
  }

  const onLastStep = activeStep === 'start';

  return (
    <>
      <Button
        variant="outline-primary"
        style={{ marginLeft: '0.5em' }}
        onClick={openModal}
        title="Generate practice tracks or linked-media cover variants"
      >
        {buttonLabel(access, backends)}
      </Button>

      <Modal show={showModal} onHide={function() { if (!starting) setShowModal(false); }} size="lg">
        <Modal.Header closeButton={!starting}>
          <Modal.Title>Generate audio</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="wizard-step-nav d-flex gap-2 flex-wrap align-items-center mb-3">
            {steps.map(function(step, index) {
              return (
                <Button
                  key={step.key}
                  size="sm"
                  variant={step.key === activeStep ? 'primary' : 'outline-secondary'}
                  disabled={index > stepIndex + 1 || starting}
                  onClick={function() { setActiveStep(step.key); }}
                >
                  {index + 1}. {step.title}
                </Button>
              );
            })}
          </div>
          {renderStepBody()}
          {error ? <Alert variant="danger" className="mt-3">{error}</Alert> : null}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" disabled={starting} onClick={function() { setShowModal(false); }}>
            Cancel
          </Button>
          {stepIndex > 0 ? (
            <Button variant="outline-secondary" disabled={starting} onClick={goBack}>
              Back
            </Button>
          ) : null}
          {!onLastStep ? (
            <Button variant="primary" disabled={starting || !canAdvanceFromStep()} onClick={goNext}>
              Next
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={starting || !canAdvanceFromStep()}
              onClick={handleGenerateClick}
              title={access.loginWarning && (access.needsLogin || access.needsCredit)
                ? access.loginWarning.message
                : ''}
            >
              {starting ? 'Starting…' : getPracticeTrackGenerateLabel(access, { busy: starting })}
            </Button>
          )}
        </Modal.Footer>
      </Modal>
    </>
  );
}
