import { alignChordsToLyricLines } from '../timedAbcDeriver';
import { timedLyricsToPlainText } from '../timedLyricsModel';
import { chordAtTime } from '../timedChordsModel';
import { getLyricLines } from '../wLinesUtils';

function buildLinesFromTune(tune) {
  if (tune && tune.timedLyrics) {
    const aligned = alignChordsToLyricLines(tune.timedLyrics, tune.timedChords);
    if (aligned.length > 0) return aligned;
  }

  const words = getLyricLines(tune);
  return words.filter(function(line) { return line && line.trim().length > 0; }).map(function(line, index) {
    return {
      text: line,
      chord: tune && tune.timedChords ? chordAtTime(tune.timedChords, index * 2) : '',
      start: index * 2,
      end: index * 2 + 2,
    };
  });
}

export default function TimedLyricsChordsView(props) {
  const tune = props.tune;
  if (!tune) return null;

  const lines = buildLinesFromTune(tune);
  const zoom = tune.zoom > 0 ? tune.zoom : 1;

  if (lines.length === 0) {
    const fallback = timedLyricsToPlainText(tune.timedLyrics);
    if (!fallback) return null;
    return (
      <div className="timed-lyrics-chords-view" style={{ fontSize: zoom * 100 + '%', padding: '0.3em' }}>
        {fallback.split('\n').map(function(line, index) {
          return <div key={index} className="lyrics-line">{line}</div>;
        })}
      </div>
    );
  }

  return (
    <div className="timed-lyrics-chords-view" style={{ fontSize: zoom * 100 + '%', padding: '0.3em', marginTop: '1em' }}>
      {lines.map(function(line, index) {
        return (
          <div key={index} className="lyrics-block" style={{ paddingTop: '0.8em', paddingBottom: '0.8em', pageBreakInside: 'avoid' }}>
            {line.chord && (
              <div className="chord-above" style={{ fontWeight: 'bold', marginBottom: '0.2em' }}>{line.chord}</div>
            )}
            <div className="lyrics-line">{line.text}</div>
          </div>
        );
      })}
    </div>
  );
}
