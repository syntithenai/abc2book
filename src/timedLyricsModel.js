export const TIMED_LYRICS_VERSION = 1;

function wordsFromSegment(segment, text, start, end) {
  if (segment && Array.isArray(segment.words) && segment.words.length > 0) {
    return segment.words.map(function(word) {
      return {
        text: String(word.text || '').trim(),
        start: Number(word.start) || start,
        end: Number(word.end) || end,
      };
    }).filter(function(word) { return word.text.length > 0; });
  }
  return splitWordsWithTiming(text, start, end);
}
function splitWordsWithTiming(text, start, end) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const duration = Math.max(0, (Number(end) || 0) - (Number(start) || 0));
  const slot = words.length > 0 ? duration / words.length : 0;
  const base = Number(start) || 0;
  return words.map(function(word, index) {
    return {
      text: word,
      start: base + index * slot,
      end: base + (index + 1) * slot,
    };
  });
}

export function normalizeTimedLyrics(input) {
  if (!input || typeof input !== 'object') return null;
  const lines = Array.isArray(input.lines) ? input.lines.map(function(line, index) {
    const start = Number(line.start) || 0;
    const end = Number(line.end) || start;
    const stanzaBreak = !!line.stanzaBreak;
    const text = stanzaBreak ? '' : String(line.text || '').trim();
    return {
      id: line.id || ('line-' + index),
      sectionId: line.sectionId || null,
      text: text,
      start: start,
      end: end,
      stanzaBreak: stanzaBreak,
      words: stanzaBreak
        ? []
        : (Array.isArray(line.words) && line.words.length > 0
          ? line.words.map(function(word) {
            return {
              text: String(word.text || '').trim(),
              start: Number(word.start) || start,
              end: Number(word.end) || end,
            };
          })
          : splitWordsWithTiming(text, start, end)),
    };
  }).filter(function(line) {
    return line.stanzaBreak || line.text.length > 0;
  }) : [];

  return {
    version: TIMED_LYRICS_VERSION,
    source: input.source && typeof input.source === 'object' ? input.source : {},
    lines: lines,
    sections: Array.isArray(input.sections) ? input.sections : [],
  };
}

export function buildTimedLyricsFromTranscription(raw, sourceInfo) {
  const segments = raw && Array.isArray(raw.segments) ? raw.segments : [];
  const formattedText = raw && typeof raw.text === 'string' ? raw.text : '';

  let lines = [];
  if (formattedText) {
    const textLines = formattedText.replace(/\r\n/g, '\n').split('\n');
    let segIndex = 0;
    lines = textLines.map(function(lineText, index) {
      const trimmed = String(lineText || '').trim();
      if (!trimmed) {
        const prevSegment = segIndex > 0 ? segments[segIndex - 1] : null;
        const pauseTime = prevSegment ? Number(prevSegment.end) || 0 : 0;
        return {
          id: 'line-' + index,
          sectionId: null,
          text: '',
          start: pauseTime,
          end: pauseTime,
          words: [],
          stanzaBreak: true,
        };
      }
      const segment = segments[segIndex] || segments[segments.length - 1] || {};
      if (segIndex < segments.length) {
        segIndex += 1;
      }
      const start = Number(segment.start) || 0;
      const end = Number(segment.end) || start;
      return {
        id: 'line-' + index,
        sectionId: null,
        text: trimmed,
        start: start,
        end: end,
        words: wordsFromSegment(segment, trimmed, start, end),
      };
    });
  } else {
    lines = segments.map(function(segment, index) {
      const text = String(segment.text || '').trim();
      const start = Number(segment.start) || 0;
      const end = Number(segment.end) || start;
      return {
        id: 'line-' + index,
        sectionId: null,
        text: text,
        start: start,
        end: end,
        words: wordsFromSegment(segment, text, start, end),
      };
    }).filter(function(line) { return line.text.length > 0; });
  }

  return normalizeTimedLyrics({
    version: TIMED_LYRICS_VERSION,
    source: sourceInfo || {},
    lines: lines,
    sections: [],
  });
}

export function timedLyricsToPlainText(timedLyrics) {
  if (!timedLyrics || !Array.isArray(timedLyrics.lines)) return '';
  return timedLyrics.lines.map(function(line) {
    if (line.stanzaBreak || line.text === '') return '';
    return String(line.text || '').trim();
  }).join('\n');
}

export function timedLyricsToWords(timedLyrics) {
  const text = timedLyricsToPlainText(timedLyrics);
  if (!text) return [];
  return text.split('\n');
}

export function buildSectionsFromLines(timedLyrics, gapSeconds) {
  const normalized = normalizeTimedLyrics(timedLyrics);
  if (!normalized || normalized.lines.length === 0) return [];
  const threshold = typeof gapSeconds === 'number' ? gapSeconds : 2.5;
  const sections = [];
  let current = null;

  normalized.lines.forEach(function(line, index) {
    if (line.stanzaBreak || line.text === '') {
      if (current) {
        current.endLine = Math.max(current.startLine, index - 1);
        current = null;
      }
      return;
    }
    const prev = index > 0 ? normalized.lines[index - 1] : null;
    const gap = prev && prev.text ? (line.start - prev.end) : 0;
    if (!current || gap >= threshold) {
      current = {
        id: 'section-' + sections.length,
        label: sections.length === 0 ? 'Verse' : 'Section ' + (sections.length + 1),
        type: 'verse',
        startLine: index,
        endLine: index,
      };
      sections.push(current);
    }
    current.endLine = index;
  });

  return sections;
}
