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
import { melodyHasAnacrusisDoubleBarlines } from './melodyBarlineNormalize';
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

export function analyzeVoiceBarDurations(parsedTune) {
  if (!parsedTune || typeof parsedTune.getBeatsPerMeasure !== 'function') return [];
  const beatsPerBar = parsedTune.getBeatsPerMeasure();
  const beatLen = parsedTune.getBeatLength();
  if (!beatLen) return [];

  const voiceMap = collectVoiceEventsFromParsed(parsedTune);
  const results = [];

  Object.keys(voiceMap).forEach(function(voiceKey) {
    const events = voiceMap[voiceKey];
    let barNumber = 1;
    let barBeats = 0;
    let isPickupBar = parsedTune.getPickupLength() > EPSILON;

    events.forEach(function(ev) {
      if (ev.el_type === 'bar') {
        if (barBeats > EPSILON) {
          const capacity = isPickupBar ? parsedTune.getPickupLength() / beatLen : beatsPerBar;
          const diff = barBeats - capacity;
          if (Math.abs(diff) > EPSILON) {
            results.push({
              voiceKey: voiceKey,
              barIndex: barNumber,
              barBeats: barBeats,
              capacity: capacity,
              type: diff < 0 ? 'underfull' : 'overfull',
              isPickup: isPickupBar,
            });
          }
        }
        barNumber += 1;
        barBeats = 0;
        isPickupBar = false;
      } else if (ev.duration) {
        barBeats += ev.duration / beatLen;
      }
    });

    if (barBeats > EPSILON) {
      const capacity = isPickupBar ? parsedTune.getPickupLength() / beatLen : beatsPerBar;
      const diff = barBeats - capacity;
      if (Math.abs(diff) > EPSILON) {
        results.push({
          voiceKey: voiceKey,
          barIndex: barNumber,
          barBeats: barBeats,
          capacity: capacity,
          type: diff < 0 ? 'underfull' : 'overfull',
          isPickup: isPickupBar,
          isFinal: true,
        });
      }
    }
  });

  return results;
}

function countBarsInVoiceEvents(events) {
  if (!Array.isArray(events)) return 0;
  return events.filter(function(ev) { return ev.el_type === 'bar'; }).length;
}

function findEmptyBarNumbers(flat) {
  const parts = String(flat || '').split('|');
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

  const tokens = flat.match(/\|:|:\||::|\|\||\[[0-9]+\]|\|:\d|\[[0-9]+(?=[^\]])/g) || [];
  const hasRepeatToken = /\|:|:\||::/.test(flat);
  tokens.forEach(function(token) {
    if (token === '|:') {
      hasRepeatMark = true;
      repeatDepth += 1;
    } else if (token === '::') {
      hasRepeatMark = true;
      if (repeatDepth <= 0) unmatchedEnd = true;
      // :: is :| |: in one token — close and reopen without changing depth.
    } else if (token === ':|') {
      hasRepeatMark = true;
      if (repeatDepth <= 0) unmatchedEnd = true;
      else repeatDepth -= 1;
      inEnding = false;
      currentEnding = null;
    } else if (token === '||') {
      // Double bar is a strain separator, not a repeat end — open |: needs :| before ||.
    } else if (/^\[[0-9]+\]$/.test(token) || /^\[[0-9]+$/.test(token)) {
      hasRepeatMark = true;
      if (repeatDepth <= 0 && !hasRepeatToken) {
        issues.push(issue(
          'ending_without_repeat',
          'First/second ending ' + token + ' without enclosing repeat',
          'error'
        ));
      }
      inEnding = true;
      currentEnding = token;
      if (!endingBars[currentEnding]) endingBars[currentEnding] = 0;
    } else if (token === '|' && inEnding && currentEnding) {
      endingBars[currentEnding] += 1;
    }
  });

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
  if (lyricsBlocks > 1 && melodyBlocks > 0 && melodyBlocks !== lyricsBlocks && !/\|\|/.test(flattenMelodyText(noteLines))) {
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
      const bar = underfull[0];
      const label = bar.isPickup ? 'pickup/anacrusis bar' : 'bar ' + bar.barIndex;
      issues.push(issue(
        'underfull_bar',
        label.charAt(0).toUpperCase() + label.slice(1) + ' is incomplete',
        'warning',
        { barIndex: bar.barIndex, voiceKey: bar.voiceKey }
      ));
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
