import abcjs from 'abcjs';
import { resolvePrimaryVoiceKey } from './abcVoiceUtils';
import { extractBarsFromMelodyText, splitMelodyIntoBlocks, totalMelodyBarCount } from './lyricBarAlignmentUtils';
import { normalizeLyricStructure } from './lyricStructureUtils';
import { getPlainLyricLines, getNoteAlignedLyricLines } from './wLinesUtils';
import { checkTuneAbcStructure } from './tuneAbcStructureCheck';
import { beatsPerBarFromMeter } from './notation/beatGrid';
import { parseTempoBpm } from './tempoRange';
import { extractAbcjsTiming } from './abcjsTimingExtract';
import { loopDurationSecFromPlan } from './backingPromptBuilder';
import { attachChordsToStrains, extractChordsPerBar } from './practiceTrackChordLayer';
import { buildDrumGuideConfig } from './practiceTrackDrumGuide';
import {
  buildStyleBackingPrompt,
  buildStyleNegativePrompt,
  DEFAULT_RENDER_STYLE,
  getStylePreset,
  GUIDE_MODE_MIDI_WAV,
  resolveAccompanimentMidiProgram,
  resolveLeadMidiProgram,
  shouldIncludeDrumGuide,
} from './practiceTrackStylePresets';

/** Structure checks that do not block practice-track generation when MIDI/audio renders. */
const PRACTICE_TRACK_IGNORED_STRUCTURE_CODES = new Set([
  'session_linebreak_markers',
  'empty_bar',
  'rest_only_bar',
  'chord_scaffold_in_melody',
]);

function strainLabel(index) {
  return String.fromCharCode(65 + index);
}

function getNoteLines(tune) {
  if (!tune || !tune.voices) return [];
  const voiceKey = resolvePrimaryVoiceKey(tune.voices);
  const voice = tune.voices[voiceKey];
  return voice && Array.isArray(voice.notes) ? voice.notes : [];
}

function estimateTimingFromBars(tune, barCount) {
  const tempo = parseFloat(tune && tune.tempo) || 120;
  const playbackFactor = tune && tune.playbackTempo > 0 ? parseFloat(tune.playbackTempo) : 1;
  const tempoBpm = tempo * playbackFactor;
  const meter = tune && tune.meter ? String(tune.meter) : '4/4';
  const beatsPerBar = beatsPerBarFromMeter(meter);
  const totalDurationSec = barCount * beatsPerBar * (60 / tempoBpm);
  const barBoundariesSec = [];
  for (let bar = 0; bar <= barCount; bar += 1) {
    barBoundariesSec.push(bar * beatsPerBar * (60 / tempoBpm));
  }
  return {
    tempoBpm: tempoBpm,
    meter: meter,
    totalDurationSec: totalDurationSec,
    barBoundariesSec: barBoundariesSec,
    source: 'bar-estimate',
  };
}

function buildRepeatSchedule(strains, tune) {
  if (!strains.length) return [];
  const playbackRepeats = Math.max(1, parseInt(tune && tune.repeats, 10) || 1);
  if (strains.length === 1) {
    return [{ strainLabel: strains[0].strainLabel, playCount: playbackRepeats }];
  }
  if (strains.length === 2) {
    return [
      { strainLabel: 'A', playCount: playbackRepeats },
      { strainLabel: 'A', playCount: playbackRepeats },
      { strainLabel: 'B', playCount: playbackRepeats },
      { strainLabel: 'B', playCount: playbackRepeats },
    ];
  }
  return strains.map(function(strain) {
    return { strainLabel: strain.strainLabel, playCount: 1 };
  });
}

/**
 * Expand timing duration when a single strain is played multiple times (tune.repeats).
 * Multi-strain AABB length is applied server-side from repeatSchedule.
 */
export function expandTimingForRepeatSchedule(plan) {
  if (!plan || !plan.timing) return plan;
  const schedule = plan.timing.repeatSchedule || [];
  const sections = plan.structure || plan.timing.sections || [];
  if (sections.length !== 1 || !schedule.length) return plan;

  const section = sections[0];
  const sectionDuration = parseFloat(section.durationSec) || 0;
  const plays = schedule.reduce(function(sum, event) {
    if ((event.strainLabel || '') !== (section.strainLabel || '')) return sum;
    return sum + Math.max(1, parseInt(event.playCount, 10) || 1);
  }, 0);
  const current = parseFloat(plan.timing.totalDurationSec) || 0;
  const expected = sectionDuration * plays;
  if (!(expected > 0) || !(current > 0) || plays <= 1 || expected <= current * 1.02) {
    return plan;
  }

  const tempo = parseFloat(plan.timing.tempoBpm) || 120;
  const meter = plan.timing.meter || (plan.musical && plan.musical.meter) || '4/4';
  const beatsPerBar = beatsPerBarFromMeter(meter);
  const uniqueBars = Math.max(0, (plan.timing.barBoundariesSec || []).length - 1);
  const nextBoundaries = [];
  if (uniqueBars > 0 && beatsPerBar > 0 && tempo > 0) {
    const barSec = (beatsPerBar * 60) / tempo;
    const fullBars = uniqueBars * plays;
    for (let bar = 0; bar <= fullBars; bar += 1) {
      nextBoundaries.push(bar * barSec);
    }
  }
  const nextTotal = nextBoundaries.length > 1
    ? nextBoundaries[nextBoundaries.length - 1]
    : expected;
  const nextPlan = Object.assign({}, plan, {
    timing: Object.assign({}, plan.timing, {
      totalDurationSec: nextTotal,
      barBoundariesSec: nextBoundaries.length > 1 ? nextBoundaries : plan.timing.barBoundariesSec,
    }),
  });
  nextPlan.loopDurationSec = loopDurationSecFromPlan(nextPlan);
  return nextPlan;
}

function buildSections(strains, barBoundariesSec, lyricSections) {
  return strains.map(function(strain, index) {
    const startBar = strain.startBar;
    const endBar = strain.endBar;
    const startTimeSec = barBoundariesSec[startBar] != null ? barBoundariesSec[startBar] : 0;
    const endBoundary = barBoundariesSec[endBar + 1];
    const endTimeSec = endBoundary != null
      ? endBoundary
      : (barBoundariesSec[barBoundariesSec.length - 1] || startTimeSec);
    const lyricBlock = lyricSections[index] || lyricSections[lyricSections.length - 1];
    const lyricLines = lyricBlock && Array.isArray(lyricBlock.lines) ? lyricBlock.lines : [];
    return {
      id: 'strain-' + strain.strainLabel,
      type: strain.strainLabel.length === 1 ? 'strain' : 'instrumental',
      strainLabel: strain.strainLabel,
      header: lyricBlock && lyricBlock.header ? lyricBlock.header : null,
      startBar: startBar,
      endBar: endBar,
      startTimeSec: startTimeSec,
      endTimeSec: endTimeSec,
      durationSec: Math.max(0, endTimeSec - startTimeSec),
      tempoBpm: strain.tempoBpm,
      lyricLines: lyricLines,
      syllableCount: lyricLines.join(' ').split(/\s+/).filter(Boolean).length,
      chords: strain.chords || [],
      repeatCount: 1,
    };
  });
}

function buildStrains(noteLines, tune) {
  const blocks = splitMelodyIntoBlocks(noteLines);
  let globalBar = 0;
  return blocks.map(function(blockText, index) {
    const barCount = extractBarsFromMelodyText(blockText).length;
    const startBar = globalBar;
    const endBar = globalBar + Math.max(0, barCount - 1);
    globalBar += barCount;
    return {
      strainLabel: strainLabel(index),
      blockText: blockText,
      startBar: startBar,
      endBar: endBar,
      barCount: barCount,
      tempoBpm: parseFloat(tune && tune.tempo) || 120,
      chords: [],
    };
  });
}

function renderVisualFromAbc(abc) {
  if (!abc || !String(abc).trim() || typeof document === 'undefined') return null;
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);';
  document.body.appendChild(host);
  try {
    const visualObjs = abcjs.renderAbc(host, abc, { add_classes: false });
    return visualObjs && visualObjs[0] ? visualObjs[0] : null;
  } finally {
    if (host.parentNode) host.parentNode.removeChild(host);
  }
}

/**
 * Build a TimingSongPlan from tune JSON and ABC text.
 * @param {object} tune
 * @param {string} abc
 * @param {object} [options]
 * @param {object} [options.visualObj] - pre-rendered abcjs visual (tests)
 */
export function buildTimingSongPlan(tune, abc, options) {
  const opts = options || {};
  const abcjsParser = opts.abcjsParser || null;
  const tunebook = opts.tunebook || null;
  const noteLines = getNoteLines(tune);
  const barCount = totalMelodyBarCount(noteLines);
  let strains = buildStrains(noteLines, tune);
  if (abcjsParser) {
    const chordsPerBar = extractChordsPerBar(tune, tunebook, abcjsParser);
    if (chordsPerBar.length) {
      strains = attachChordsToStrains(strains, chordsPerBar);
    }
  }
  const lyricSections = normalizeLyricStructure(getPlainLyricLines(tune));
  const wLines = getNoteAlignedLyricLines(tune);
  const structureCheck = opts.abcTools
    ? checkTuneAbcStructure(tune, { abcTools: opts.abcTools, abcText: abc })
    : null;
  const rawIssues = (structureCheck && Array.isArray(structureCheck.issues) ? structureCheck.issues : [])
    .filter(function(issue) { return issue.severity === 'error' || issue.severity === 'warning'; });
  const forPracticeTrack = opts.forPracticeTrack !== false;
  const structureIssues = forPracticeTrack
    ? rawIssues.filter(function(issue) {
      return issue.severity === 'error'
        || !PRACTICE_TRACK_IGNORED_STRUCTURE_CODES.has(issue.code);
    })
    : rawIssues;
  const structureWarnings = structureIssues
    .filter(function(issue) { return issue.severity === 'warning'; })
    .map(function(issue) { return issue.message; });
  const structureErrors = structureIssues
    .filter(function(issue) { return issue.severity === 'error'; })
    .map(function(issue) { return issue.message; });

  const visualObj = opts.visualObj || renderVisualFromAbc(abc);
  let timing = visualObj ? extractAbcjsTiming(visualObj, barCount, tune) : null;
  if (!timing) {
    timing = estimateTimingFromBars(tune, barCount);
  }
  timing = applyAuthoritativeTempo(timing, abc, tune, visualObj);

  const sections = buildSections(strains, timing.barBoundariesSec, lyricSections);
  const repeatSchedule = buildRepeatSchedule(strains, tune);

  const plan = {
    title: tune && tune.name ? String(tune.name) : 'Untitled',
    bibliographic: {
      composer: tune && tune.composer ? tune.composer : '',
      genres: tune && Array.isArray(tune.genres) ? tune.genres.slice() : [],
      rhythm: tune && tune.rhythm ? tune.rhythm : '',
      backgroundInfo: tune && tune.backgroundInfo ? tune.backgroundInfo : '',
    },
    musical: {
      key: tune && tune.key ? tune.key : '',
      meter: tune && tune.meter ? tune.meter : timing.meter,
      rhythm: tune && tune.rhythm ? tune.rhythm : '',
      tempoBpm: timing.tempoBpm,
      noteLength: tune && tune.noteLength ? tune.noteLength : '',
      capo: tune && tune.capo ? tune.capo : 0,
      transpose: tune && tune.transpose ? tune.transpose : 0,
    },
    structure: sections,
    timing: {
      tempoBpm: timing.tempoBpm,
      meter: timing.meter,
      totalDurationSec: timing.totalDurationSec,
      barBoundariesSec: timing.barBoundariesSec,
      sections: sections,
      repeatSchedule: repeatSchedule,
      source: timing.source,
    },
    guideAbc: abc || '',
    hasVocals: lyricSections.some(function(section) {
      return section.lines && section.lines.some(function(line) { return String(line).trim(); });
    }),
    wLineCount: Array.isArray(wLines) ? wLines.length : 0,
    generationMode: 'midi-guided-ai',
    renderStyle: DEFAULT_RENDER_STYLE,
    guideMode: GUIDE_MODE_MIDI_WAV,
    melodySource: 'notation_midi',
    includeDrumGuide: false,
    guideAudioConditioning: true,
    includeStyleMelodyStem: false,
    mixDrumGuide: false,
    leadMidiProgram: resolveLeadMidiProgram(DEFAULT_RENDER_STYLE),
    drumGuide: null,
    structureWarnings: structureWarnings,
    structureErrors: structureErrors,
    backingPrompt: '',
    backingNegativePrompt: '',
    backingGainDb: -18,
    arrangementGainDb: 0,
    includeChordLayer: false,
    includeNotationStem: false,
    loopDurationSec: 0,
  };

  const stylePreset = getStylePreset(DEFAULT_RENDER_STYLE);
  plan.includeChordLayer = false;
  plan.includeNotationStem = false;
  plan.includeStyleMelodyStem = false;
  plan.guideAudioConditioning = true;
  plan.mixDrumGuide = false;
  plan.leadMidiProgram = resolveLeadMidiProgram(DEFAULT_RENDER_STYLE);
  plan.renderStyle = DEFAULT_RENDER_STYLE;
  plan.includeDrumGuide = shouldIncludeDrumGuide(DEFAULT_RENDER_STYLE, plan);
  plan.backingPrompt = buildStyleBackingPrompt(plan, DEFAULT_RENDER_STYLE, { guideConditioning: true });
  plan.backingNegativePrompt = buildStyleNegativePrompt(DEFAULT_RENDER_STYLE, { guideConditioning: true });
  plan.initNoiseLevel = 0.35;
  plan.guideEngine = 'stable_audio';
  plan.arrangementGainDb = 0;
  plan.drumGuide = plan.includeDrumGuide
    ? buildDrumGuideConfig(plan, { styleId: DEFAULT_RENDER_STYLE })
    : null;
  plan.loopDurationSec = loopDurationSecFromPlan(plan);
  plan.accompanimentMidiProgram = resolveAccompanimentMidiProgram(DEFAULT_RENDER_STYLE);
  return expandTimingForRepeatSchedule(plan);
}

export function timingPlanNeedsAcknowledgement(plan) {
  return plan
    && plan.timing
    && plan.timing.source === 'bar-estimate';
}

export function timingPlanHasBlockingWarnings(plan) {
  return Array.isArray(plan && plan.structureErrors) && plan.structureErrors.length > 0;
}

function tempoFromAbcHeader(abc, tune) {
  const abcText = String(abc || '');
  const qMatch = abcText.match(/^Q:\s*(.+)$/m);
  if (qMatch) {
    const fromQ = parseTempoBpm('Q:' + qMatch[1]);
    if (fromQ > 0) return fromQ;
  }
  const playbackFactor = tune && tune.playbackTempo > 0 ? parseFloat(tune.playbackTempo) : 1;
  const headerTempo = tune && tune.tempo ? parseTempoBpm(String(tune.tempo)) : 0;
  if (headerTempo > 0) return headerTempo * playbackFactor;
  return 0;
}

function applyAuthoritativeTempo(timing, abc, tune, visualObj) {
  if (!timing) return timing;
  const fromVisual = visualObj ? extractAbcjsTiming(visualObj, 0, tune) : null;
  const visualBpm = fromVisual && fromVisual.tempoBpm > 0 ? fromVisual.tempoBpm : 0;
  const headerBpm = tempoFromAbcHeader(abc, tune);
  const resolved = visualBpm || headerBpm || timing.tempoBpm || 120;
  return Object.assign({}, timing, { tempoBpm: resolved });
}

/**
 * Rebuild backing prompts after timing refinement so BPM and guide mode stay in sync.
 */
export function refreshPracticeTrackPrompts(plan) {
  if (!plan) return plan;
  const styleId = plan.renderStyle || DEFAULT_RENDER_STYLE;
  const guideOn = plan.guideAudioConditioning !== false;
  return Object.assign({}, plan, {
    backingPrompt: buildStyleBackingPrompt(plan, styleId, { guideConditioning: guideOn }),
    backingNegativePrompt: buildStyleNegativePrompt(styleId, { guideConditioning: guideOn }),
  });
}

/**
 * Scale timing contract to match a rendered melody WAV duration (soundfont ground truth).
 * Preserves authoritative tempo from abcjs / Q: header — only scales bar boundaries.
 */
export function refineTimingFromMelodyDuration(plan, melodyDurationSec) {
  if (!plan || !plan.timing) return plan;
  const duration = parseFloat(melodyDurationSec);
  if (!(duration > 0)) return plan;
  const current = parseFloat(plan.timing.totalDurationSec);
  const preservedTempo = parseFloat(plan.timing.tempoBpm || (plan.musical && plan.musical.tempoBpm)) || 120;

  let nextPlan;
  if (!(current > 0) || Math.abs(duration - current) < 0.05) {
    nextPlan = Object.assign({}, plan, {
      musical: Object.assign({}, plan.musical || {}, { tempoBpm: preservedTempo }),
      timing: Object.assign({}, plan.timing, {
        totalDurationSec: duration,
        tempoBpm: preservedTempo,
        source: plan.timing.source === 'bar-estimate' ? 'melody-render' : plan.timing.source,
      }),
    });
  } else {
    const scale = duration / current;
    const barBoundariesSec = (plan.timing.barBoundariesSec || []).map(function(sec) {
      return sec * scale;
    });
    const sections = (plan.structure || []).map(function(section) {
      return Object.assign({}, section, {
        startTimeSec: section.startTimeSec * scale,
        endTimeSec: section.endTimeSec * scale,
        durationSec: section.durationSec * scale,
        tempoBpm: preservedTempo,
      });
    });
    nextPlan = Object.assign({}, plan, {
      musical: Object.assign({}, plan.musical || {}, { tempoBpm: preservedTempo }),
      structure: sections,
      timing: Object.assign({}, plan.timing, {
        totalDurationSec: duration,
        tempoBpm: preservedTempo,
        barBoundariesSec: barBoundariesSec,
        sections: sections,
        source: 'melody-render',
      }),
    });
  }

  nextPlan = expandTimingForRepeatSchedule(nextPlan);
  nextPlan.loopDurationSec = loopDurationSecFromPlan(nextPlan);
  return refreshPracticeTrackPrompts(nextPlan);
}

/**
 * Payload sent to local-resolver for practice-track generation.
 */
export function buildPracticeTrackRequestPayload(plan, overrides) {
  const o = overrides || {};
  const styleId = o.renderStyle != null ? o.renderStyle : (plan.renderStyle || DEFAULT_RENDER_STYLE);
  const drumGuidePreferred = shouldIncludeDrumGuide(styleId, plan);
  const includeDrumGuide = o.includeDrumGuide != null
    ? !!o.includeDrumGuide && drumGuidePreferred
    : (plan.includeDrumGuide != null ? !!plan.includeDrumGuide && drumGuidePreferred : drumGuidePreferred);
  const drumGuide = o.drumGuide != null
    ? o.drumGuide
    : (includeDrumGuide
      ? buildDrumGuideConfig(plan, {
        styleId: styleId,
        presetId: o.drumPresetId,
        customPattern: o.customDrumPattern,
        rhythm: o.drumRhythm || (plan.musical && plan.musical.rhythm),
      })
      : null);
  const customPrompt = o.backingPrompt != null ? o.backingPrompt : plan.backingPrompt;
  const guideOn = o.guideAudioConditioning != null
    ? !!o.guideAudioConditioning
    : (plan.guideAudioConditioning !== false);
  const backingPrompt = styleId === 'custom'
    ? customPrompt
    : buildStyleBackingPrompt(plan, styleId, { customPrompt: customPrompt, guideConditioning: guideOn });
  const initNoiseLevel = o.initNoiseLevel != null
    ? parseFloat(o.initNoiseLevel)
    : (plan.initNoiseLevel != null ? parseFloat(plan.initNoiseLevel) : 0.35);
  const guideEngine = o.guideEngine || plan.guideEngine || 'stable_audio';
  return {
    title: plan.title,
    musical: plan.musical,
    timing: plan.timing,
    backingPrompt: backingPrompt,
    backingNegativePrompt: o.backingNegativePrompt != null
      ? o.backingNegativePrompt
      : buildStyleNegativePrompt(styleId, { guideConditioning: guideOn }),
    backingGainDb: o.backingGainDb != null ? o.backingGainDb : plan.backingGainDb,
    arrangementGainDb: o.arrangementGainDb != null ? o.arrangementGainDb : (plan.arrangementGainDb != null ? plan.arrangementGainDb : 0),
    includeChordLayer: o.includeChordLayer != null ? !!o.includeChordLayer : !!plan.includeChordLayer,
    includeNotationStem: o.includeNotationStem != null
      ? !!o.includeNotationStem
      : (plan.includeNotationStem === true),
    includeStyleMelodyStem: o.includeStyleMelodyStem != null
      ? !!o.includeStyleMelodyStem
      : (plan.includeStyleMelodyStem === true),
    mixDrumGuide: o.mixDrumGuide != null
      ? !!o.mixDrumGuide
      : (plan.mixDrumGuide === true),
    leadMidiProgram: o.leadMidiProgram != null
      ? o.leadMidiProgram
      : resolveLeadMidiProgram(styleId),
    accompanimentMidiProgram: o.accompanimentMidiProgram != null
      ? o.accompanimentMidiProgram
      : resolveAccompanimentMidiProgram(styleId),
    loopDurationSec: plan.loopDurationSec || 0,
    structureWarnings: plan.structureWarnings,
    acknowledgeBarEstimate: !!o.acknowledgeBarEstimate,
    renderStyle: styleId,
    guideMode: o.guideMode || plan.guideMode || GUIDE_MODE_MIDI_WAV,
    melodySource: o.melodySource || plan.melodySource || 'notation_midi',
    includeDrumGuide: includeDrumGuide,
    drumGuide: drumGuide,
    guideAudioConditioning: guideOn,
    initNoiseLevel: Number.isFinite(initNoiseLevel) ? initNoiseLevel : 0.35,
    guideEngine: guideEngine,
  };
}
