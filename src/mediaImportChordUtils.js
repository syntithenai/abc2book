export function appendChordGrids(currentGrid, additionGrid) {
  const current = String(currentGrid || '').trim();
  const addition = String(additionGrid || '').trim();
  if (!addition) return current;
  if (!current) return addition;
  if (current.endsWith('\n')) return current + addition;
  if (current.endsWith('|')) return current + ' ' + addition;
  return current + '\n' + addition;
}

export function appendNotationLines(currentText, additionText) {
  const current = String(currentText || '').trim();
  const addition = String(additionText || '').trim();
  if (!addition) return current;
  if (!current) return addition;
  return current + '\n' + addition;
}
