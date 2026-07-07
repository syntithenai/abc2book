export const DEFAULT_BEAT_WIDTH = 48;
export const DEFAULT_ROW_HEIGHT = 14;

export function beatToX(beat, beatWidth) {
  return beat * (beatWidth || DEFAULT_BEAT_WIDTH);
}

export function xToBeat(x, beatWidth) {
  return x / (beatWidth || DEFAULT_BEAT_WIDTH);
}

export function midiToY(midi, pitchRange, rowHeight) {
  return (pitchRange.max - midi) * (rowHeight || DEFAULT_ROW_HEIGHT);
}

export function yToMidi(y, pitchRange, rowHeight) {
  return pitchRange.max - Math.round(y / (rowHeight || DEFAULT_ROW_HEIGHT));
}

export function noteRect(ev, midis, beatWidth, rowHeight, pitchRange, durationBeats) {
  const x = beatToX(ev.startBeat || 0, beatWidth);
  const w = Math.max(8, beatToX(durationBeats, beatWidth));
  return midis.map(function(midi) {
    return {
      midi: midi,
      x: x,
      y: midiToY(midi, pitchRange, rowHeight),
      width: w,
      height: (rowHeight || DEFAULT_ROW_HEIGHT) - 2,
    };
  });
}

export function rectIntersectsMarquee(rect, marquee) {
  return rect.x < marquee.x + marquee.width
    && rect.x + rect.width > marquee.x
    && rect.y < marquee.y + marquee.height
    && rect.y + rect.height > marquee.y;
}
