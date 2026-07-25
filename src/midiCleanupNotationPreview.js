/**
 * Client-side quantization preview for MIDI cleanup notation.
 * Mirrors local-resolver/midi_to_abc.py format_notes_to_abc_body (pitched + drums).
 */

import {
  buildVoiceProgramPrefix,
  displayNameForMidiTrack,
} from './midiTrackNaming';
import {
  durationSuffix,
  fillSlotGap,
  formatNoteEventsToAbcBody,
  trimNotesForQuantization,
} from './midiAbcQuantize';

const GM_DRUM_MAP = {
  35: ['C,', ''],
  36: ['C,', ''],
  37: ['^C,', ''],
  38: ['D', ''],
  39: ['^D', ''],
  40: ['E', ''],
  41: ['F,', ''],
  42: ['^F', 'x'],
  43: ['G,', ''],
  44: ['^G', 'x'],
  45: ['A,', ''],
  46: ['^A', 'x'],
  47: ['B,', ''],
  48: ['c', ''],
  49: ['^c', 'x'],
  50: ['d', ''],
  51: ['^d', 'x'],
  52: ['e', 'x'],
  53: ['f', ''],
  54: ['^f', 'x'],
  55: ['g', 'x'],
  56: ['^g', ''],
  57: ['a', 'x'],
  58: ['^a', 'x'],
  59: ['b', 'x'],
};

function abcPitch(midi, key) {
  const namesSharp = ['C', '^C', 'D', '^D', 'E', 'F', '^F', 'G', '^G', 'A', '^A', 'B'];
  const namesFlat = ['C', '_D', 'D', '_E', 'E', 'F', '_G', 'G', '_A', 'A', '_B', 'B'];
  const preferFlats = /b/i.test(key) || ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'].indexOf(key) >= 0;
  const names = preferFlats ? namesFlat : namesSharp;
  const octave = Math.floor(midi / 12) - 1;
  const letter = names[midi % 12];
  if (octave >= 5) {
    return letter.toLowerCase() + (octave > 5 ? "'".repeat(octave - 5) : '');
  }
  if (octave === 4) return letter;
  const commas = 4 - octave;
  return letter + (commas > 0 ? ','.repeat(commas) : '');
}

function gmDrumEntry(midiPitch) {
  const entry = GM_DRUM_MAP[midiPitch];
  if (entry) return entry;
  const octave = Math.max(0, Math.floor(midiPitch / 12) - 1);
  const letter = octave >= 5 ? 'c' : 'C';
  const suffix = octave >= 5 ? "'".repeat(Math.max(0, octave - 5)) : ','.repeat(Math.max(0, 4 - octave));
  return [letter + suffix, ''];
}

function drumNoteToAbcToken(midiPitch, durationSuffixStr) {
  const parts = gmDrumEntry(midiPitch);
  const token = parts[0] + durationSuffixStr;
  return parts[1] === 'x' ? '!' + token + '!' : token;
}

function buildDrummapLines(notes) {
  const pitches = new Set();
  (notes || []).forEach(function(note) {
    pitches.add(Number(note.midi) || 0);
  });
  return Array.from(pitches).sort(function(a, b) { return a - b; }).map(function(pitch) {
    const abcNote = gmDrumEntry(pitch)[0];
    return '%%MIDI drummap ' + abcNote + ' ' + pitch;
  });
}

export function buildBeatTimes(durationSec, tempoBpm) {
  const beatDuration = 60 / Math.max(tempoBpm || 120, 1);
  const times = [0];
  let t = beatDuration;
  while (t < durationSec + beatDuration) {
    times.push(Math.round(t * 10000) / 10000);
    t += beatDuration;
  }
  return times;
}

function noteEventsFromMidi(notes, beatTimes, options) {
  const opts = options || {};
  const beatsPerBar = opts.beatsPerBar || 4;
  const slotsPerBeat = Math.max(1, opts.slotsPerBeat || 2);
  const key = opts.key || 'C';
  const isDrum = !!opts.isDrum;
  if (!notes || !notes.length || !beatTimes.length) return [];

  const beatDuration = beatTimes.length > 1 ? (beatTimes[1] - beatTimes[0]) : 0.5;
  const slotDuration = beatDuration / slotsPerBeat;
  const events = [];

  notes.forEach(function(note) {
    const start = Number(note.start) || 0;
    const end = Number(note.end) || start;
    const duration = Math.max(end - start, slotDuration * 0.5);
    let beatIndex = 0;
    for (let i = 0; i < beatTimes.length; i += 1) {
      if (beatTimes[i] <= start + 0.001) beatIndex = i;
    }
    const beatStart = beatTimes[beatIndex];
    const offsetInBeat = start - beatStart;
    const slotInBeat = Math.max(0, Math.min(slotsPerBeat - 1, Math.round(offsetInBeat / slotDuration)));
    const globalSlot = beatIndex * slotsPerBeat + slotInBeat;
    const durSlots = Math.max(1, Math.round(duration / slotDuration));
    const dur = durationSuffix(durSlots, slotsPerBeat * 2);
    const token = isDrum
      ? drumNoteToAbcToken(Number(note.midi) || 38, dur)
      : abcPitch(Number(note.midi) || 60, key) + dur;
    events.push({ slot: globalSlot, durSlots: durSlots, token: token });
  });

  return events;
}

export function formatNotesToAbcBody(notes, options) {
  const events = noteEventsFromMidi(notes, (options && options.beatTimes) || [], options);
  return formatNoteEventsToAbcBody(events, options);
}

function clefForVoice(voice) {
  if (voice.isDrum) return 'perc';
  if (voice.roleHint === 'bass') return 'bass';
  return 'treble';
}

function displayNameForVoice(voice) {
  return displayNameForMidiTrack(voice);
}

function buildVoicePrefix(voice, notes) {
  if (voice.isDrum) return buildDrummapLines(notes);
  return buildVoiceProgramPrefix(voice);
}

function safeVoiceName(name) {
  return String(name || '').replace(/"/g, '');
}

export function buildCleanupScorePreviewAbc(voices, options) {
  const opts = options || {};
  const tempoBpm = opts.tempoBpm || 120;
  const meter = opts.meter || '4/4';
  const key = opts.key || 'C';
  const beatsPerBar = opts.beatsPerBar || parseInt(String(meter).split('/')[0], 10) || 4;
  const slotsPerBeat = opts.slotsPerBeat || 2;
  const noteLength = opts.noteLength || '1/8';
  const minBarDuration = beatsPerBar * (60 / tempoBpm);
  const voiceList = (voices || []).filter(function(v) { return v && v.notes && v.notes.length; });
  if (!voiceList.length) return '';

  const prepared = voiceList.map(function(voice) {
    const trimmed = trimNotesForQuantization(voice.notes, 1.0);
    return {
      voice: voice,
      notes: trimmed.notes,
      durationSec: trimmed.durationSec,
    };
  }).filter(function(row) { return row.notes.length; });

  if (!prepared.length) return '';

  const quantOpts = {
    beatsPerBar: beatsPerBar,
    slotsPerBeat: slotsPerBeat,
    key: key,
  };

  const maxVoiceDuration = prepared.reduce(function(max, row) {
    return Math.max(max, row.durationSec);
  }, minBarDuration);
  const sharedBeatTimes = buildBeatTimes(maxVoiceDuration, tempoBpm);
  const barSlots = beatsPerBar * slotsPerBeat;

  const voiceEvents = prepared.map(function(row) {
    return {
      voice: row.voice,
      notes: row.notes,
      events: noteEventsFromMidi(row.notes, sharedBeatTimes, Object.assign({}, quantOpts, {
        isDrum: row.voice.isDrum,
      })),
    };
  });

  const maxEnd = voiceEvents.reduce(function(max, item) {
    const localMax = item.events.reduce(function(innerMax, event) {
      return Math.max(innerMax, event.slot + Math.max(1, event.durSlots || 1));
    }, 0);
    return Math.max(max, localMax);
  }, 0);
  const beatDuration = 60 / Math.max(tempoBpm, 1);
  const barDuration = beatsPerBar * beatDuration;
  const durationBars = Math.max(1, Math.ceil(maxVoiceDuration / barDuration));
  const slotBars = Math.max(1, Math.ceil(maxEnd / barSlots));
  const totalBars = Math.max(1, slotBars, durationBars + 2);

  const bodies = voiceEvents.map(function(item) {
    const body = formatNoteEventsToAbcBody(item.events, Object.assign({}, quantOpts, {
      totalBars: totalBars,
    }));
    const prefix = buildVoicePrefix(item.voice, item.notes);
    return {
      voice: item.voice,
      body: body,
      prefix: prefix,
    };
  }).filter(function(row) { return row.body; });

  if (!bodies.length) return '';

  const lines = [
    'X:1',
    'M:' + meter,
    'L:' + noteLength,
    'K:' + key,
  ];

  bodies.forEach(function(row) {
    if (row.prefix.length) {
      row.prefix.forEach(function(prefixLine) {
        lines.push(prefixLine);
      });
    }
    const name = displayNameForVoice(row.voice);
    lines.push('V:' + row.voice.id + ' nm="' + safeVoiceName(name) + '" clef=' + clefForVoice(row.voice));
  });

  bodies.forEach(function(row) {
    lines.push('[V:' + row.voice.id + ']');
    lines.push(row.body);
  });

  return lines.join('\n');
}

/** @deprecated Use buildCleanupScorePreviewAbc */
export function buildCleanupNotationOverlayAbc(_beforeNotes, afterNotes, options) {
  return buildCleanupScorePreviewAbc([{ id: 1, notes: afterNotes, isDrum: false, roleHint: 'melody', program: 0 }], options);
}
