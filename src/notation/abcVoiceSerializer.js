import { parseNoteLengthDecimal, assignTimingToEvents } from './beatGrid';
import { abcTokenForDecoration } from './notationTokens';

function pitchToAbcToken(pitch) {
  if (!pitch) return '';
  if (pitch.abcName) return pitch.abcName;
  let acc = '';
  if (pitch.accidental === 2) acc = '^^';
  else if (pitch.accidental === -2) acc = '__';
  else if (pitch.accidental === 1) acc = '^';
  else if (pitch.accidental === -1) acc = '_';
  else if (pitch.accidental === 0 && pitch.forceNatural) acc = '=';
  let name = pitch.step;
  if (pitch.octave >= 5) name = name.toLowerCase() + "'".repeat(pitch.octave - 5);
  else if (pitch.octave < 4) name = name + ','.repeat(4 - pitch.octave);
  return acc + name;
}

function durationToAbcSuffix(duration, unitLengthDecimal) {
  const unitBeats = unitLengthDecimal * 4;
  const beats = (duration.num / duration.den) * unitBeats * (duration.dotted ? 1.5 : 1);
  const units = beats / unitBeats;
  if (Math.abs(units - 1) < 0.001) return '';
  if (units < 1) {
    const denom = Math.round(1 / units);
    return '/' + denom;
  }
  return String(Math.round(units));
}

function serializeGraceNotes(graceNotes, unit) {
  if (!graceNotes || !graceNotes.length) return '';
  const inner = graceNotes.map(function(gn) {
    const suf = durationToAbcSuffix(gn.duration, unit);
    return pitchToAbcToken(gn.pitch) + suf;
  }).join('');
  return '{' + inner + '}';
}

function serializeDecorations(decorations) {
  if (!decorations || !decorations.length) return '';
  return decorations.map(function(key) {
    const tok = abcTokenForDecoration(key);
    if (tok === '.') return '.';
    return tok;
  }).join('');
}

function serializeChordSymbols(ev) {
  if (!ev || !Array.isArray(ev.chordSymbols) || !ev.chordSymbols.length) return '';
  return ev.chordSymbols.map(function(name) {
    const text = typeof name === 'string' ? name : (name && name.name != null ? String(name.name) : '');
    if (!text) return '';
    return '"' + text.replace(/"/g, '') + '"';
  }).join('');
}

function serializeTupletPrefix(ev) {
  if (!ev.tuplet || ev.tuplet.indexInGroup !== 0) return '';
  return '(' + ev.tuplet.num;
}

function serializeNoteBody(ev, unit) {
  const suf = durationToAbcSuffix(ev.duration, unit);
  let body = '';
  if (ev.type === 'rest') {
    body = 'z' + suf;
  } else if (ev.type === 'chord' && ev.pitches && ev.pitches.length > 1) {
    const sorted = ev.pitches.slice().sort(function(a, b) {
      return pitchToAbcToken(a).localeCompare(pitchToAbcToken(b));
    });
    body = '[' + sorted.map(pitchToAbcToken).join('') + ']' + suf;
  } else {
    const p = ev.pitch || (ev.pitches && ev.pitches[0]);
    body = pitchToAbcToken(p) + suf;
  }
  if (ev.tieEnd) body += '-';
  return body;
}

export function serializeVoiceEvents(events, tuneMeta) {
  const meter = tuneMeta && tuneMeta.meter ? tuneMeta.meter : '4/4';
  const noteLength = tuneMeta && tuneMeta.noteLength ? tuneMeta.noteLength : '1/8';
  const unit = parseNoteLengthDecimal(noteLength, meter);
  const lines = [[]];
  events.forEach(function(ev) {
    if (ev.type === 'lineBreak') {
      lines.push([]);
      return;
    }
    let token = null;
    if (ev.type === 'barline') {
      token = serializeChordSymbols(ev)
        + (ev.abcLeading || '')
        + (ev.barToken || '|')
        + (ev.abcTrailing || '');
    } else {
      const leading = serializeChordSymbols(ev)
        + (ev.abcLeading || '')
        + serializeGraceNotes(ev.graceNotes, unit)
        + serializeTupletPrefix(ev)
        + serializeDecorations(ev.decorations);
      let body = serializeNoteBody(ev, unit);
      if (ev.slurStart) body = '(' + body;
      if (ev.slurEnd) body = body + ')';
      token = leading + body + (ev.abcTrailing || '');
    }
    if (token) lines[lines.length - 1].push(token);
  });
  return lines
    .map(function(line) { return line.join(' ').trim(); })
    .filter(function(line, index, all) {
      return line.length > 0 || all.length === 1 || index < all.length - 1;
    })
    .join('\n');
}

export function serializeVoiceEventsViaParser(events, tuneMeta, abcjsParser) {
  const body = serializeVoiceEvents(events, tuneMeta);
  const header = 'X:1\nT:t\nM:' + tuneMeta.meter + '\nL:' + (tuneMeta.noteLength || '1/8') + '\nK:' + (tuneMeta.key || 'C') + '\n';
  const raw = header + body + '\n';
  const parsed = abcjsParser.parse(raw);
  return abcjsParser.render(parsed, raw);
}

export function reassignEventTiming(events, tuneMeta) {
  const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
  return assignTimingToEvents(events, tuneMeta.meter, unit);
}
