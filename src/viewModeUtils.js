export const VIEW_MODES = [
  { id: 'music', label: 'Music Notation' },
  { id: 'chordsInline', label: 'Lyrics with Chords' },
  { id: 'chordsBlock', label: 'Lyrics and Chord Diagrams' },
];

export function normalizeViewMode(mode) {
  if (!mode || mode === 'music') return 'music';
  if (mode === 'chords') return 'chordsBlock';
  if (mode === 'chordsInline' || mode === 'chordsBlock') return mode;
  return 'music';
}

export function isChordLayoutView(mode) {
  const normalized = normalizeViewMode(mode);
  return normalized === 'chordsBlock' || normalized === 'chordsInline';
}
