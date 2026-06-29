export function splitLyricsLines(text) {
  if (text === null || text === undefined) return [];
  return String(text).replace(/\r\n/g, '\n').split('\n');
}

export function joinLyricsLines(lines) {
  return (Array.isArray(lines) ? lines : []).join('\n');
}

export function lyricsTextsEqual(existingText, transcribedText) {
  return joinLyricsLines(splitLyricsLines(existingText)).trim()
    === joinLyricsLines(splitLyricsLines(transcribedText)).trim();
}

export function buildLyricsLineDiff(existingText, transcribedText) {
  const existing = splitLyricsLines(existingText);
  const transcribed = splitLyricsLines(transcribedText);
  const rowCount = existing.length;
  const colCount = transcribed.length;
  const table = Array(rowCount + 1).fill(null).map(function() {
    return Array(colCount + 1).fill(0);
  });

  for (let row = 1; row <= rowCount; row += 1) {
    for (let col = 1; col <= colCount; col += 1) {
      if (existing[row - 1] === transcribed[col - 1]) {
        table[row][col] = table[row - 1][col - 1] + 1;
      } else {
        table[row][col] = Math.max(table[row - 1][col], table[row][col - 1]);
      }
    }
  }

  const ops = [];
  let row = rowCount;
  let col = colCount;
  while (row > 0 || col > 0) {
    if (row > 0 && col > 0 && existing[row - 1] === transcribed[col - 1]) {
      ops.unshift({
        type: 'same',
        existing: existing[row - 1],
        transcribed: transcribed[col - 1],
      });
      row -= 1;
      col -= 1;
    } else if (col > 0 && (row === 0 || table[row][col - 1] >= table[row - 1][col])) {
      ops.unshift({
        type: 'added',
        existing: '',
        transcribed: transcribed[col - 1],
      });
      col -= 1;
    } else {
      ops.unshift({
        type: 'removed',
        existing: existing[row - 1],
        transcribed: '',
      });
      row -= 1;
    }
  }

  const merged = [];
  for (let index = 0; index < ops.length; index += 1) {
    const op = ops[index];
    const next = ops[index + 1];
    if (op.type === 'removed' && next && next.type === 'added') {
      merged.push({
        type: 'changed',
        existing: op.existing,
        transcribed: next.transcribed,
      });
      index += 1;
    } else {
      merged.push(op);
    }
  }

  return merged.map(function(entry, index) {
    let defaultChoice = 'existing';
    if (entry.type === 'added' || entry.type === 'changed') {
      defaultChoice = 'transcribed';
    } else if (entry.type === 'same') {
      defaultChoice = 'existing';
    }
    return Object.assign({ id: index, defaultChoice: defaultChoice }, entry);
  });
}

export function buildDefaultLyricsMergeChoices(diffRows) {
  const choices = {};
  diffRows.forEach(function(row) {
    choices[row.id] = row.defaultChoice;
  });
  return choices;
}

export function mergeLyricsFromChoices(diffRows, choices) {
  const lines = [];
  diffRows.forEach(function(row) {
    const choice = choices[row.id] || row.defaultChoice;
    if (row.type === 'same') {
      lines.push(row.existing);
      return;
    }
    if (choice === 'existing') {
      lines.push(row.existing);
      return;
    }
    if (choice === 'transcribed') {
      lines.push(row.transcribed);
      return;
    }
    if (choice === 'both') {
      if (row.existing) lines.push(row.existing);
      if (row.transcribed && row.transcribed !== row.existing) {
        lines.push(row.transcribed);
      }
      return;
    }
    if (choice === 'skip') {
      return;
    }
    if (row.existing) lines.push(row.existing);
  });
  return lines;
}

export function countLyricsDiffRows(diffRows) {
  return diffRows.filter(function(row) {
    return row.type !== 'same';
  }).length;
}
