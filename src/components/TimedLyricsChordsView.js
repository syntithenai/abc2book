import { getLyricLinesForDisplay } from '../wLinesUtils';
import { buildLinesFromTune, buildTimedAlignedLines, tuneHasExplicitChords } from '../timedLyricsChordsDisplay';
import { classifyLyricChordLines, alignChordBlocksToLyrics, splitChordChartIntoBlocks, mergeChordsIntoLyricLines, hasChordLines, chartBlockHasChords, formatChordChartForDisplay, isSectionHeader } from '../chordSheetUtils';
import useAbcjsParser from '../useAbcjsParser';
import LyricsDisplayLines, { displaySectionHeader, SectionHeader } from '../LyricsDisplayLines';
import { useFitTextScale } from '../useFitTextScale';

export { displaySectionHeader } from '../LyricsDisplayLines';

function ChordChartBlock(props) {
  const chart = formatChordChartForDisplay(props.chart);
  if (!chart) return null;
  const lines = chart.split('\n');
  return (
    <div className="chord-chart">
      {lines.map(function(line, i) {
        if (!line.trim()) {
          return <div key={i} className="chord-chart-line-spacer" aria-hidden="true" />;
        }
        return <div key={i} className="chord-chart-line">{line}</div>;
      })}
    </div>
  );
}

/** Render a multi-block chord chart (no synthetic section labels). */
function ChordChartBlocksFromText(props) {
  const blocks = splitChordChartIntoBlocks(props.chart || '')
    .map(function(block) { return formatChordChartForDisplay(block); })
    .filter(Boolean);
  if (blocks.length === 0) return null;
  return blocks.map(function(chart, i) {
    return (
      <div key={i} className="chord-lyric-block">
        <ChordChartBlock chart={chart} />
      </div>
    );
  });
}

function ChordsOnlyBlockView(props) {
  const viewStyle = {
    padding: '0.3em',
    marginTop: props.suppressTopMargin ? 0 : '1em',
  };
  if (!props.inheritZoom) {
    viewStyle.fontSize = props.zoom * 100 + '%';
  }
  return (
    <div
      className={'timed-lyrics-chords-view chord-blocks-only' + (props.className ? ' ' + props.className : '')}
      style={viewStyle}
    >
      {props.children}
    </div>
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
              <span className="chordpro-chord" style={{ fontWeight: 'bold', minHeight: '1.25em', lineHeight: '1.25em', whiteSpace: 'pre' }}>{token.chord || '\u00A0'}</span>
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
  const hideChords = !!props.hideChords;
  const suppressLeadingTitle = !!props.suppressLeadingTitle;
  const inheritZoom = !!props.inheritZoom;
  const fitHeight = !!props.fitHeight;
  const abcjsParser = useAbcjsParser();

  const chordsOnly = !!props.chordsOnly;
  const forceBlockLayout = !!props.forceBlockLayout;
  const baseZoom = props.zoom > 0 ? props.zoom : (tune && tune.zoom > 0 ? tune.zoom : 1);
  const zoom = props.compact ? baseZoom * 0.88 : baseZoom;

  const fit = useFitTextScale({
    fitHeight: fitHeight && !chordsOnly,
    measureLongestLine: false,
    minScale: 0.5,
    maxScale: 6,
    padX: 12,
    padY: 8,
    deps: [
      fitHeight,
      hideChords,
      forceBlockLayout,
      tune && tune.id,
      zoom,
      props.chordTranspose,
    ],
  });

  if (!tune) return null;

  function contentFontStyle(extraStyle) {
    const style = Object.assign({ padding: '0.3em', marginTop: '1em' }, extraStyle || {});
    if (fitHeight && !chordsOnly) {
      // Scale is applied on the fit wrapper; keep inner at 1em relative to that.
      style.fontSize = '1em';
      style.marginTop = '0.25em';
    } else if (!inheritZoom) {
      style.fontSize = zoom * 100 + '%';
    }
    return style;
  }

  function wrapFit(node) {
    if (!fitHeight || chordsOnly) return node;
    return (
      <div
        className="lyrics-fit-height-host"
        ref={fit.containerRef}
        style={{ flex: '1 1 auto', minHeight: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        <div
          ref={fit.contentRef}
          style={{ fontSize: fit.fontScale + 'em', flex: '0 0 auto', width: '100%' }}
        >
          {node}
        </div>
      </div>
    );
  }
  const chordTranspose = props.chordTranspose != null
    ? Number(props.chordTranspose) || 0
    : (Number(tune.transpose) || 0);
  const displayLines = getLyricLinesForDisplay(tune);
  const classified = classifyLyricChordLines(displayLines);
  const isChordSheet = hasChordLines(displayLines);
  const lines = buildLinesFromTune(tune);

  const timedLines = tuneHasExplicitChords(tune, tunebook, abcjsParser)
    ? buildTimedAlignedLines(tune)
    : [];
  const timedHasChords = timedLines.some(function(line) { return line.chord; });

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

  if (chordsOnly && !hideChords) {
    if (isChordSheet) {
      const hasHeaders = classified.some(function(item) { return item.type === 'header'; });
      const hasChords = classified.some(function(item) { return item.type === 'chord'; });
      if (hasChords) {
        return (
          <ChordsOnlyBlockView zoom={zoom} inheritZoom={inheritZoom} suppressTopMargin={suppressLeadingTitle}>
            {hasHeaders ? classified.map(function(item, index) {
              if (item.type === 'blank') {
                return <div key={index} className="chord-sheet-spacer" style={{ height: '0.6em' }} />;
              }
              if (item.type === 'header') {
                return (
                  <SectionHeader key={index} label={displaySectionHeader(item.text)} />
                );
              }
              if (item.type === 'chord') {
                return <ChordChartBlock key={index} chart={item.text} />;
              }
              return null;
            }) : (
              <ChordChartBlocksFromText
                chart={classified.filter(function(item) { return item.type === 'chord'; }).map(function(item) { return item.text; }).join('\n')}
              />
            )}
          </ChordsOnlyBlockView>
        );
      }
    }

    if (melodyHasChords && lines.length > 0) {
      const alignedBlocks = alignChordBlocksToLyrics(getLyricLinesForDisplay(tune), chordBlocks, null);
      const blocksWithCharts = alignedBlocks.filter(function(block) {
        if (block.chartRevisit) {
          return !!displaySectionHeader(block.header);
        }
        return chartBlockHasChords(block.chart) || chartBlockHasChords(block.extraChart);
      });
      if (blocksWithCharts.length > 0) {
        return (
          <ChordsOnlyBlockView zoom={zoom} inheritZoom={inheritZoom} suppressTopMargin={suppressLeadingTitle}>
            {blocksWithCharts.map(function(block, bi) {
              return (
                <div key={bi} className="chord-lyric-block">
                  <SectionHeader label={displaySectionHeader(block.header)} />
                  {!block.chartRevisit && chartBlockHasChords(block.chart) && <ChordChartBlock chart={block.chart} />}
                  {!block.chartRevisit && chartBlockHasChords(block.extraChart) && <ChordChartBlock chart={block.extraChart} />}
                </div>
              );
            })}
          </ChordsOnlyBlockView>
        );
      }
    }

    if (timedLines.length > 0 && timedHasChords) {
      const timedChordText = timedLines
        .filter(function(line) { return line.chord; })
        .map(function(line) { return line.chord; })
        .join('\n');
      if (timedChordText.trim()) {
        return (
          <ChordsOnlyBlockView zoom={zoom} inheritZoom={inheritZoom} suppressTopMargin={suppressLeadingTitle}>
            <ChordChartBlocksFromText chart={timedChordText} />
          </ChordsOnlyBlockView>
        );
      }
    }

    if (melodyHasChords && chordChart.trim()) {
      return (
        <ChordsOnlyBlockView zoom={zoom} inheritZoom={inheritZoom} suppressTopMargin={suppressLeadingTitle}>
          <ChordChartBlocksFromText chart={chordChart} />
        </ChordsOnlyBlockView>
      );
    }

    return (
      <ChordsOnlyBlockView zoom={zoom} inheritZoom={inheritZoom} suppressTopMargin={suppressLeadingTitle}>
        <div style={{ color: '#666' }}>No chord chart available for this tune.</div>
      </ChordsOnlyBlockView>
    );
  }

  // 1) ChordPro-style w: lines (chord rows above lyric rows). Check this before
  // timed alignment so scaffolded lyrics that include chord tokens still render
  // as a chord sheet rather than plain lyric text.
  if (isChordSheet) {
    return wrapFit(
      <div className="timed-lyrics-chords-view chord-sheet" style={contentFontStyle({ fontFamily: 'monospace', overflowX: 'auto' })}>
        {classified.map(function(item, index) {
          if (item.type === 'blank') {
            return <div key={index} className="chord-sheet-spacer" style={{ height: '0.9em' }} />;
          }
          if (item.type === 'header') {
            return <SectionHeader key={index} label={displaySectionHeader(item.text)} />;
          }
          if (item.type === 'chord' && !hideChords) {
            return <ChordChartBlock key={index} chart={item.text} />;
          }
          if (item.type === 'chord' && hideChords) {
            return null;
          }
          return <div key={index} className="lyrics-line" style={{ whiteSpace: 'pre' }}>{item.text}</div>;
        })}
      </div>
    );
  }

  // 2) Timed alignment with a chord per line when the tune already has chords.
  if (timedLines.length > 0 && timedHasChords) {
    return wrapFit(
      <div className="timed-lyrics-chords-view" style={contentFontStyle()}>
        {timedLines.map(function(line, index) {
          if (isSectionHeader(line.text)) {
            const label = displaySectionHeader(line.text);
            if (!label) return null;
            return <SectionHeader key={index} label={label} />;
          }
          return (
            <div key={index} className="lyrics-block" style={{ paddingTop: '0.8em', paddingBottom: '0.8em', pageBreakInside: 'avoid' }}>
              {line.chord && !hideChords && (
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
  if (melodyHasChords && lines.length > 0) {
    const alignedBlocks = alignChordBlocksToLyrics(getLyricLinesForDisplay(tune), chordBlocks, suppressLeadingTitle ? null : {
      title: tune.name,
      composer: tune.composer,
    });
    const sheetAlignment = tune && tune.meta && Array.isArray(tune.meta.chordSheetAlignment)
      ? tune.meta.chordSheetAlignment
      : null;
    return wrapFit(
      <div className="timed-lyrics-chords-view chord-blocks" style={contentFontStyle()}>
        {alignedBlocks.map(function(block, bi) {
          // Structure: suppress repeating the block chart on revisit.
          // Lyrics: still merge chords above each line when the block has words.
          const hasWords = block.lyricLines.some(function(line) {
            return String(line).trim().length > 0;
          });
          const inlineTokens = !forceBlockLayout && !hideChords && block.inlineChords && block.chart && hasWords
            ? mergeChordsIntoLyricLines(block.lyricLines, block.chart, sheetAlignment && sheetAlignment[bi]
              ? {
                anchorWordIndexForBar: function(info) {
                  const blockAlignment = sheetAlignment[bi];
                  const linePair = blockAlignment && Array.isArray(blockAlignment.linePairs)
                    ? blockAlignment.linePairs[info.lineIndex]
                    : null;
                  const anchors = linePair && Array.isArray(linePair.anchors) ? linePair.anchors : [];
                  if (anchors.length > 0) {
                    const anchorIndex = Math.min(info.barIndex, anchors.length - 1);
                    const anchor = anchors[anchorIndex];
                    if (anchor && Number.isFinite(anchor.wordIndex)) {
                      return anchor.wordIndex;
                    }
                  }
                  return Math.round((info.barIndex * info.wordCount) / info.barCount);
                },
              }
              : undefined)
            : null;
          const useInline = !forceBlockLayout
            && inlineTokens
            && inlineTokens.length > 0
            && inlineTokens.some(function(row) { return row.length > 0; });
          // Block chart above lyrics only on first occurrence when not using inline merge.
          const showChartAbove = !block.chartRevisit && !useInline && chartBlockHasChords(block.chart);
          const showExtraBefore = chartBlockHasChords(block.extraChart);
          return (
            <div key={bi} className="chord-lyric-block" style={{ marginBottom: '1.3em', pageBreakInside: 'avoid' }}>
              {Array.isArray(block.prefaceLines) && block.prefaceLines.map(function(line, pi) {
                return <div key={'preface-' + pi} className="lyrics-preface music-tune-heading">{line}</div>;
              })}
              <SectionHeader label={displaySectionHeader(block.header)} />
              {showExtraBefore && !hideChords ? <ChordChartBlock chart={block.extraChart} /> : null}
              {useInline && !hideChords ? (
                <ChordProLines tokenLines={inlineTokens} />
              ) : (
                <>
                  {showChartAbove && !hideChords && <ChordChartBlock chart={block.chart} />}
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
    return wrapFit(
      <div className="timed-lyrics-chords-view" style={contentFontStyle()}>
        <LyricsDisplayLines lines={displayLines} />
      </div>
    );
  }

  return null;
}
