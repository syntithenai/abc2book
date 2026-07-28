import abcjs from 'abcjs';
import {
  parseNoteLengthDecimal,
  beatsPerBarFromMeter,
  durationToBeats,
  assignTimingToEvents,
  beatsToDuration,
} from './beatGrid';
import { decorationKeyFromAbcjs } from './notationTokens';
import { defaultNoteExtensions, FINGER_LABEL_ABC_PREFIX } from './notationMarks';
import {
  keyTextFromAbcjsSymbol,
  meterTextFromAbcjsSymbol,
  zeroDurationFields,
  isLayoutEventType,
} from './inlineSignatureTokens';

let nextEventSeq = 1;

export function createEventId(prefix) {
  nextEventSeq += 1;
  return (prefix || 'ev') + '-' + nextEventSeq + '-' + Math.random().toString(36).slice(2, 6);
}

export function cloneVoiceEvent(event) {
  return JSON.parse(JSON.stringify(event));
}

const STEP_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function pitchToMidi(pitch) {
  if (!pitch) return null;
  const step = pitch.step ? pitch.step.charAt(0).toUpperCase() : 'C';
  const base = STEP_SEMITONE[step] != null ? STEP_SEMITONE[step] : 0;
  const octave = typeof pitch.octave === 'number' ? pitch.octave : 4;
  return (octave + 1) * 12 + base + (pitch.accidental || 0);
}

export function eventMidiPitch(event, toneIndex) {
  if (!event) return null;
  if (event.type === 'chord' && typeof toneIndex === 'number') {
    return pitchToMidi(event.pitches[toneIndex]);
  }
  if (event.pitch) return pitchToMidi(event.pitch);
  if (event.pitches && event.pitches.length) return pitchToMidi(event.pitches[0]);
  return null;
}

/** Melody / cue pitch: highest tone of a chord, else primary pitch. */
export function eventMelodicMidiPitch(event) {
  if (!event) return null;
  if (event.pitches && event.pitches.length > 1) {
    let best = null;
    event.pitches.forEach(function(pitch) {
      const midi = pitchToMidi(pitch);
      if (midi == null) return;
      if (best == null || midi > best) best = midi;
    });
    return best;
  }
  return eventMidiPitch(event);
}

function rationalFromAbcjsDuration(duration, unitLengthDecimal) {
  const d = Number(duration) || 0;
  if (d <= 0) return { num: 1, den: 8, dotted: false };
  const units = d / unitLengthDecimal;
  return { num: Math.round(units * 1000), den: 1000, dotted: false };
}

function pitchFromAbcjsName(name) {
  const raw = String(name || '').trim();
  if (!raw) return null;
  let accidental = 0;
  let body = raw;
  if (body.startsWith('^^')) { accidental = 2; body = body.slice(2); }
  else if (body.startsWith('__')) { accidental = -2; body = body.slice(2); }
  else if (body.startsWith('^')) { accidental = 1; body = body.slice(1); }
  else if (body.startsWith('_')) { accidental = -1; body = body.slice(1); }
  else if (body.startsWith('=')) { accidental = 0; body = body.slice(1); }
  // ABC: C = C4, c = C5, C, = C3, c' = C6
  const lower = body.toLowerCase();
  const step = lower.replace(/[,']/g, '').toUpperCase();
  const commas = (body.match(/,/g) || []).length;
  const apostrophes = (body.match(/'/g) || []).length;
  const octave = body === lower
    ? 5 + apostrophes - commas
    : 4 - commas + apostrophes;
  return { step: step.charAt(0), octave: octave, accidental: accidental, abcName: raw };
}

function parseDecorations(symbol) {
  const decorations = [];
  let abcLeading = '';
  let fingeringLabel = '';
  if (Array.isArray(symbol.decoration)) {
    symbol.decoration.forEach(function(name) {
      const text = String(name || '');
      if (text.indexOf(FINGER_LABEL_ABC_PREFIX) === 0 && text.length > FINGER_LABEL_ABC_PREFIX.length) {
        if (!fingeringLabel) fingeringLabel = text.slice(FINGER_LABEL_ABC_PREFIX.length);
        return;
      }
      const key = decorationKeyFromAbcjs(name);
      if (key) decorations.push(key);
      else abcLeading += '!' + text + '!';
    });
  }
  if (!fingeringLabel && abcLeading) {
    const match = abcLeading.match(new RegExp('^!' + FINGER_LABEL_ABC_PREFIX + '([^!]*)!'));
    if (match) {
      fingeringLabel = match[1];
      abcLeading = abcLeading.replace(new RegExp('^!' + FINGER_LABEL_ABC_PREFIX + '[^!]*!'), '');
    }
  }
  return { decorations: decorations, abcLeading: abcLeading, fingeringLabel: fingeringLabel };
}

function parseGraceNotes(symbol, unitLengthDecimal) {
  if (!Array.isArray(symbol.gracenotes) || symbol.gracenotes.length === 0) return [];
  return symbol.gracenotes.map(function(gn) {
    return {
      pitch: pitchFromAbcjsName(gn.name),
      duration: rationalFromAbcjsDuration(gn.duration, unitLengthDecimal),
      acciaccatura: true,
    };
  }).filter(function(g) { return g.pitch; });
}

function parseTieFromPitches(pitches) {
  let tieStart = false;
  let tieEnd = false;
  if (!pitches || !pitches.length) return { tieStart: tieStart, tieEnd: tieEnd };
  pitches.forEach(function(p) {
    if (p.startTie) tieStart = true;
    if (p.endTie) tieEnd = true;
  });
  return { tieStart: tieStart, tieEnd: tieEnd };
}

function parseSlurFromPitches(pitches, ctx) {
  let slurStart = false;
  let slurEnd = false;
  let slurGroupId = null;
  if (!pitches || !pitches.length) return { slurStart, slurEnd, slurGroupId };
  const p = pitches[0];
  if (p.startSlur && p.startSlur.length) {
    slurStart = true;
    const label = p.startSlur[0].label;
    slurGroupId = 'slur-' + label;
    ctx.slurStack[label] = slurGroupId;
  }
  if (p.endSlur != null && p.endSlur !== false) {
    slurEnd = true;
    const label = typeof p.endSlur === 'number' ? p.endSlur : (Array.isArray(p.endSlur) ? p.endSlur[0] : p.endSlur);
    slurGroupId = ctx.slurStack[label] || ('slur-' + label);
    delete ctx.slurStack[label];
  }
  return { slurStart, slurEnd, slurGroupId };
}

function parseTupletFromSymbol(symbol, ctx) {
  if (symbol.startTriplet) {
    ctx.tupletGroup = {
      groupId: createEventId('tup'),
      num: symbol.startTriplet,
      den: symbol.tripletR ? Math.round(symbol.startTriplet / (symbol.tripletMultiplier * symbol.startTriplet)) || 2 : 2,
      index: 0,
      size: symbol.startTriplet,
    };
    if (symbol.tripletR && symbol.tripletMultiplier) {
      ctx.tupletGroup.den = Math.round(symbol.startTriplet * symbol.tripletMultiplier) || 2;
    }
  }
  let tuplet = null;
  if (ctx.tupletGroup) {
    tuplet = {
      num: ctx.tupletGroup.num,
      den: ctx.tupletGroup.den,
      groupId: ctx.tupletGroup.groupId,
      indexInGroup: ctx.tupletGroup.index,
      size: ctx.tupletGroup.size,
    };
    ctx.tupletGroup.index += 1;
  }
  if (symbol.endTriplet) ctx.tupletGroup = null;
  return tuplet;
}

/** ABC chord symbols attached to a note/rest ("Am", "G7", …). */
function parseChordSymbols(symbol) {
  if (!symbol || !Array.isArray(symbol.chord) || symbol.chord.length === 0) return [];
  return symbol.chord.map(function(entry) {
    return String(entry && entry.name != null ? entry.name : '')
      .replace(/♭/g, 'b')
      .replace(/♯/g, '#');
  }).filter(Boolean);
}

function symbolToEvent(symbol, unitLengthDecimal, ctx) {
  if (!symbol) return null;
  if (symbol.el_type === 'bar') {
    let barToken = '|';
    if (symbol.type === 'bar_thin_thin') barToken = '||';
    else if (symbol.type === 'bar_thin_thick') barToken = '|]';
    else if (symbol.type === 'bar_thick_thin') barToken = '[|';
    else if (symbol.type === 'bar_left_repeat') barToken = '|:';
    else if (symbol.type === 'bar_right_repeat') barToken = ':|';
    else if (symbol.type === 'bar_dotted_repeat') barToken = ':|:';
    const ev = {
      id: createEventId('bar'),
      type: 'barline',
      barToken: barToken,
      duration: { num: 0, den: 1, dotted: false },
      tieStart: false,
      tieEnd: false,
      chordSymbols: parseChordSymbols(symbol),
    };
    ctx.advance(ev);
    return ev;
  }
  if (symbol.el_type === 'key' || symbol.el_type === 'keySignature') {
    const ev = Object.assign({
      id: createEventId('key'),
      type: 'keyChange',
      key: keyTextFromAbcjsSymbol(symbol, ctx.abcSource),
    }, zeroDurationFields());
    ctx.advance(ev);
    return ev;
  }
  if (symbol.el_type === 'meter' || symbol.el_type === 'timeSignature') {
    const meterText = meterTextFromAbcjsSymbol(symbol, ctx.abcSource);
    if (!meterText) return null;
    const ev = Object.assign({
      id: createEventId('meter'),
      type: 'meterChange',
      meter: meterText,
    }, zeroDurationFields());
    ctx.advance(ev);
    return ev;
  }
  if (symbol.el_type === 'stem') return null;
  if (symbol.el_type !== 'note') return null;
  const duration = rationalFromAbcjsDuration(symbol.duration, unitLengthDecimal);
  const deco = parseDecorations(symbol);
  const tieInfo = parseTieFromPitches(symbol.pitches);
  const slurInfo = parseSlurFromPitches(symbol.pitches, ctx);
  const tuplet = parseTupletFromSymbol(symbol, ctx);
  const graceNotes = parseGraceNotes(symbol, unitLengthDecimal);
  const chordSymbols = parseChordSymbols(symbol);

  if (symbol.rest && symbol.rest.type === 'rest') {
    const ev = Object.assign({
      id: createEventId('rest'),
      type: 'rest',
      pitches: null,
      pitch: null,
      duration: duration,
      tieStart: tieInfo.tieStart,
      tieEnd: tieInfo.tieEnd,
      sourceToken: 'z',
    }, defaultNoteExtensions(), deco, slurInfo, {
      graceNotes: graceNotes,
      tuplet: tuplet,
      chordSymbols: chordSymbols,
    });
    ctx.advance(ev);
    return ev;
  }
  const pitches = (symbol.pitches || []).map(function(p) {
    return pitchFromAbcjsName(p.name);
  }).filter(Boolean);
  if (pitches.length === 0) return null;
  const type = pitches.length > 1 ? 'chord' : 'note';
  const ev = Object.assign({
    id: createEventId(type),
    type: type,
    pitches: pitches,
    pitch: pitches.length === 1 ? pitches[0] : null,
    duration: duration,
    tieStart: tieInfo.tieStart,
    tieEnd: tieInfo.tieEnd,
    sourceToken: null,
  }, defaultNoteExtensions(), deco, slurInfo, {
    graceNotes: graceNotes,
    tuplet: tuplet,
    chordSymbols: chordSymbols,
  });
  ctx.advance(ev);
  return ev;
}

function extractSerializedFingeringLabels(body) {
  const labels = [];
  const re = /!fgr([^!]+)!/g;
  let match;
  while ((match = re.exec(String(body || ''))) !== null) {
    labels.push(match[1]);
  }
  return labels;
}

function applySerializedFingeringLabels(events, body) {
  const labels = extractSerializedFingeringLabels(body);
  if (!labels.length) return events;
  let noteIdx = 0;
  events.forEach(function(ev) {
    if (ev.type !== 'note' && ev.type !== 'chord') return;
    if (labels[noteIdx]) {
      ev.fingeringLabel = labels[noteIdx];
    }
    noteIdx += 1;
  });
  return events;
}

export function parseVoiceEvents(voiceBody, tuneMeta) {
  const meter = tuneMeta && tuneMeta.meter ? tuneMeta.meter : '4/4';
  const noteLength = tuneMeta && tuneMeta.noteLength ? tuneMeta.noteLength : '';
  const key = tuneMeta && tuneMeta.key ? tuneMeta.key : 'C';
  const unit = parseNoteLengthDecimal(noteLength, meter);
  const body = String(voiceBody || '').trim();
  if (!body) return [];
  const abc = 'X:1\nT:t\nM:' + meter + '\nL:' + (noteLength || '1/8') + '\nK:' + key + '\n' + body + '\n';
  let parsed;
  try {
    parsed = abcjs.parseOnly(abc);
  } catch (e) {
    return [];
  }
  if (!parsed || !parsed[0]) return [];
  const events = [];
  const beatsPerBar = beatsPerBarFromMeter(meter);
  const ctx = {
    abcSource: abc,
    cursorBeat: 0,
    measureIndex: 0,
    slurStack: {},
    tupletGroup: null,
    advance: function(ev) {
      ev.startBeat = ctx.cursorBeat;
      ev.durationBeats = durationToBeats(ev.duration, unit);
      ev.measureIndex = ctx.measureIndex;
      if (!isLayoutEventType(ev.type)) {
        ctx.cursorBeat += ev.durationBeats;
        if (ctx.cursorBeat >= beatsPerBar * (ctx.measureIndex + 1) - 0.0001) {
          ctx.measureIndex = Math.floor(ctx.cursorBeat / beatsPerBar);
        }
      }
      events.push(ev);
    },
  };
  parsed[0].lines.forEach(function(line, lineIndex) {
    if (lineIndex > 0) {
      ctx.advance({
        id: createEventId('break'),
        type: 'lineBreak',
        duration: { num: 0, den: 1, dotted: false },
        tieStart: false,
        tieEnd: false,
      });
    }
    if (!line.staff || !line.staff[0] || !line.staff[0].voices) return;
    const voice = line.staff[0].voices[0] || [];
    voice.forEach(function(symbol) {
      symbolToEvent(symbol, unit, ctx);
    });
  });
  stampSlurGroupMembers(events);
  applySerializedFingeringLabels(events, body);
  return assignTimingToEvents(events, meter, unit);
}

/** Fill slurGroupId on notes between slur start and end (abcjs only marks endpoints). */
function stampSlurGroupMembers(events) {
  let activeId = null;
  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i];
    if (!ev || (ev.type !== 'note' && ev.type !== 'chord')) continue;
    if (ev.slurStart && ev.slurGroupId) activeId = ev.slurGroupId;
    if (activeId) ev.slurGroupId = activeId;
    if (ev.slurEnd) activeId = null;
  }
}

export { beatsToDuration };
