import { isSectionHeader } from './chordSheetUtils';

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

/** Clean "[Verse 1]" / "# Chorus" for display. Returns null when no lyric label. */
export function displaySectionHeader(header) {
  if (!header) return null;
  let t = String(header).trim();
  t = t.replace(/^#+\s*/, '');
  t = t.replace(/^[-–—−•*]\s*/, '');
  if (t.length >= 2 && t.charAt(0) === '[' && t.charAt(t.length - 1) === ']') {
    t = t.slice(1, -1).trim();
  }
  t = t.trim();
  if (!t) return null;
  return capitalizeSectionHeader(t);
}

export function SectionHeader(props) {
  if (!props.label) return null;
  return (
    <div className="lyrics-section-header">{props.label}</div>
  );
}

export default function LyricsDisplayLines(props) {
  const lines = Array.isArray(props.lines) ? props.lines : [];
  const className = props.className || '';
  const panelStyle = props.style;
  const lineStyle = props.lineStyle || { marginBottom: '0.35em' };

  return (
    <div className={className} style={panelStyle}>
      {lines.map(function(line, index) {
        if (!line || String(line).trim().length === 0) {
          return <div key={index} className="lyrics-line-spacer" style={{ height: '0.6em' }} />;
        }
        if (isSectionHeader(line)) {
          const label = displaySectionHeader(line);
          if (!label) return null;
          return <SectionHeader key={index} label={label} />;
        }
        return <div key={index} className="lyrics-line" style={lineStyle}>{line}</div>;
      })}
    </div>
  );
}
