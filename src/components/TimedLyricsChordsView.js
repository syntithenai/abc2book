import { getLyricLinesForDisplay } from '../wLinesUtils';
import { buildLinesFromTune, buildTimedAlignedLines, tuneHasExplicitChords } from '../timedLyricsChordsDisplay';
import { classifyLyricChordLines, alignChordBlocksToLyrics, splitChordChartIntoBlocks, mergeChordsIntoLyricLines, hasChordLines, chartBlockHasChords, formatChordChartForDisplay, sanitizeChordChartBlock } from '../chordSheetUtils';
import useAbcjsParser from '../useAbcjsParser';

function ChordChartBlock(props) {
  const chart = sanitizeChordChartBlock(props.chart);
  if (!chartBlockHasChords(chart)) return null;
  return (
    <pre className="chord-chart" style={{ fontWeight: 'bold', color: '#1a4f8b', fontFamily: 'monospace', margin: '0 0 0.45em 0', whiteSpace: 'pre-wrap', lineHeight: '1.6em' }}>{chart}</pre>
  );
}

function ChordProLines(props) {
  const tokenLines = props.tokenLines;
  if (!tokenLines || tokenLines.length === 0) return null;
  return tokenLines.map(function(tokens, lineIndex) {
    if (!tokens || tokens.length === 0) {
      return <div key={lineIndex} className="chordpro-line-spacer" style={{ height: '0.4em' }} />;
    }
    return (
      <div key={lineIndex} className="chordpro-line" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '0.35em', pageBreakInside: 'avoid' }}>
        {tokens.map(function(token, ti) {
          return (
            <span key={ti} className="chordpro-token" style={{ display: 'inline-flex', flexDirection: 'column' }}>
              <span className="chordpro-chord" style={{ fontWeight: 'bold', color: '#1a4f8b', minHeight: '1.25em', lineHeight: '1.25em', whiteSpace: 'pre' }}>{token.chord || '\u00A0'}</span>
              <span className="chordpro-lyric" style={{ whiteSpace: 'pre' }}>{token.text || '\u00A0'}</span>
            </span>
          );
        })}
      </div>
    );
  });
}

export default function TimedLyricsChordsView(props) {
  const tune = props.tune;
  const tunebook = props.tunebook;
  const abcjsParser = useAbcjsParser();
  if (!tune) return null;

  const zoom = tune.zoom > 0 ? tune.zoom : 1;
  const chordTranspose = props.chordTranspose != null
    ? Number(props.chordTranspose) || 0
    : (Number(tune.transpose) || 0);
  const displayLines = getLyricLinesForDisplay(tune);
  const classified = classifyLyricChordLines(displayLines);
  const isChordSheet = hasChordLines(displayLines);
  const lines = buildLinesFromTune(tune);

  // 1) ChordPro-style w: lines (chord rows above lyric rows). Check this before
  // timed alignment so scaffolded lyrics that include chord tokens still render
  // as a chord sheet rather than plain lyric text.
  if (isChordSheet) {
    return (
      <div className="timed-lyrics-chords-view chord-sheet" style={{ fontSize: zoom * 100 + '%', padding: '0.3em', marginTop: '1em', fontFamily: 'monospace', overflowX: 'auto' }}>
        {classified.map(function(item, index) {
          if (item.type === 'blank') {
            return <div key={index} className="chord-sheet-spacer" style={{ height: '0.9em' }} />;
          }
          if (item.type === 'header') {
            return <div key={index} className="lyrics-section-header" style={{ fontWeight: 'bold', fontSize: '1.1em', marginTop: '0.9em', marginBottom: '0.2em', color: '#7a3e00' }}>{item.text}</div>;
          }
          if (item.type === 'chord') {
            return <div key={index} className="chord-line" style={{ fontWeight: 'bold', color: '#1a4f8b', whiteSpace: 'pre' }}>{item.text}</div>;
          }
          return <div key={index} className="lyrics-line" style={{ whiteSpace: 'pre' }}>{item.text}</div>;
        })}
      </div>
    );
  }

  const timedLines = tuneHasExplicitChords(tune, tunebook, abcjsParser)
    ? buildTimedAlignedLines(tune)
    : [];
  const timedHasChords = timedLines.some(function(line) { return line.chord; });

  // 2) Timed alignment with a chord per line when the tune already has chords.
  if (timedLines.length > 0 && timedHasChords) {
    return (
      <div className="timed-lyrics-chords-view" style={{ fontSize: zoom * 100 + '%', padding: '0.3em', marginTop: '1em' }}>
        {timedLines.map(function(line, index) {
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

  // 3) Clean lyrics with chords only in the melody notation. Split the melody
  // into chord blocks at the double barlines and align them to the lyric blocks
  // by section so every word shows and the chords stay grouped per block (verse
  // / chorus / bridge) rather than running continuously down the page.
  let chordChart = '';
  try {
    const firstVoice = tune.voices && Object.keys(tune.voices).length > 0
      ? Object.values(tune.voices)[0]
      : { notes: [] };
    const melodyAbc = tunebook && tunebook.abcTools
      ? tunebook.abcTools.emptyABC(tune.name) + firstVoice.notes.join('\n')
      : '';
    chordChart = melodyAbc
      ? abcjsParser.renderChords(melodyAbc, false, chordTranspose, tune.key, tune.noteLength, tune.meter)
      : '';
  } catch (e) {
    chordChart = '';
  }

  const chordBlocks = splitChordChartIntoBlocks(chordChart);
  const melodyHasChords = chordBlocks.some(chartBlockHasChords);

  if (melodyHasChords && lines.length > 0) {
    const alignedBlocks = alignChordBlocksToLyrics(getLyricLinesForDisplay(tune), chordBlocks, {
      title: tune.name,
      composer: tune.composer,
    });
    return (
      <div className="timed-lyrics-chords-view chord-blocks" style={{ fontSize: zoom * 100 + '%', padding: '0.3em', marginTop: '1em' }}>
        {alignedBlocks.map(function(block, bi) {
          const inlineTokens = block.inlineChords && block.chart
            ? mergeChordsIntoLyricLines(block.lyricLines, block.chart)
            : null;
          const useInline = inlineTokens
            && inlineTokens.length > 0
            && inlineTokens.some(function(row) { return row.length > 0; });
          const showChartAbove = !useInline && chartBlockHasChords(block.chart);
          return (
            <div key={bi} className="chord-lyric-block" style={{ marginBottom: '1.3em', pageBreakInside: 'avoid' }}>
              {Array.isArray(block.prefaceLines) && block.prefaceLines.map(function(line, pi) {
                return <div key={'preface-' + pi} className="lyrics-preface" style={{ fontWeight: 'bold', marginBottom: '0.25em' }}>{line}</div>;
              })}
              {block.header && (
                <div className="lyrics-section-header" style={{ fontWeight: 'bold', fontSize: '1.1em', marginBottom: '0.25em', color: '#7a3e00' }}>{block.header}</div>
              )}
              {useInline ? (
                <>
                  <ChordProLines tokenLines={inlineTokens} />
                  {block.extraChart && chartBlockHasChords(block.extraChart) && (
                    <ChordChartBlock chart={block.extraChart} />
                  )}
                </>
              ) : (
                <>
                  {showChartAbove && <ChordChartBlock chart={block.chart} />}
                  {block.lyricLines.map(function(line, li) {
                    return <div key={li} className="lyrics-line">{line}</div>;
                  })}
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // 4) Plain lyrics (no chords available anywhere).
  if (lines.length > 0) {
    return (
      <div className="timed-lyrics-chords-view" style={{ fontSize: zoom * 100 + '%', padding: '0.3em', marginTop: '1em' }}>
        {lines.map(function(line, index) {
          return (
            <div key={index} className="lyrics-block" style={{ paddingTop: '0.8em', paddingBottom: '0.8em', pageBreakInside: 'avoid' }}>
              <div className="lyrics-line">{line.text}</div>
            </div>
          );
        })}
      </div>
    );
  }

  return null;
}
