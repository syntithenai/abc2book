import { rectIntersectsMarquee } from './pianoRollGeometry';
import { pitchToMidi } from './voiceEventModel';
import { moveNoteTiming, moveNotePitch, achieveDuration } from './timingEdit';
import { cloneVoiceEvent, createEventId } from './voiceEventModel';
import { eventDurationBeats } from './pianoRollEdit';

export function hitTestNote(events, beat, midi, pitchRange, rowHeight) {
  let best = null;
  let bestDist = Number.POSITIVE_INFINITY;
  events.forEach(function(ev) {
    if (ev.type !== 'note' && ev.type !== 'chord') return;
    const midis = (ev.pitches || [ev.pitch]).map(function(p) { return pitchToMidi(p); }).filter(function(m) { return m != null; });
    midis.forEach(function(m, ti) {
      const noteMidi = m;
      const y = (pitchRange.max - noteMidi) * rowHeight;
      const dy = Math.abs(y - (pitchRange.max - midi) * rowHeight);
      const dx = Math.abs((ev.startBeat || 0) - beat);
      const dist = dx + dy / rowHeight;
      if (dist < bestDist) {
        bestDist = dist;
        best = { eventId: ev.id, toneIndex: ti };
      }
    });
  });
  return bestDist < 1.5 ? best : null;
}

export function marqueeSelect(events, marquee, pitchRange, rowHeight, beatWidth) {
  const ids = [];
  events.forEach(function(ev) {
    if (ev.type !== 'note' && ev.type !== 'chord') return;
    const midis = (ev.pitches || [ev.pitch]).map(function(p) { return pitchToMidi(p); }).filter(function(m) { return m != null; });
    const w = Math.max(8, (ev.durationBeats || 0.5) * beatWidth);
    const hit = midis.some(function(midi) {
      const rect = {
        x: (ev.startBeat || 0) * beatWidth,
        y: (pitchRange.max - midi) * rowHeight,
        width: w,
        height: rowHeight - 2,
      };
      return rectIntersectsMarquee(rect, marquee);
    });
    if (hit && ids.indexOf(ev.id) < 0) ids.push(ev.id);
  });
  return ids;
}

export function nudgeSelection(events, eventIds, deltaBeat, deltaMidi, tuneMeta, toneIndex) {
  let next = events.map(cloneVoiceEvent);
  const idSet = {};
  eventIds.forEach(function(id) { idSet[id] = true; });

  if (Math.abs(deltaBeat) > 0.0001) {
    eventIds.forEach(function(id) {
      const ev = next.find(function(x) { return x.id === id; });
      if (!ev) return;
      next = moveNoteTiming(next, id, Math.max(0, (ev.startBeat || 0) + deltaBeat), tuneMeta);
    });
  }

  if (deltaMidi) {
    eventIds.forEach(function(id) {
      const ev = next.find(function(x) { return x.id === id; });
      if (!ev) return;
      const ti = typeof toneIndex === 'number' ? toneIndex : 0;
      const pitches = ev.pitches || (ev.pitch ? [ev.pitch] : []);
      const p = pitches[ti];
      if (!p) return;
      const midi = pitchToMidi(p) + deltaMidi;
      next = moveNotePitch(next, id, ti, midi, tuneMeta);
    });
  }

  return next;
}

export function duplicateSelection(events, eventIds, beatOffset, tuneMeta) {
  const idSet = {};
  eventIds.forEach(function(id) { idSet[id] = true; });
  const clones = [];
  events.forEach(function(ev) {
    if (!idSet[ev.id]) return;
    const copy = cloneVoiceEvent(ev);
    copy.id = createEventId(ev.type);
    clones.push({ ev: copy, startBeat: (ev.startBeat || 0) + beatOffset });
  });

  let next = events.map(cloneVoiceEvent);
  clones.forEach(function(item) {
    next.push(item.ev);
    next = moveNoteTiming(next, item.ev.id, item.startBeat, tuneMeta);
  });
  return next;
}

export function selectedDurationBeats(events, eventIds, tuneMeta) {
  const idSet = {};
  eventIds.forEach(function(id) { idSet[id] = true; });
  return events
    .filter(function(ev) { return idSet[ev.id]; })
    .map(function(ev) { return eventDurationBeats(ev, tuneMeta); });
}
