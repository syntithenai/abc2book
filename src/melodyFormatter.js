const ABC_NAMES = ['C', '^C', 'D', '^D', 'E', 'F', '^F', 'G', '^G', 'A', '^A', 'B'];

function midiToAbcPitch(midi) {
  const value = Math.round(Number(midi) || 0);
  const pitchClass = ((value % 12) + 12) % 12;
  const octave = Math.floor(value / 12) - 1;
  const name = ABC_NAMES[pitchClass];

  if (octave >= 5) {
    return name.toLowerCase() + "'".repeat(octave - 5);
  }
  if (octave === 4) {
    return name;
  }
  return name + ','.repeat(Math.max(0, 4 - octave));
}

function getBeatDuration(beatTimes, beatIndex) {
  const start = Number(beatTimes[beatIndex]) || 0;
  const end = beatIndex + 1 < beatTimes.length
    ? Number(beatTimes[beatIndex + 1])
    : start + 0.5;
  return Math.max(0.05, end - start);
}

function quantizeDuration(duration, beatDuration, slotsPerBeat) {
  const slotDuration = beatDuration / Math.max(1, slotsPerBeat);
  const slots = Math.max(1, Math.round(duration / slotDuration));
  if (slots === 1) return '';
  if (slots === 2) return '2';
  if (slots === 3) return '3';
  if (slots === 4) return '4';
  return String(slots);
}

function findBeatIndex(beatTimes, time) {
  let index = 0;
  for (let i = 0; i < beatTimes.length; i++) {
    if (Number(beatTimes[i]) <= time) {
      index = i;
    } else {
      break;
    }
  }
  return index;
}

export function formatMelodyNotes(options) {
  const {
    notes,
    beatTimes,
    beatsPerBar,
    slotsPerBeat,
  } = options || {};

  if (!Array.isArray(notes) || notes.length === 0) return '';
  if (!Array.isArray(beatTimes) || beatTimes.length === 0) return '';

  const safeBeatsPerBar = Math.max(1, parseInt(beatsPerBar, 10) || 4);
  const safeSlotsPerBeat = Math.max(1, parseInt(slotsPerBeat, 10) || 2);
  const bars = [];
  let currentBar = null;

  function ensureBar(barNumber) {
    while (bars.length <= barNumber) {
      bars.push([]);
    }
    currentBar = bars[barNumber];
  }

  notes.forEach(function(note) {
    const start = Number(note.start) || 0;
    const end = Number(note.end) || start;
    const beatIndex = findBeatIndex(beatTimes, start);
    const barNumber = Math.floor(beatIndex / safeBeatsPerBar);
    const beatInBar = beatIndex % safeBeatsPerBar;
    const beatDuration = getBeatDuration(beatTimes, beatIndex);
    const duration = quantizeDuration(end - start, beatDuration, safeSlotsPerBeat);
    const pitch = midiToAbcPitch(note.midi);

    ensureBar(barNumber);
    currentBar.push({
      slot: beatInBar * safeSlotsPerBeat,
      token: pitch + duration,
    });
  });

  return bars.map(function(barNotes, barIndex) {
    const slots = new Array(safeBeatsPerBar * safeSlotsPerBeat).fill('z');
    barNotes.forEach(function(entry) {
      if (entry.slot >= 0 && entry.slot < slots.length) {
        slots[entry.slot] = entry.token;
      }
    });
    const suffix = ((barIndex + 1) % 4 === 0) ? ' |\n' : ' | ';
    return slots.join(' ') + suffix;
  }).join('').trim();
}
