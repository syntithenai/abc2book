/**
 * Client-side quantization preview for MIDI cleanup notation.
 * Mirrors local-resolver/midi_to_abc.py format_notes_to_abc_body (pitched + drums).
 */

import {
  buildVoiceProgramPrefix,
  displayNameForMidiTrack,
} from './midiTrackNaming';
import { midiToAbcPitch } from './melodyPitchSpelling';
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
  return midiToAbcPitch(midi, { key: key || 'C' });
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
  const slotsPerBeat = Math.max(1, opts.slotsPerBeat || 2);
  const key = opts.key || 'C';
  const isDrum = !!opts.isDrum;
  // ABC must land on a discrete grid. Partial strength caused melody/chord drift;
  // when quantize is enabled (strength > 0), snap fully to the nearest slot.
  const quantizeOn = opts.quantStrength == null || opts.quantStrength > 0;
  if (!notes || !notes.length) return [];

  const ticksPerBeat = opts.ticksPerBeat > 0 ? opts.ticksPerBeat : 0;
  const useTicks = ticksPerBeat > 0 && notes.some(function(n) { return n.startTick != null; });

  const beatDuration = beatTimes && beatTimes.length > 1
    ? (beatTimes[1] - beatTimes[0])
    : (60 / Math.max(opts.tempoBpm || 120, 1));
  const slotDuration = beatDuration / slotsPerBeat;
  const ticksPerSlot = useTicks ? (ticksPerBeat / slotsPerBeat) : 0;
  const clusterTicks = useTicks ? Math.max(1, Math.round(ticksPerSlot * 0.4)) : 0;
  const clusterSec = slotDuration * 0.4;

  const ordered = notes.slice().sort(function(a, b) {
    const aKey = useTicks && a.startTick != null ? a.startTick : (Number(a.start) || 0);
    const bKey = useTicks && b.startTick != null ? b.startTick : (Number(b.start) || 0);
    return aKey - bKey || (Number(a.midi) || 0) - (Number(b.midi) || 0);
  });

  // Cluster near-simultaneous onsets so chord tones share one slot.
  const clusters = [];
  ordered.forEach(function(note) {
    const onset = useTicks && note.startTick != null
      ? note.startTick
      : (Number(note.start) || 0);
    const last = clusters.length ? clusters[clusters.length - 1] : null;
    const lastOnset = last
      ? (useTicks ? last.anchorTick : last.anchorSec)
      : null;
    const within = last
      && (useTicks
        ? Math.abs(onset - lastOnset) <= clusterTicks
        : Math.abs(onset - lastOnset) <= clusterSec);
    if (within) {
      last.notes.push(note);
      if (useTicks) {
        last.anchorTick = Math.min(last.anchorTick, onset);
      } else {
        last.anchorSec = Math.min(last.anchorSec, onset);
      }
      return;
    }
    clusters.push({
      notes: [note],
      anchorTick: useTicks ? onset : null,
      anchorSec: useTicks ? null : onset,
    });
  });

  const events = [];
  clusters.forEach(function(cluster) {
    let startSlot;
    if (useTicks) {
      const rawSlot = cluster.anchorTick / ticksPerSlot;
      startSlot = quantizeOn ? Math.round(rawSlot) : Math.floor(rawSlot);
    } else {
      const rawSlot = cluster.anchorSec / slotDuration;
      startSlot = quantizeOn ? Math.round(rawSlot) : Math.floor(rawSlot);
    }
    startSlot = Math.max(0, startSlot);

    cluster.notes.forEach(function(note) {
      let endSlot;
      if (useTicks && note.endTick != null) {
        const rawEnd = note.endTick / ticksPerSlot;
        endSlot = quantizeOn ? Math.round(rawEnd) : Math.ceil(rawEnd);
      } else {
        const endSec = Number(note.end) || (Number(note.start) || 0);
        const rawEnd = endSec / slotDuration;
        endSlot = quantizeOn ? Math.round(rawEnd) : Math.ceil(rawEnd);
      }
      const durSlots = Math.max(1, endSlot - startSlot);
      const dur = durationSuffix(durSlots, slotsPerBeat * 2);
      const token = isDrum
        ? drumNoteToAbcToken(Number(note.midi) || 38, dur)
        : abcPitch(Number(note.midi) || 60, key) + dur;
      events.push({ slot: startSlot, durSlots: durSlots, token: token, midi: Number(note.midi) || 0 });
    });
  });

  return events;
}

export function formatNotesToAbcBody(notes, options) {
  const events = noteEventsFromMidi(notes, (options && options.beatTimes) || [], options);
  return formatNoteEventsToAbcBody(events, options);
}

function clefForVoice(voice) {
  if (voice.isDrum || voice.staff === 'perc') return 'perc';
  if (voice.staff && voice.staff !== 'auto') return voice.staff;
  if (voice.roleHint === 'bass') return 'bass';
  return 'treble';
}

function displayNameForVoice(voice) {
  if (voice.displayName) return voice.displayName;
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
  const quantStrength = opts.quantStrength != null ? opts.quantStrength : 1;
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
    quantStrength: quantStrength,
    tempoBpm: tempoBpm,
    ticksPerBeat: opts.ticksPerBeat || 0,
  };

  const maxVoiceDuration = prepared.reduce(function(max, row) {
    return Math.max(max, row.durationSec);
  }, minBarDuration);
  const sharedBeatTimes = buildBeatTimes(maxVoiceDuration, tempoBpm);
  const barSlots = beatsPerBar * slotsPerBeat;

  const voiceEvents = prepared.map(function(row) {
    const voiceKey = row.voice.key || row.voice.estimatedKey || key;
    return {
      voice: row.voice,
      notes: row.notes,
      voiceKey: voiceKey,
      events: noteEventsFromMidi(row.notes, sharedBeatTimes, Object.assign({}, quantOpts, {
        isDrum: row.voice.isDrum,
        key: voiceKey,
      })),
      allowChords: row.voice.allowChords !== false && !row.voice.isDrum,
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
    const voiceKey = item.voiceKey || key;
    const body = formatNoteEventsToAbcBody(item.events, Object.assign({}, quantOpts, {
      totalBars: totalBars,
      key: voiceKey,
      allowChords: item.allowChords,
    }));
    const prefix = buildVoicePrefix(item.voice, item.notes);
    return {
      voice: item.voice,
      voiceKey: voiceKey,
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
    // Per-voice key so multi-track imports show each track's signature in ABC preview.
    lines.push('K:' + (row.voiceKey || key));
    lines.push(row.body);
  });

  return lines.join('\n');
}

/** Two-staff preview for pitch-split dialog (high treble, low bass). */
export function buildPitchSplitPreviewAbc(notes, pitchCutoff, options) {
  const cutoff = Math.max(1, Math.min(127, Math.round(Number(pitchCutoff) || 60)));
  const high = (notes || []).filter(function(n) { return (Number(n.midi) || 0) >= cutoff; });
  const low = (notes || []).filter(function(n) { return (Number(n.midi) || 0) < cutoff; });
  return buildCleanupScorePreviewAbc([
    {
      id: 1,
      notes: high,
      isDrum: false,
      roleHint: 'melody',
      staff: 'treble',
      displayName: 'High',
      program: 0,
    },
    {
      id: 2,
      notes: low,
      isDrum: false,
      roleHint: 'bass',
      staff: 'bass',
      displayName: 'Low',
      program: 0,
    },
  ], options);
}

/** @deprecated Use buildCleanupScorePreviewAbc */
export function buildCleanupNotationOverlayAbc(_beforeNotes, afterNotes, options) {
  return buildCleanupScorePreviewAbc([{ id: 1, notes: afterNotes, isDrum: false, roleHint: 'melody', program: 0 }], options);
}
