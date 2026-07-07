import { createEventId } from './voiceEventModel';
import { beatsToDuration, beatsPerBarFromMeter } from './beatGrid';
import { quantizeVoiceEvents } from './quantizeVoiceEvents';
import { defaultNoteExtensions } from './notationMarks';
import { pitchFromMidi } from './notationActions';

export function appendMidiRecordNote(buffer, payload, isNoteOn) {
  const buf = (buffer || []).slice();
  if (isNoteOn) {
    buf.push({
      midi: payload.midi,
      velocity: payload.velocity || 64,
      startMs: payload.timeMs,
      endMs: null,
    });
  } else {
    for (let i = buf.length - 1; i >= 0; i -= 1) {
      if (buf[i].midi === payload.midi && buf[i].endMs == null) {
        buf[i] = Object.assign({}, buf[i], { endMs: payload.timeMs });
        break;
      }
    }
  }
  return buf;
}

export function midiRecordBufferToEvents(buffer, session, options) {
  const opts = options || {};
  const notes = (buffer || []).filter(function(n) { return n.endMs != null && n.endMs > n.startMs; });
  if (!notes.length) return { events: [], caretIndex: session.caretIndex };

  const sorted = notes.slice().sort(function(a, b) { return a.startMs - b.startMs; });
  const originMs = sorted[0].startMs;
  const tempo = session.tuneMeta.tempo > 0 ? session.tuneMeta.tempo : 120;
  const msPerBeat = 60000 / tempo;
  const unit = session.unitLengthDecimal;
  const slotsPerBeat = opts.slotsPerBeat || session.snapSlotsPerBeat || 4;

  const rawEvents = sorted.map(function(note) {
    const startBeat = ((note.startMs - originMs) / msPerBeat);
    const durationBeats = Math.max((note.endMs - note.startMs) / msPerBeat, unit);
    const pitch = pitchFromMidi(note.midi, session.tuneMeta);
    return Object.assign({
      id: createEventId('note'),
      type: 'note',
      pitch: pitch,
      pitches: [pitch],
      duration: beatsToDuration(durationBeats, unit),
      tieStart: false,
      tieEnd: false,
      startBeat: startBeat,
      durationBeats: durationBeats,
    }, defaultNoteExtensions());
  });

  const quantizeOpts = {
    strength: opts.strength != null ? opts.strength : 1,
    slotsPerBeat: slotsPerBeat,
    quantizeStart: opts.quantizeStart !== false,
    quantizeDuration: opts.quantizeDuration !== false,
    meter: session.tuneMeta.meter,
    noteLength: session.tuneMeta.noteLength,
    key: session.tuneMeta.key,
    tempo: session.tuneMeta.tempo || 120,
    beatsPerBar: beatsPerBarFromMeter(session.tuneMeta.meter),
  };
  if (opts.beatTimes && opts.beatTimes.length) {
    quantizeOpts.beatTimes = opts.beatTimes;
  }
  const quantized = quantizeVoiceEvents(rawEvents, quantizeOpts);

  const insertAt = Math.min(session.caretIndex, session.events.length);
  const events = session.events.slice();
  events.splice.apply(events, [insertAt, 0].concat(quantized));
  return {
    events: events,
    caretIndex: insertAt + quantized.length,
  };
}
