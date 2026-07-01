export const VIEW_MODES = [
  { id: 'music', label: 'Music Notation' },
  { id: 'musicAndLyrics', label: 'Music and Lyrics' },
  { id: 'chordsInline', label: 'Lyrics with Chords' },
  { id: 'chordsBlock', label: 'Lyrics and Chord Diagrams' },
  { id: 'info', label: 'Info' },
];

export function normalizeViewMode(mode) {
  if (!mode || mode === 'music') return 'music';
  if (mode === 'chords') return 'chordsBlock';
  if (mode === 'chordsInline' || mode === 'chordsBlock' || mode === 'musicAndLyrics' || mode === 'info') return mode;
  return 'music';
}

export function showsMusicNotation(mode) {
  const normalized = normalizeViewMode(mode);
  return normalized === 'music' || normalized === 'musicAndLyrics';
}

export function isChordLayoutView(mode) {
  const normalized = normalizeViewMode(mode);
  return normalized === 'chordsBlock' || normalized === 'chordsInline';
}
