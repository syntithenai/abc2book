import {
  buildPracticeTrackRequestPayload,
  buildTimingSongPlan,
  refineTimingFromMelodyDuration,
  timingPlanHasBlockingWarnings,
} from './timingSongPlanExtractor';
import { drumGuideOptionsFromTune } from './practiceTrackDrumGuide';
import { renderAbcToAudioBuffer } from './notationAudioExport';
import { encodeAudioBufferToWav } from './encodeAudioBufferToWav';
import {
  startLinkedCoverGeneration,
  startPracticeTrackGeneration,
} from './musicGenerationClient';
import { buildPracticeTrackMidiScore, midiScoreToBlob } from './practiceTrackMidiScore';
import { DEFAULT_RENDER_STYLE, shouldIncludeDrumGuide } from './practiceTrackStylePresets';
import {
  TASK_LINKED_COVER,
  TASK_PRACTICE_TRACK,
  defaultPresetForTask,
  presetLabel,
} from './audioGenerationPresets';
import { enqueueAudioGenerationJob } from './audioGenerationJobStore';
import { getLinkSrcType } from './checkTuneLinkPlayback';
import {
  getRecording,
  isOwnedMediaLink,
  parseRecordingIdFromLinkUri,
  resolveRecordingLinkAudio,
  resolveRecordingLinkMidi,
} from './linkRecording';
import { isMidiFileName, isMidiOwnedMediaLink } from './midiFileUtils';
import { renderMidiBytesToWavBlob, renderMidiLinkToWavBlob } from './midiRenderClient';
import { noteLinesHaveRealMelody } from './timedImportFinalizer';
import { resolveResolverAccessToken } from './resolverAccessToken';
import { getActiveResolverAccessToken } from './mediaResolverHealthStore';

function resolveGenerationAccessToken(token) {
  return resolveResolverAccessToken(token) || getActiveResolverAccessToken() || '';
}

export function tuneHasRenderableMelody(tune) {
  if (!tune || !tune.voices) return false;
  return Object.values(tune.voices).some(function(voice) {
    return noteLinesHaveRealMelody(voice && voice.notes);
  });
}

export function tuneAbcFromContext(tune, tunebook) {
  if (!tune || !tunebook || !tunebook.abcTools) return '';
  return tunebook.abcTools.json2abc(tune);
}

export function getPracticeTrackPlan(tune, tunebook, abcjsParser) {
  const abc = tuneAbcFromContext(tune, tunebook);
  if (!abc) return null;
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
}

export function hasPracticeTrackMidiData(tune, tunebook, abcjsParser) {
  if (!tuneHasRenderableMelody(tune)) return false;
  const plan = getPracticeTrackPlan(tune, tunebook, abcjsParser);
  if (!plan) return false;
  try {
    buildPracticeTrackMidiScore(tune, tunebook, plan);
    return true;
  } catch (err) {
    return false;
  }
}

export function linkSupportsAudioCover(link, isYoutubeLink) {
  if (!link || !link.link || !String(link.link).trim()) return false;
  const srcType = getLinkSrcType(link, isYoutubeLink);
  return srcType === 'audio'
    || srcType === 'recording'
    || srcType === 'youtube'
    || srcType === 'midifile';
}

export function defaultCoverStylePrompt(tune, plan) {
  const parts = [];
  const musical = plan && plan.musical ? plan.musical : {};
  const timing = plan && plan.timing ? plan.timing : {};
  const tempo = Math.round(parseFloat(timing.tempoBpm || musical.tempoBpm) || 0);
  if (tempo > 0) parts.push(tempo + ' BPM');
  const meter = musical.meter || timing.meter;
  if (meter) parts.push(String(meter));
  if (tune && tune.rhythm) parts.push(String(tune.rhythm) + ' style');
  if (tune && tune.genre) parts.push(String(tune.genre));
  const style = parts.join(', ') || 'same genre as the source';
  return (
    'Faithful cover preserving the exact melody and song structure of the source. Style: '
    + style
  );
}

export function linkedCoverSourceFilename(link, tune, srcType, blob) {
  const base = String((link && link.title) || (tune && tune.name) || 'source')
    .trim()
    .replace(/[^\w.-]+/g, '_') || 'source';
  if (srcType === 'midifile') return base + '.wav';
  if (srcType === 'recording') return base + '.mp3';
  if (blob && blob.type) {
    if (blob.type.indexOf('wav') !== -1) return base + '.wav';
    if (blob.type.indexOf('mpeg') !== -1 || blob.type.indexOf('mp3') !== -1) return base + '.mp3';
  }
  return base + '.wav';
}

async function ownedMediaLinkIsMidi(link) {
  if (isMidiOwnedMediaLink(link) || isMidiFileName(link && link.title)) return true;
  if (!isOwnedMediaLink(link)) return false;
  const recordingId = (link && link.recordingId) || parseRecordingIdFromLinkUri(link && link.link);
  if (!recordingId) return false;
  const recording = await getRecording(recordingId);
  return !!(recording && (recording.mediaKind === 'midi' || recording.type === 'audio/midi'));
}

async function resolveOwnedMidiToWavBlob(link, tuneId, linkIndex, options) {
  const opts = options || {};
  const resolved = await resolveRecordingLinkMidi(link, tuneId, linkIndex, {
    accessToken: opts.token,
    driveApi: opts.driveApi,
    forPlayback: true,
  });
  const baseName = (link && link.title ? String(link.title).trim() : '') || 'source';
  return renderMidiBytesToWavBlob(resolved.arrayBuffer, {
    token: opts.token,
    filename: baseName.replace(/\.(mid|midi)$/i, '') + '.mid',
  });
}

export async function resolveLinkedCoverSourceBlob(options) {
  const opts = options || {};
  const link = opts.link;
  const srcType = opts.srcType;
  if (!link || !srcType) return null;

  const tuneId = opts.tuneId;
  const linkIndex = opts.linkIndex;

  if (srcType === 'midifile') {
    if (tuneId == null || linkIndex == null) {
      throw new Error('Missing tune context for MIDI regeneration.');
    }
    return renderMidiLinkToWavBlob(link, tuneId, linkIndex, {
      token: opts.token,
      driveApi: opts.driveApi,
      isYoutubeLink: opts.isYoutubeLink,
    });
  }

  if (srcType === 'recording') {
    if (tuneId == null || linkIndex == null) {
      throw new Error('Missing tune context for recording regeneration.');
    }
    const accessToken = resolveGenerationAccessToken(opts.token);
    if (!accessToken && !(link && link.googleId)) {
      // Local-only recordings can still resolve from IndexedDB without a token.
      // Drive-backed recordings need sign-in; missing both fails later with a clear error.
    }
    if (await ownedMediaLinkIsMidi(link)) {
      return resolveOwnedMidiToWavBlob(link, tuneId, linkIndex, opts);
    }
    try {
      const resolved = await resolveRecordingLinkAudio(link, tuneId, linkIndex, {
        accessToken: accessToken || opts.token,
        driveApi: opts.driveApi,
        forPlayback: true,
      });
      if (!resolved || !resolved.blob) {
        throw new Error('Recording is not available for regeneration.');
      }
      return resolved.blob;
    } catch (audioErr) {
      try {
        return await resolveOwnedMidiToWavBlob(link, tuneId, linkIndex, Object.assign({}, opts, {
          token: accessToken || opts.token,
        }));
      } catch (midiErr) {
        throw audioErr;
      }
    }
  }

  return null;
}

function getTuneContextFactory(tune, tunebook, onTuneChange, forceRefresh) {
  return function getTuneContext(tuneId) {
    if (!tune || String(tune.id) !== String(tuneId)) return null;
    return {
      tune: tune,
      tunebook: tunebook,
      onTuneChange: onTuneChange,
      forceRefresh: forceRefresh,
    };
  };
}

export async function enqueuePracticeTrackJob(options) {
  const opts = options || {};
  const tune = opts.tune;
  const tunebook = opts.tunebook;
  const abcjsParser = opts.abcjsParser;
  const token = opts.token;
  const onTuneChange = opts.onTuneChange;
  const forceRefresh = opts.forceRefresh;
  const presetId = opts.presetId || defaultPresetForTask(TASK_PRACTICE_TRACK);

  const abc = tuneAbcFromContext(tune, tunebook);
  const plan = getPracticeTrackPlan(tune, tunebook, abcjsParser);
  if (!plan) {
    throw new Error('Could not build timing plan for this tune.');
  }
  if (timingPlanHasBlockingWarnings(plan) && !window.confirm(
    'This tune has notation structure errors. Generate anyway?'
  )) {
    return null;
  }

  const renderStyle = plan.renderStyle || DEFAULT_RENDER_STYLE;
  const midiScore = buildPracticeTrackMidiScore(tune, tunebook, plan);
  const buffer = await renderAbcToAudioBuffer(midiScore.abc, {
    chordsOff: false,
    tune: tune,
  });
  const melody = encodeAudioBufferToWav(buffer);
  const activePlan = refineTimingFromMelodyDuration(plan, buffer.duration);
  const payload = buildPracticeTrackRequestPayload(activePlan, drumGuideOptionsFromTune(tune, activePlan, {
    renderStyle: renderStyle,
    melodySource: 'notation_midi',
    includeChordLayer: false,
    includeDrumGuide: shouldIncludeDrumGuide(renderStyle, activePlan),
    guideAudioConditioning: true,
    includeStyleMelodyStem: false,
    acknowledgeBarEstimate: true,
    presetId: presetId,
  }));
  const started = await startPracticeTrackGeneration(payload, melody, {
    token: token,
    presetId: presetId,
    scoreBlob: midiScoreToBlob(midiScore.midiBytes),
  });

  const getTuneContext = getTuneContextFactory(tune, tunebook, onTuneChange, forceRefresh);
  enqueueAudioGenerationJob({
    tuneId: tune.id,
    tuneName: tune.name || '',
    taskId: TASK_PRACTICE_TRACK,
    presetId: presetId,
    presetLabel: presetLabel(presetId),
    resolverJobId: started.jobId,
    accessToken: token,
    tune: tune,
    tunebook: tunebook,
    onTuneChange: onTuneChange,
    forceRefresh: forceRefresh,
    getTuneContext: getTuneContext,
  });

  return started.jobId;
}

export async function enqueueLinkedCoverJob(options) {
  const opts = options || {};
  const tune = opts.tune;
  const tunebook = opts.tunebook;
  const abcjsParser = opts.abcjsParser;
  const token = resolveGenerationAccessToken(opts.token) || opts.token;
  const onTuneChange = opts.onTuneChange;
  const forceRefresh = opts.forceRefresh;
  const link = opts.link;
  const linkIndex = opts.linkIndex;
  const presetId = opts.presetId || defaultPresetForTask(TASK_LINKED_COVER);
  const isYoutubeLink = tunebook && tunebook.utils && tunebook.utils.isYoutubeLink;
  const srcType = getLinkSrcType(link, isYoutubeLink);

  if (!linkSupportsAudioCover(link, isYoutubeLink)) {
    throw new Error('This link cannot be used as an audio source for regeneration.');
  }

  const plan = getPracticeTrackPlan(tune, tunebook, abcjsParser);
  const stylePrompt = (opts.stylePrompt || defaultCoverStylePrompt(tune, plan)).trim();
  if (!stylePrompt) {
    throw new Error('Could not build a style prompt for this cover.');
  }

  const tuneId = opts.tuneId || tune.id;
  let sourceBlob = opts.sourceBlob || null;
  if (!sourceBlob) {
    sourceBlob = await resolveLinkedCoverSourceBlob({
      link: link,
      srcType: srcType,
      tuneId: tuneId,
      linkIndex: linkIndex,
      token: token,
      driveApi: opts.driveApi,
      isYoutubeLink: isYoutubeLink,
    });
  }

  const requestPayload = {
    taskId: TASK_LINKED_COVER,
    presetId: presetId,
    sourceUrl: link.link,
    sourceType: srcType === 'midifile' ? 'midifile' : srcType,
    stylePrompt: stylePrompt,
    lyrics: (opts.lyrics || '').trim(),
    title: link.title || tune.name || '',
    startAt: parseFloat(link.startAt) || 0,
    endAt: parseFloat(link.endAt) || 0,
  };
  const started = await startLinkedCoverGeneration(requestPayload, {
    token: token,
    presetId: presetId,
    sourceBlob: sourceBlob,
    sourceFilename: linkedCoverSourceFilename(link, tune, srcType, sourceBlob),
  });

  const getTuneContext = getTuneContextFactory(tune, tunebook, onTuneChange, forceRefresh);
  enqueueAudioGenerationJob({
    tuneId: tune.id,
    tuneName: tune.name || '',
    taskId: TASK_LINKED_COVER,
    presetId: presetId,
    presetLabel: presetLabel(presetId),
    resolverJobId: started.jobId,
    accessToken: token,
    tune: tune,
    tunebook: tunebook,
    onTuneChange: onTuneChange,
    forceRefresh: forceRefresh,
    getTuneContext: getTuneContext,
  });

  return started.jobId;
}
