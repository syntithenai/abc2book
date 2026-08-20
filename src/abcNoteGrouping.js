import { normalizeMeter, getBarModel } from './barModel';
import { parseVoiceEvents } from './notation/voiceEventModel';
import {
  serializeVoiceEvents,
  serializeVoiceEventsWithBeatGroups,
} from './notation/abcVoiceSerializer';
import {
  parseNoteLengthDecimal,
  durationToBeats,
  measureCapacityBeats,
  tupletBeatScale,
} from './notation/beatGrid';
import { isLayoutEventType } from './notation/inlineSignatureTokens';
import { stripFillerRests } from './notation/staffMeasureFill';
import { voiceDisplayLabel } from './notation/notationDisplayAbc';

const SUPPORTED_GROUPING_METERS = new Set([
  '2/4',
  '3/4',
  '4/4',
  '6/8',
  '9/8',
  '12/8',
]);

export function isSupportedGroupingMeter(meterText) {
  return SUPPORTED_GROUPING_METERS.has(normalizeMeter(meterText));
}

/**
 * Editor/storage serialization preserves explicit beam breaks (including spaces
 * loaded from ABC). Beat grouping is applied only by the Note Groups tool.
 */
export function serializeVoiceEventsForEditor(events, tuneMeta) {
  return serializeVoiceEvents(events, tuneMeta);
}

function formatVoiceLabel(tune, voiceKey) {
  return voiceDisplayLabel(tune, voiceKey) || voiceKey || 'voice';
}

function formatGroupingFailure(tune, voiceKey, message, detail) {
  const label = formatVoiceLabel(tune, voiceKey);
  let text = 'Note Groups skipped (' + label + '): ' + message;
  if (detail) text += ' ' + detail;
  return text;
}

function eventDurationBeats(ev, unit) {
  if (!ev || isLayoutEventType(ev.type)) return 0;
  let beats = durationToBeats(ev.duration, unit);
  if (ev.tuplet) beats *= tupletBeatScale(ev.tuplet);
  return beats;
}

function findOverfullMeasures(events, tuneMeta) {
  const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
  const capacity = measureCapacityBeats(tuneMeta.meter);
  let beatsInBar = 0;
  let barIndex = 0;
  const issues = [];

  function flagIfOverfull() {
    if (beatsInBar <= capacity + 0.001) return;
    if (issues.some(function(issue) { return issue.measureIndex === barIndex; })) return;
    issues.push({
      measureIndex: barIndex,
      beats: beatsInBar,
      capacity: capacity,
      type: 'overfull',
    });
  }

  (events || []).forEach(function(ev) {
    if (ev.type === 'barline') {
      flagIfOverfull();
      beatsInBar = 0;
      barIndex += 1;
      return;
    }
    const beats = eventDurationBeats(ev, unit);
    if (beats <= 0) return;
    beatsInBar += beats;
    flagIfOverfull();
  });

  flagIfOverfull();
  return issues;
}

function tuneMetaFromTune(tune) {
  return {
    meter: (tune && tune.meter) || '4/4',
    noteLength: (tune && tune.noteLength) || '1/8',
    key: (tune && tune.key) || 'C',
    tempo: (tune && tune.tempo) || 120,
  };
}

function stripAbcWhitespace(text) {
  return String(text || '').replace(/\s+/g, '');
}

/** True when beat-group output differs from beam-friendly output only by whitespace. */
function groupingOnlyChangesSpacing(events, groupedBody, meta) {
  const canonical = stripAbcWhitespace(
    serializeVoiceEvents(stripFillerRests(events), meta)
  );
  return canonical === stripAbcWhitespace(groupedBody);
}

function voiceNotesToBody(notes) {
  if (Array.isArray(notes)) return notes.join('\n');
  return String(notes || '');
}

function bodyToVoiceNotes(body) {
  return String(body || '').split('\n');
}

function barModelIsConsistent(tuneMeta) {
  const model = getBarModel(tuneMeta.meter, tuneMeta.noteLength);
  return model.beatUnitSlots * model.beatCount === model.unitSlotsPerBar;
}

function validateEventsForGrouping(events, tuneMeta, tune, voiceKey) {
  if (!events || events.length === 0) {
    return { ok: true };
  }
  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i];
    if (ev.type === 'meterChange') {
      return {
        ok: false,
        reason: formatGroupingFailure(
          tune,
          voiceKey,
          'inline time signature changes are not supported.',
          'Remove [M:…] tokens or edit spacing in ABC text view.'
        ),
      };
    }
  }
  const overfull = findOverfullMeasures(events, tuneMeta);
  if (overfull.length > 0) {
    const first = overfull[0];
    const barNumber = first.measureIndex + 1;
    return {
      ok: false,
      reason: formatGroupingFailure(
        tune,
        voiceKey,
        'bar ' + barNumber + ' has too many notes for ' + normalizeMeter(tuneMeta.meter) + '.',
        'Fix the bar length or correct the time signature before grouping beats.'
      ),
    };
  }
  return { ok: true };
}

export function applyNoteGroupingToVoiceBody(body, tuneMeta, abcTools, context) {
  const ctx = context || {};
  const tune = ctx.tune || null;
  const voiceKey = ctx.voiceKey || null;
  const meta = {
    meter: tuneMeta.meter || '4/4',
    noteLength: tuneMeta.noteLength || '1/8',
    key: tuneMeta.key || 'C',
    tempo: tuneMeta.tempo || 120,
  };
  if (!isSupportedGroupingMeter(meta.meter)) {
    return {
      ok: false,
      reason: formatGroupingFailure(
        tune,
        voiceKey,
        'meter ' + normalizeMeter(meta.meter) + ' is not supported.',
        'Use 2/4, 3/4, 4/4, 6/8, 9/8, or 12/8.'
      ),
    };
  }
  if (!barModelIsConsistent(meta)) {
    return {
      ok: false,
      reason: formatGroupingFailure(
        tune,
        voiceKey,
        'beat boundaries are unclear for L:' + (meta.noteLength || '1/8') + ' in ' + normalizeMeter(meta.meter) + '.',
        'Try a default note length that divides the bar evenly (often L:1/8).'
      ),
    };
  }
  const trimmedBody = String(body || '').trim();
  if (!trimmedBody) {
    return { ok: true, body: String(body || ''), unchanged: true };
  }
  const events = parseVoiceEvents(body, meta);
  if (!events.length) {
    return {
      ok: false,
      reason: formatGroupingFailure(
        tune,
        voiceKey,
        'could not parse the notation.',
        'Check for invalid ABC tokens in this voice.'
      ),
    };
  }
  const validation = validateEventsForGrouping(events, meta, tune, voiceKey);
  if (!validation.ok) return validation;

  const groupedBody = serializeVoiceEventsWithBeatGroups(events, meta);
  if (!groupingOnlyChangesSpacing(events, groupedBody, meta)) {
    return {
      ok: false,
      reason: formatGroupingFailure(
        tune,
        voiceKey,
        'grouped ABC would change more than spacing.',
        'Report this tune if the message persists.'
      ),
    };
  }
  const reparsed = parseVoiceEvents(groupedBody, meta);
  if (!reparsed.length) {
    return {
      ok: false,
      reason: formatGroupingFailure(
        tune,
        voiceKey,
        'grouped notation could not be parsed back.',
        'Report this tune if the message persists.'
      ),
    };
  }
  if (!groupingOnlyChangesSpacing(reparsed, groupedBody, meta)) {
    return {
      ok: false,
      reason: formatGroupingFailure(
        tune,
        voiceKey,
        'grouped notation did not round-trip cleanly.',
        'Report this tune if the message persists.'
      ),
    };
  }

  return {
    ok: true,
    body: groupedBody,
    unchanged: groupedBody === String(body || ''),
  };
}

export function applyNoteGroupingToTune(tune, liveBodies, abcTools) {
  if (!tune || !tune.voices) {
    return { ok: false, reason: 'No tune loaded.' };
  }
  const tuneMeta = tuneMetaFromTune(tune);
  const snapshot = JSON.parse(JSON.stringify(tune));
  const drafts = liveBodies || {};
  Object.keys(drafts).forEach(function(vk) {
    if (!snapshot.voices || !snapshot.voices[vk]) return;
    snapshot.voices[vk] = Object.assign({}, snapshot.voices[vk], {
      notes: String(drafts[vk] || '').split('\n'),
    });
  });

  if (!isSupportedGroupingMeter(tuneMeta.meter)) {
    return {
      ok: false,
      reason: formatGroupingFailure(
        snapshot,
        null,
        'meter ' + normalizeMeter(tuneMeta.meter) + ' is not supported.',
        'Use 2/4, 3/4, 4/4, 6/8, 9/8, or 12/8.'
      ),
    };
  }

  let anyChanged = false;
  const voiceKeys = Object.keys(snapshot.voices);
  for (let i = 0; i < voiceKeys.length; i += 1) {
    const voiceKey = voiceKeys[i];
    const voice = snapshot.voices[voiceKey];
    const body = voiceNotesToBody(voice && voice.notes);
    const result = applyNoteGroupingToVoiceBody(body, tuneMeta, abcTools, {
      tune: snapshot,
      voiceKey: voiceKey,
    });
    if (!result.ok) {
      return { ok: false, reason: result.reason, voiceKey: voiceKey };
    }
    if (!result.unchanged) anyChanged = true;
    snapshot.voices[voiceKey] = Object.assign({}, voice, {
      notes: bodyToVoiceNotes(result.body),
    });
  }

  return { ok: true, tune: snapshot, unchanged: !anyChanged };
}
