import abcjs from 'abcjs';
import { abcForAbcjs } from './melodyBarlineNormalize';
import { resolvePrimaryVoiceKey } from './abcVoiceUtils';
import { formatTuneDisplayName } from './tuneDisplayName';
import { classifyBar } from './chordBlockMerge';
import { needsSessionLineBreakFix } from './abcImportNormalize';
import { splitIntoBlocks } from './chordSheetUtils';
import { noteLinesHaveRealMelody } from './timedImportFinalizer';
import { suggestCompletenessPath } from './tuneCompletenessCheck';
import { getLyricLines } from './wLinesUtils';
import {
  extractBarsFromMelodyText,
  flattenMelodyText,
  splitMelodyIntoBlocks,
} from './lyricBarAlignmentUtils';
import {
  melodyHasAnacrusisDoubleBarlines,
  melodyHasMidBlockDoubleBarlines,
} from './melodyBarlineNormalize';
import { analyzeSectionPickupVoltaBoundaries } from './sectionPickupVolta';
import { hasOpenRepeatBeforeDoubleBar } from './repeatStrainFix';

const EPSILON = 0.05;
const MAX_REPORTED_BARS = 8;

function issue(code, message, severity, extras) {
  return Object.assign({
    code: code,
    message: message,
    severity: severity || 'warning',
    field: 'voices',
  }, extras || {});
}

function getNoteLines(tune) {
  if (!tune || !tune.voices) return [];
  const voiceKey = resolvePrimaryVoiceKey(tune.voices);
  const voice = tune.voices[voiceKey];
  return voice && Array.isArray(voice.notes) ? voice.notes : [];
}

function getVoiceKeys(tune) {
  if (!tune || !tune.voices) return [];
  return Object.keys(tune.voices);
}

function lyricBlockCount(tune) {
  const lyrics = getLyricLines(tune);
  const blocks = splitIntoBlocks(lyrics);
  return blocks.filter(function(block) {
    return block.some(function(line) { return String(line || '').trim().length > 0; });
  }).length;
}

function collectVoiceEventsFromParsed(parsed) {
  const voices = {};
  if (!parsed || !Array.isArray(parsed.lines)) return voices;
  parsed.lines.forEach(function(line) {
    if (!line || !Array.isArray(line.staff)) return;
    line.staff.forEach(function(staff, staffIndex) {
      if (!staff || !Array.isArray(staff.voices)) return;
      staff.voices.forEach(function(voiceEvents, voiceIndex) {
        const key = staffIndex + ':' + voiceIndex;
        if (!voices[key]) voices[key] = [];
        voices[key] = voices[key].concat(voiceEvents || []);
      });
    });
  });
  return voices;
}

/**
 * abcjs stores written note duration separately from tuplet scaling:
 * startTriplet / tripletMultiplier on the first note, endTriplet on the last.
 * Scale each note in the group so (3B/2A/2G/2 counts as one beat, not 1.5.
 */
function eventDurationWithTuplet(ev, tupletState) {
  if (!ev || !ev.duration) return { duration: 0, tupletState: tupletState };
  let state = tupletState || { multiplier: 1 };
  if (ev.startTriplet && ev.tripletMultiplier) {
    state = { multiplier: ev.tripletMultiplier };
  }
  const duration = ev.duration * (state.multiplier || 1);
  if (ev.endTriplet) {
    state = { multiplier: 1 };
  }
  return { duration: duration, tupletState: state };
}

/**
 * Drop the closing underfull when anacrusis + last bar together fill one measure.
 * Uses parsed pickup length and/or section pickups after |: (folk repeats).
 */
function suppressAnacrusisComplementUnderfull(results, parsedTune, beatLen, beatsPerBar, sectionPickupBeats) {
  const pickupLen = parsedTune && typeof parsedTune.getPickupLength === 'function'
    ? parsedTune.getPickupLength()
    : 0;
  let pickupBeats = pickupLen > EPSILON && beatLen ? pickupLen / beatLen : 0;
  if (sectionPickupBeats > EPSILON) {
    pickupBeats = Math.max(pickupBeats, sectionPickupBeats);
  }
  if (!(pickupBeats > EPSILON) || !beatsPerBar) return results;

  const lastUnderfullIdxByVoice = {};
  results.forEach(function(row, idx) {
    if (!row || row.type !== 'underfull' || row.isPickup) return;
    const key = row.voiceKey || '';
    const prev = lastUnderfullIdxByVoice[key];
    if (prev == null || row.barIndex >= results[prev].barIndex) {
      lastUnderfullIdxByVoice[key] = idx;
    }
  });

  const drop = {};
  Object.keys(lastUnderfullIdxByVoice).forEach(function(key) {
    const idx = lastUnderfullIdxByVoice[key];
    const row = results[idx];
    if (Math.abs((row.barBeats + pickupBeats) - beatsPerBar) <= EPSILON) {
      drop[idx] = true;
    }
  });

  // Also drop strain-end underfulls before a later section pickup (multi-strain polskas).
  results.forEach(function(row, idx) {
    if (!row || row.type !== 'underfull' || row.isPickup || drop[idx]) return;
    if (Math.abs((row.barBeats + pickupBeats) - beatsPerBar) <= EPSILON) {
      drop[idx] = true;
    }
  });

  return results.filter(function(_row, idx) { return !drop[idx]; });
}

function beatsPerBarFromMeterEvent(ev, beatLen, fallback) {
  if (!(beatLen > 0) || !ev) return fallback;
  let num = null;
  let den = null;
  if (Array.isArray(ev.value) && ev.value[0]) {
    num = parseFloat(ev.value[0].num);
    den = parseFloat(ev.value[0].den);
  } else if (ev.num != null && ev.den != null) {
    num = parseFloat(ev.num);
    den = parseFloat(ev.den);
  }
  if (!(num > 0) || !(den > 0)) return fallback;
  // Bar length in wholes is num/den; convert to beat units used by note durations.
  return (num / den) / beatLen;
}

function isLeftRepeatBar(ev) {
  const t = String((ev && ev.type) || '');
  return t.indexOf('left_repeat') >= 0 || t === 'bar_left_repeat';
}

export function analyzeVoiceBarDurations(parsedTune) {
  if (!parsedTune || typeof parsedTune.getBeatsPerMeasure !== 'function') return [];
  const headerBeatsPerBar = parsedTune.getBeatsPerMeasure();
  const beatLen = parsedTune.getBeatLength();
  if (!beatLen) return [];

  const voiceMap = collectVoiceEventsFromParsed(parsedTune);
  const results = [];

  Object.keys(voiceMap).forEach(function(voiceKey) {
    const events = voiceMap[voiceKey];
    let barNumber = 1;
    let barBeats = 0;
    let isPickupBar = parsedTune.getPickupLength() > EPSILON;
    let expectSectionPickup = false;
    let sectionPickupBeats = 0;
    let tupletState = { multiplier: 1 };
    let beatsPerBar = headerBeatsPerBar;

    events.forEach(function(ev) {
      if (ev.el_type === 'meter' || ev.el_type === 'timeSignature') {
        beatsPerBar = beatsPerBarFromMeterEvent(ev, beatLen, beatsPerBar);
      } else if (ev.el_type === 'bar') {
        if (barBeats > EPSILON) {
          const treatAsPickup = isPickupBar || (
            expectSectionPickup && barBeats + EPSILON < beatsPerBar
          );
          if (treatAsPickup) {
            if (expectSectionPickup) {
              sectionPickupBeats = Math.max(sectionPickupBeats, barBeats);
            }
            // Known/section pickup — do not flag underfull.
          } else {
            const capacity = beatsPerBar;
            const diff = barBeats - capacity;
            if (Math.abs(diff) > EPSILON) {
              results.push({
                voiceKey: voiceKey,
                barIndex: barNumber,
                barBeats: barBeats,
                capacity: capacity,
                type: diff < 0 ? 'underfull' : 'overfull',
                isPickup: false,
              });
            }
          }
        }
        barNumber += 1;
        barBeats = 0;
        isPickupBar = false;
        expectSectionPickup = isLeftRepeatBar(ev);
        tupletState = { multiplier: 1 };
      } else if (ev.duration) {
        const scaled = eventDurationWithTuplet(ev, tupletState);
        tupletState = scaled.tupletState;
        barBeats += scaled.duration / beatLen;
      }
    });

    if (barBeats > EPSILON) {
      const treatAsPickup = isPickupBar || (
        expectSectionPickup && barBeats + EPSILON < beatsPerBar
      );
      if (treatAsPickup) {
        if (expectSectionPickup) {
          sectionPickupBeats = Math.max(sectionPickupBeats, barBeats);
        }
      } else {
        const capacity = beatsPerBar;
        const diff = barBeats - capacity;
        if (Math.abs(diff) > EPSILON) {
          results.push({
            voiceKey: voiceKey,
            barIndex: barNumber,
            barBeats: barBeats,
            capacity: capacity,
            type: diff < 0 ? 'underfull' : 'overfull',
            isPickup: false,
            isFinal: true,
          });
        }
      }
    }

    results._sectionPickupBeats = Math.max(results._sectionPickupBeats || 0, sectionPickupBeats);
  });

  const sectionPickupBeats = results._sectionPickupBeats || 0;
  delete results._sectionPickupBeats;
  return suppressAnacrusisComplementUnderfull(
    results,
    parsedTune,
    beatLen,
    headerBeatsPerBar,
    sectionPickupBeats
  );
}

function countBarsInVoiceEvents(events) {
  if (!Array.isArray(events)) return 0;
  return events.filter(function(ev) { return ev.el_type === 'bar'; }).length;
}

function findEmptyBarNumbers(flat) {
  // Mask || so double-barlines are not treated as an empty measure between pipes.
  // Also collapse `| |:` strain wraps (line ended with |, next began |:) — not empty bars.
  let text = String(flat || '').replace(/\|\|/g, '\x00DB\x00');
  text = text.replace(/\|\s*\|:/g, '|:');
  text = text.replace(/:\|\s*\|:/g, ':|:');
  const parts = text.split('|');
  const emptyBars = [];
  for (let i = 1; i < parts.length - 1; i += 1) {
    const segment = String(parts[i]);
    if (!segment.trim() && segment.length > 0) emptyBars.push(i + 1);
  }
  return emptyBars;
}

function checkBarContent(noteLines, pathB) {
  const issues = [];
  const flat = flattenMelodyText(noteLines);
  if (!flat) return issues;

  const bars = extractBarsFromMelodyText(flat);
  const emptyFromPipes = findEmptyBarNumbers(flat);
  const emptyBars = emptyFromPipes.slice();
  const restBars = [];
  const scaffoldBars = [];

  bars.forEach(function(bar, index) {
    const kind = classifyBar(bar);
    const barNumber = index + 1;
    if (kind === 'empty' && emptyBars.indexOf(barNumber) < 0) emptyBars.push(barNumber);
    else if (kind === 'rest') restBars.push(barNumber);
    else if (kind === 'chord_scaffold' && pathB) scaffoldBars.push(barNumber);
  });

  function formatBarList(numbers) {
    const list = numbers.slice(0, MAX_REPORTED_BARS);
    const suffix = numbers.length > MAX_REPORTED_BARS
      ? ' (+' + (numbers.length - MAX_REPORTED_BARS) + ' more)'
      : '';
    return list.join(', ') + suffix;
  }

  if (emptyBars.length > 0) {
    issues.push(issue(
      'empty_bar',
      'Empty bars with no notes or rests: bar ' + formatBarList(emptyBars),
      'warning',
      { barIndex: emptyBars[0] }
    ));
  }
  if (restBars.length > 0 && pathB) {
    issues.push(issue(
      'rest_only_bar',
      'Rest-only bars: bar ' + formatBarList(restBars),
      'info',
      { barIndex: restBars[0] }
    ));
  }
  if (scaffoldBars.length > 0) {
    issues.push(issue(
      'chord_scaffold_in_melody',
      'Chord-scaffold bars in melody: bar ' + formatBarList(scaffoldBars),
      'warning',
      { barIndex: scaffoldBars[0] }
    ));
  }

  return issues;
}

function checkRepeatStructure(noteLines) {
  const issues = [];
  const flat = flattenMelodyText(noteLines);
  if (!flat) return issues;

  let repeatDepth = 0;
  let inEnding = false;
  const endingBars = {};
  let currentEnding = null;
  let unmatchedEnd = false;
  let hasRepeatMark = false;
  let lastBoundaryEnd = 0;

  let lastRepeatWasDouble = false;

  // :|: and :|1,3 before :|; |1,3 before |: so voltas / mid-repeats are single tokens.
  const re = /:\|:|:\|[\d,]+|\|[\d,]+|\|:|:\||::|\|\||\[[0-9]+\]|\[[0-9]+(?=[^\]])/g;
  const hasRepeatToken = /:\|:|\|:|:\||::/.test(flat);
  let match;
  while ((match = re.exec(flat)) !== null) {
    const token = match[0];
    const idx = match.index;
    const sinceLast = flat.slice(lastBoundaryEnd, idx);
    const hasNotesSince = /[A-Ga-gzZ]/.test(sinceLast);

    if (token === '|:') {
      hasRepeatMark = true;
      lastRepeatWasDouble = false;
      if (repeatDepth > 0 && hasNotesSince) {
        // Mid-tune |: after an open repeat — treat as :|: (end strain + start next).
        // Common in MuseScore/xml2abc exports that omit the leading colon (e.g. G6 |: D2).
        inEnding = false;
        currentEnding = null;
        lastRepeatWasDouble = true;
      } else {
        repeatDepth += 1;
      }
      lastBoundaryEnd = idx + token.length;
    } else if (token === '::' || token === ':|:') {
      hasRepeatMark = true;
      lastRepeatWasDouble = true;
      if (repeatDepth <= 0 && !hasNotesSince) unmatchedEnd = true;
      // close+reopen — depth unchanged when already open; implied open when notes precede.
      if (repeatDepth <= 0 && hasNotesSince) {
        // implied open then reopen — stay at depth 1 effectively via reopen
        repeatDepth = 1;
      }
      lastBoundaryEnd = idx + token.length;
      inEnding = false;
      currentEnding = null;
    } else if (/^:\|[\d,]+$/.test(token)) {
      // :|2 or :|2,4 — close repeat and enter short volta ending(s).
      hasRepeatMark = true;
      lastRepeatWasDouble = false;
      if (repeatDepth > 0) {
        repeatDepth -= 1;
      } else if (!hasNotesSince && !inEnding) {
        unmatchedEnd = true;
      }
      inEnding = true;
      currentEnding = '[' + token.replace(/^:\|/, '').split(',')[0] + ']';
      if (!endingBars[currentEnding]) endingBars[currentEnding] = 0;
      lastBoundaryEnd = idx + token.length;
    } else if (token === ':|') {
      hasRepeatMark = true;
      lastRepeatWasDouble = false;
      if (repeatDepth > 0) {
        repeatDepth -= 1;
        inEnding = false;
        currentEnding = null;
      } else if (inEnding) {
        // Closing a volta ending without a new |: is normal.
        inEnding = false;
        currentEnding = null;
      } else if (hasNotesSince) {
        // Folk-style implied |: … :| for this strain.
      } else {
        unmatchedEnd = true;
      }
      lastBoundaryEnd = idx + token.length;
    } else if (token === '||') {
      inEnding = false;
      currentEnding = null;
      lastBoundaryEnd = idx + token.length;
    } else if (/^\|[\d,]+$/.test(token)) {
      hasRepeatMark = true;
      lastRepeatWasDouble = false;
      if (repeatDepth <= 0 && !hasRepeatToken && !hasNotesSince) {
        issues.push(issue(
          'ending_without_repeat',
          'First/second ending ' + token + ' without enclosing repeat',
          'error'
        ));
      }
      inEnding = true;
      currentEnding = '[' + token.slice(1).split(',')[0] + ']';
      if (!endingBars[currentEnding]) endingBars[currentEnding] = 0;
      lastBoundaryEnd = idx + token.length;
    } else if (/^\[[0-9]+\]$/.test(token) || /^\[[0-9]+$/.test(token)) {
      hasRepeatMark = true;
      lastRepeatWasDouble = false;
      if (repeatDepth <= 0 && !hasRepeatToken && !hasNotesSince) {
        issues.push(issue(
          'ending_without_repeat',
          'First/second ending ' + token + ' without enclosing repeat',
          'error'
        ));
      }
      inEnding = true;
      currentEnding = token.indexOf(']') >= 0 ? token : (token + ']');
      if (!endingBars[currentEnding]) endingBars[currentEnding] = 0;
      lastBoundaryEnd = idx + token.length;
    }
  }

  if (repeatDepth > 0) {
    if (hasOpenRepeatBeforeDoubleBar(flat)) {
      issues.push(issue(
        'strain_missing_repeat_end',
        repeatDepth === 1
          ? 'Strain ends with || without repeat end :|'
          : repeatDepth + ' strains end with || without repeat end :|',
        'warning',
        { repeatCount: repeatDepth }
      ));
    } else if (lastRepeatWasDouble && repeatDepth === 1) {
      // MuseScore/xml2abc often ends the final :: strain without a closing :|.
      // Treat EOF as an implied repeat end when the last mid-repeat was :: / :|:.
    } else {
      const message = repeatDepth === 1
        ? 'Repeat start |: has no matching end'
        : repeatDepth + ' repeat sections (|:) have no matching end';
      issues.push(issue('unmatched_repeat_start', message, 'error', { repeatCount: repeatDepth }));
    }
  }
  if (unmatchedEnd) {
    issues.push(issue('unmatched_repeat_end', 'Repeat end :| has no matching start', 'error'));
  }

  const endingKeys = Object.keys(endingBars);
  if (endingKeys.length > 1) {
    const counts = endingKeys.map(function(key) { return endingBars[key]; });
    const first = counts[0];
    if (counts.some(function(count) { return count !== first; })) {
      issues.push(issue(
        'ending_bar_mismatch',
        'First/second endings have different bar counts',
        'warning'
      ));
    }
  }

  if (/\|\s+:/.test(flat) || /:\s+\|/.test(flat)) {
    issues.push(issue(
      'repeat_style_mixed',
      'Repeat marks have spaces (| : or : |) — use |: and :|',
      'info'
    ));
  }

  if (hasRepeatMark && /:\|\s*\|:/.test(flat.replace(/\s+/g, ''))) {
    issues.push(issue('repeat_style_mixed', 'Mixed repeat styles (:: and :| |:) in the same tune', 'info'));
  }

  const trimmed = flat.replace(/\s+/g, '');
  if (/:\|$/.test(trimmed) === false && /\|:\s*$/.test(trimmed)) {
    issues.push(issue('truncated_repeat', 'Tune ends inside an open repeat (|:) ', 'error'));
  }

  return issues;
}

function checkScoreFinish(noteLines) {
  const issues = [];
  const flat = flattenMelodyText(noteLines);
  if (!flat) return issues;

  const trimmed = flat.trim();
  const endsWithFinish = /\|]|\|\||:\||:\|\||:\]\s*$/.test(trimmed)
    || /:\|\s*$/.test(trimmed);

  if (!endsWithFinish) {
    if (/\|$/.test(trimmed) || /[a-gA-GzZ0-9"')\]]\s*$/.test(trimmed)) {
      issues.push(issue(
        'missing_final_barline',
        'Tune may be missing a final double bar or finish line (|] or ||)',
        'warning'
      ));
    }
  }

  return issues;
}

function checkVoiceParity(parsedTune, tune) {
  const issues = [];
  if (!parsedTune) return issues;

  const voiceMap = collectVoiceEventsFromParsed(parsedTune);
  const voiceKeys = Object.keys(voiceMap);
  if (voiceKeys.length <= 1) {
    const tuneVoiceKeys = getVoiceKeys(tune);
    tuneVoiceKeys.forEach(function(key) {
      const voice = tune.voices[key];
      const notes = voice && Array.isArray(voice.notes) ? voice.notes : [];
      const hasContent = notes.some(function(line) { return String(line || '').trim().length > 0; });
      if (!hasContent && tuneVoiceKeys.length > 1) {
        issues.push(issue(
          'secondary_voice_empty',
          'Voice ' + key + ' has no note lines',
          'warning',
          { voiceKey: key }
        ));
      }
    });
    return issues;
  }

  const barCounts = voiceKeys.map(function(key) {
    return { key: key, bars: countBarsInVoiceEvents(voiceMap[key]) };
  });
  const firstCount = barCounts[0].bars;
  const mismatched = barCounts.filter(function(row) { return row.bars !== firstCount; });
  if (mismatched.length > 0) {
    issues.push(issue(
      'voice_bar_count_mismatch',
      'Voices have different bar counts (' + barCounts.map(function(r) {
        return r.key + ':' + r.bars;
      }).join(', ') + ')',
      'error'
    ));
  }

  return issues;
}

function checkAnacrusisDoubleBarline(noteLines) {
  const issues = [];
  if (!melodyHasAnacrusisDoubleBarlines(noteLines)) return issues;
  issues.push(issue(
    'anacrusis_double_barline',
    'Pickup/anacrusis uses || where a single barline is intended',
    'info',
    { barIndex: 1 }
  ));
  return issues;
}

function checkMidBlockDoubleBarline(noteLines) {
  const issues = [];
  if (!melodyHasMidBlockDoubleBarlines(noteLines)) return issues;
  issues.push(issue(
    'mid_block_double_barline',
    'Double barlines (||) appear between bars inside a section; use single | mid-section and || only at section ends',
    'warning'
  ));
  return issues;
}

function checkSectionPickupAsVolta(noteLines, durationIssues, parsedTune) {
  const issues = [];
  const boundaries = analyzeSectionPickupVoltaBoundaries(noteLines, durationIssues, parsedTune);
  boundaries.forEach(function(boundary) {
    issues.push(issue(
      'section_pickup_should_be_ending',
      boundary.message,
      'warning',
      { barIndex: boundary.barIndex }
    ));
  });
  return issues;
}

function checkAnacrusis(parsedTune, abcText) {
  const issues = [];
  if (!parsedTune || !abcText) return issues;

  let extractPickup = false;
  try {
    const measures = abcjs.extractMeasures(abcText);
    if (measures.length > 0) extractPickup = !!measures[0].hasPickup;
  } catch (e) {}

  const parsedPickup = parsedTune.getPickupLength() > EPSILON;
  if (extractPickup && !parsedPickup) {
    issues.push(issue(
      'anacrusis_inconsistent',
      'Pickup/anacrusis detected in measures but not in parsed timing',
      'warning',
      { barIndex: 1 }
    ));
  }

  return issues;
}

function checkHeaderConsistency(tune, abcText, abcTools) {
  const issues = [];
  if (!abcTools || typeof abcTools.getMetaValueFromAbc !== 'function' || !abcText) return issues;

  const fields = [
    { key: 'M', tuneField: 'meter', label: 'time signature' },
    { key: 'K', tuneField: 'key', label: 'key' },
    { key: 'L', tuneField: 'noteLength', label: 'note length' },
  ];

  fields.forEach(function(field) {
    const fromAbc = String(abcTools.getMetaValueFromAbc(field.key, abcText) || '').trim();
    const fromTune = String(tune[field.tuneField] || '').trim();
    if (fromAbc && fromTune && fromAbc !== fromTune) {
      issues.push(issue(
        'header_field_mismatch',
        'ABC ' + field.key + ': (' + fromAbc + ') differs from tune ' + field.label + ' (' + fromTune + ')',
        'info',
        { field: field.tuneField }
      ));
    }
  });

  return issues;
}

function checkStanzaStrain(tune, noteLines) {
  const issues = [];
  const melodyBlocks = splitMelodyIntoBlocks(noteLines).length;
  const lyricsBlocks = lyricBlockCount(tune);
  // One melody + several lyric stanzas is normal; only flag multi-vs-multi mismatch.
  if (lyricsBlocks > 1 && melodyBlocks > 1 && melodyBlocks !== lyricsBlocks && !/\|\|/.test(flattenMelodyText(noteLines))) {
    issues.push(issue(
      'stanza_strain_mismatch',
      'Lyric stanzas (' + lyricsBlocks + ') do not match melody strains (' + melodyBlocks + ')',
      'warning'
    ));
  }
  return issues;
}

function checkSessionLineBreaks(abcText, noteLines) {
  const noteFlat = Array.isArray(noteLines) ? flattenMelodyText(noteLines) : '';
  if (needsSessionLineBreakFix(abcText) || needsSessionLineBreakFix(noteFlat)) {
    return [issue(
      'session_linebreak_markers',
      'Session-style ! line-break markers may corrupt bar structure',
      'warning',
      { field: 'voices' }
    )];
  }
  return [];
}

export function checkTuneAbcStructure(tune, options) {
  const opts = options || {};
  const abcTools = opts.abcTools;
  if (!tune || !tune.id || !abcTools) return null;

  const noteLines = getNoteLines(tune);
  if (noteLines.length === 0) return null;

  const abcText = typeof opts.abcText === 'string'
    ? opts.abcText
    : abcTools.json2abc(tune);

  const issues = [];
  const pathB = suggestCompletenessPath(tune) === 'B' && noteLinesHaveRealMelody(noteLines);

  issues.push.apply(issues, checkSessionLineBreaks(abcText, noteLines));
  issues.push.apply(issues, checkBarContent(noteLines, pathB));
  issues.push.apply(issues, checkRepeatStructure(noteLines));
  issues.push.apply(issues, checkScoreFinish(noteLines));
  issues.push.apply(issues, checkStanzaStrain(tune, noteLines));
  issues.push.apply(issues, checkAnacrusisDoubleBarline(noteLines));
  issues.push.apply(issues, checkMidBlockDoubleBarline(noteLines));
  issues.push.apply(issues, checkHeaderConsistency(tune, abcText, abcTools));

  const abcForParse = abcForAbcjs(abcText);
  let parsedTune = null;
  try {
    parsedTune = abcjs.parseOnly(abcForParse)[0];
  } catch (e) {}

  if (parsedTune) {
    const durationIssues = analyzeVoiceBarDurations(parsedTune);
    const underfull = durationIssues.filter(function(row) { return row.type === 'underfull'; });
    const overfull = durationIssues.filter(function(row) { return row.type === 'overfull'; });

    if (overfull.length > 0) {
      const bar = overfull[0];
      issues.push(issue(
        'overfull_bar',
        'Bar ' + bar.barIndex + ' has too many notes for the time signature',
        'error',
        { barIndex: bar.barIndex, voiceKey: bar.voiceKey }
      ));
    }
    if (underfull.length > 0) {
      // Skip pickup/anacrusis underfulls — padding rests misaligns chord fill.
      const bar = underfull.find(function(row) { return !row.isPickup; }) || null;
      if (bar) {
        issues.push(issue(
          'underfull_bar',
          'Bar ' + bar.barIndex + ' is incomplete',
          'warning',
          { barIndex: bar.barIndex, voiceKey: bar.voiceKey }
        ));
      }
    }

    issues.push.apply(issues, checkVoiceParity(parsedTune, tune));
    issues.push.apply(issues, checkAnacrusis(parsedTune, abcForParse));
    issues.push.apply(issues, checkSectionPickupAsVolta(noteLines, durationIssues, parsedTune));
  }

  if (issues.length === 0) return null;

  return {
    tuneId: tune.id,
    tuneName: formatTuneDisplayName(tune.name),
    composer: tune.composer || '',
    abcSnippet: noteLines.slice(0, 3).join('\n'),
    issues: issues,
  };
}

export function checkTunesAbcStructure(tunes, options) {
  if (!Array.isArray(tunes)) return [];
  return tunes
    .map(function(tune) { return checkTuneAbcStructure(tune, options); })
    .filter(Boolean);
}
