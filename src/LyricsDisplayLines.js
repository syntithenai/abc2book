import { isSectionHeader, stripLyricBlockPinTokens } from './chordSheetUtils';
import { stripLyricBeatMarkersFromLine } from './lyricBeatMarkers';

/** Title-case section labels: "verse 1" → "Verse 1", "pre-chorus" → "Pre-Chorus". */
export function capitalizeSectionHeader(text) {
  if (!text) return text;
  return String(text).split(/\s+/).map(function(word) {
    return word.split('-').map(function(part) {
      if (!part) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    }).join('-');
  }).join(' ');
}

/** Clean "[Verse 1]" / "(Chorus)" / "# Chorus" for display. Returns null when no lyric label. */
export function displaySectionHeader(header) {
  if (!header) return null;
  let t = stripLyricBlockPinTokens(String(header).trim());
  t = t.replace(/^#+\s*/, '');
  t = t.replace(/^[-–—−•*]\s*/, '');
  if (t.length >= 2 && t.charAt(0) === '[' && t.charAt(t.length - 1) === ']') {
    t = t.slice(1, -1).trim();
  }
  if (t.length >= 2 && t.charAt(0) === '(' && t.charAt(t.length - 1) === ')') {
    t = t.slice(1, -1).trim();
  }
  t = stripLyricBlockPinTokens(t);
  if (!t) return null;
  return capitalizeSectionHeader(t);
}

export function SectionHeader(props) {
  if (!props.label) return null;
  return (
    <div className="lyrics-section-header">{props.label}</div>
  );
}

/** Render lyric text, optionally keeping `/` beat markers highlighted. */
export function lyricBodyWithOptionalBeatMarkers(line, keepBeatMarkers) {
  const raw = line == null ? '' : String(line);
  const text = keepBeatMarkers ? raw : stripLyricBeatMarkersFromLine(raw);
  if (!text) return '\u00A0';
  if (!keepBeatMarkers || text.indexOf('/') < 0) return text;
  return text.split(/(\/+)/).map(function(part, i) {
    if (!part) return null;
    if (/^\/+$/.test(part)) {
      return <span key={i} className="lyric-beat-marker">{part}</span>;
    }
    return part;
  });
}

export default function LyricsDisplayLines(props) {
  const lines = Array.isArray(props.lines) ? props.lines : [];
  const className = props.className || '';
  const panelStyle = props.style;
  const lineStyle = props.lineStyle || { marginBottom: '0.35em' };
  const keepBeatMarkers = !!props.keepBeatMarkers;

  return (
    <div className={className} style={panelStyle}>
      {lines.map(function(line, index) {
        if (!line || String(line).trim().length === 0) {
          return <div key={index} className="lyrics-line-spacer" aria-hidden="true" />;
        }
        if (isSectionHeader(line)) {
          const label = displaySectionHeader(line);
          if (!label) return null;
          return <SectionHeader key={index} label={label} />;
        }
        return (
          <div key={index} className="lyrics-line" style={lineStyle}>
            {lyricBodyWithOptionalBeatMarkers(line, keepBeatMarkers)}
          </div>
        );
      })}
    </div>
  );
}
