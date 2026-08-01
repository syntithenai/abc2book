import { extractBarsFromMelodyText, flattenMelodyText } from './lyricBarAlignmentUtils';
import { normalizeMelodyBarlines } from './melodyBarlineNormalize';

const VOLTA_RE = /\[[0-9]+\]|\[[0-9]+(?=\s)/;
const EPSILON = 0.05;
const LINE_SECTION_RE = /^\|:\s*([\s\S]*?)\s*:\|\s*$/;
const INLINE_SECTION_RE = /\|:([\s\S]*?):\|/g;

function flattenWithoutStrainCollapse(noteLines) {
  return (Array.isArray(noteLines) ? noteLines : [])
    .map(function(line) { return String(line || '').trim(); })
    .filter(Boolean)
    .join(' ');
}

/**
 * Repeat-bounded |: ... :| sections in melody order.
 * @returns {{ inner: string, startIndex: number, endIndex: number, bars: string[] }[]}
 */
export function parseRepeatBoundedSections(noteLines) {
  const lines = (Array.isArray(noteLines) ? noteLines : [])
    .map(function(line) { return String(line || '').trim(); })
    .filter(Boolean);

  const perLineSections = [];
  lines.forEach(function(line) {
    const match = line.match(LINE_SECTION_RE);
    if (!match) return;
    const inner = normalizeMelodyBarlines(match[1].trim());
    const bars = extractBarsFromMelodyText(inner);
    perLineSections.push({
      inner: inner,
      startIndex: -1,
      endIndex: -1,
      bars: bars,
      pickupBar: bars[0] || '',
      bodyBars: bars.slice(1),
    });
  });
  if (perLineSections.length > 0) return perLineSections;

  const flat = flattenWithoutStrainCollapse(noteLines);
  if (!flat) return [];

  const sections = [];
  INLINE_SECTION_RE.lastIndex = 0;
  let match;
  while ((match = INLINE_SECTION_RE.exec(flat)) !== null) {
    const inner = normalizeMelodyBarlines(String(match[1] || '').trim());
    const bars = extractBarsFromMelodyText(inner);
    sections.push({
      inner: inner,
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      bars: bars,
      pickupBar: bars[0] || '',
      bodyBars: bars.slice(1),
    });
  }
  return sections;
}

function normalizePickupText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function globalBarIndexForSection(sections, sectionIndex) {
  let bar = 1;
  for (let i = 0; i < sectionIndex; i += 1) {
    bar += sections[i].bars.length;
  }
  return bar;
}

function underfullBarSet(durationIssues) {
  const set = {};
  (durationIssues || []).forEach(function(row) {
    if (row.type === 'underfull') set[row.barIndex] = true;
  });
  return set;
}

function sectionLabel(index) {
  if (index === 0) return 'A';
  if (index === 1) return 'B';
  if (index === 2) return 'C';
  return String(index + 1);
}

function barMelodyLength(barText) {
  return normalizePickupText(barText).replace(/"[^"]*"/g, '').replace(/\s+/g, '').length;
}

/**
 * Boundaries where the next section's pickup should be a volta ending.
 * @returns {{ sectionIndex: number, nextPickup: string, barIndex: number, message: string }[]}
 */
export function analyzeSectionPickupVoltaBoundaries(noteLines, durationIssues, parsedTune) {
  const flat = flattenMelodyText(noteLines);
  if (!flat || VOLTA_RE.test(flat)) return [];

  const sections = parseRepeatBoundedSections(noteLines);
  if (sections.length < 2) return [];

  const underfull = underfullBarSet(durationIssues);
  const hasTunePickup = !!(parsedTune && typeof parsedTune.getPickupLength === 'function'
    && parsedTune.getPickupLength() > EPSILON);
  const boundaries = [];

  function isPickupBar(sectionIndex) {
    const section = sections[sectionIndex];
    if (!section || section.bars.length <= 1) return false;
    const barIndex = globalBarIndexForSection(sections, sectionIndex);
    if (underfull[barIndex]) return true;
    if (sectionIndex === 0 && hasTunePickup) return true;
    if (/\|\|/.test(String(section.pickupBar || ''))) return true;
    if (section.bars.length >= 2) {
      const firstLen = barMelodyLength(section.bars[0]);
      const secondLen = barMelodyLength(section.bars[1]);
      if (firstLen > 0 && secondLen > firstLen * 1.5) return true;
    }
    return false;
  }

  for (let i = 0; i < sections.length - 1; i += 1) {
    const current = sections[i];
    const next = sections[i + 1];
    const pickupCurrent = normalizePickupText(current.pickupBar);
    const pickupNext = normalizePickupText(next.pickupBar);
    const nextPickupBar = globalBarIndexForSection(sections, i + 1);

    if (!pickupNext || pickupNext === pickupCurrent) continue;
    if (VOLTA_RE.test(current.inner || '')) continue;
    if (!isPickupBar(i)) continue;
    if (!isPickupBar(i + 1)) continue;

    const nextLabel = sectionLabel(i + 1);
    boundaries.push({
      sectionIndex: i,
      nextPickup: pickupNext,
      barIndex: nextPickupBar,
      message: 'Section ' + nextLabel + ' starts with pickup `' + pickupNext
        + '` that may be section ' + sectionLabel(i) + '\'s second ending'
        + ' — use [1]/[2] endings on each repeat block instead of anacrusis before the next section.',
    });
  }

  return boundaries;
}

export function canConvertSectionPickupsToVoltas(noteLines, durationIssues, parsedTune) {
  const flat = flattenMelodyText(noteLines);
  if (!flat || VOLTA_RE.test(flat)) return false;

  const sections = parseRepeatBoundedSections(noteLines);
  if (sections.length !== 2) return false;

  const boundaries = analyzeSectionPickupVoltaBoundaries(noteLines, durationIssues, parsedTune);
  return boundaries.length === 1;
}

function buildSectionWithVoltas(pickup, bodyBars, ending1, ending2) {
  const body = bodyBars.join(' | ');
  const prefix = '|: ' + pickup + ' | ' + body;
  return prefix + ' [1 ' + ending1 + ' :| [2 ' + ending2 + ' :|';
}

/**
 * Rewrite a two-section tune to use [1]/[2] endings instead of section pickups.
 */
export function convertSectionPickupsToVoltasFlat(noteLines) {
  const sections = parseRepeatBoundedSections(noteLines);
  if (sections.length !== 2) return null;

  const pickupA = sections[0].pickupBar;
  const pickupB = sections[1].pickupBar;
  const bodyA = sections[0].bodyBars;
  const bodyB = sections[1].bodyBars;
  if (!pickupA || !pickupB || bodyA.length === 0 || bodyB.length === 0) return null;
  if (normalizePickupText(pickupA) === normalizePickupText(pickupB)) return null;

  const newA = buildSectionWithVoltas(pickupA, bodyA, pickupA, pickupB);
  const newB = buildSectionWithVoltas(pickupB, bodyB, pickupB, pickupA);

  const lines = (Array.isArray(noteLines) ? noteLines : [])
    .map(function(line) { return String(line || '').trim(); })
    .filter(Boolean);
  if (lines.length >= 2 && lines.every(function(line) { return LINE_SECTION_RE.test(line); })) {
    return [newA, newB].join('\n');
  }

  const flat = flattenWithoutStrainCollapse(noteLines);
  if (sections[0].startIndex < 0 || sections[1].startIndex < 0) return null;
  return flat.slice(0, sections[0].startIndex) + newA + newB + flat.slice(sections[1].endIndex);
}
