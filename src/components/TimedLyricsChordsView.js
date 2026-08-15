import { getLyricLinesForDisplay } from '../wLinesUtils';
import { buildLinesFromTune, tuneHasLyricEmbeddedChords } from '../timedLyricsChordsDisplay';
import {
  classifyLyricChordLines,
  alignChordBlocksToLyrics,
  mergeAlignedLyricBlockChords,
  hasChordLines,
  chartBlockHasChords,
  formatChordChartForDisplay,
  linesHaveChordProInlineChords,
  parseChordProInlineLyricLine,
  isSectionHeader,
  stripChordsFromLyricLines,
  ensureLeadingMeterMarker,
  parseChordChartDisplayLine,
} from '../chordSheetUtils';
import { chordChartBlocksForTuneDisplay, chordNoteLinesFromTune } from '../chordBlockMerge';
import { resolveChordRenderPlan } from '../chordLyricRenderPlan';
import { applyChordDisplayTranspose } from '../chordKeyMergeOptions';
import {
  resolveLyricBeatAnchorWordIndex,
  stripLyricBeatMarkersFromTokenLines,
} from '../lyricBeatMarkers';
import useAbcjsParser from '../useAbcjsParser';
import LyricsDisplayLines, {
  displaySectionHeader,
  SectionHeader,
  lyricBodyWithOptionalBeatMarkers,
} from '../LyricsDisplayLines';
import { useFitTextScale } from '../useFitTextScale';

function transposeChordProTokenLines(tokenLines, semitones, sourceKey) {
  const amount = Number(semitones) || 0;
  if (!amount) return tokenLines;
  return (tokenLines || []).map(function(tokens) {
    if (!Array.isArray(tokens)) return tokens;
    return tokens.map(function(token) {
      if (!token || !token.chord) return token;
      return Object.assign({}, token, {
        chord: applyChordDisplayTranspose(token.chord, amount, sourceKey),
      });
    });
  });
}

export { displaySectionHeader } from '../LyricsDisplayLines';

function renderChordMeterMark(part, key) {
  if (!part || part.type !== 'meter') return null;
  if (!part.den) {
    return (
      <span key={key} className="chord-meter-mark chord-meter-mark--plain" title={part.label} aria-label={part.label}>
        {part.label}
      </span>
    );
  }
  return (
    <span key={key} className="chord-meter-mark" title={part.label} aria-label={part.label}>
      <span className="chord-meter-num">{part.num}</span>
      <span className="chord-meter-den">{part.den}</span>
    </span>
  );
}

function ChordChartBlock(props) {
  const chart = formatChordChartForDisplay(
    props.applyLeadingMeter
      ? ensureLeadingMeterMarker(props.chart, props.meter)
      : props.chart
  );
  if (!chart) return null;
  const lines = chart.split('\n');
  return (
    <div className="chord-chart">
      {lines.map(function(line, i) {
        if (!line.trim()) {
          return <div key={i} className="chord-chart-line-spacer" aria-hidden="true" />;
        }
        const parts = parseChordChartDisplayLine(line).map(function(part, partKey) {
          if (part.type === 'meter') return renderChordMeterMark(part, i + '-m-' + partKey);
          if (part.type === 'repeat') {
            return (
              <span key={i + '-rm-' + partKey} className="chord-repeat-mark">
                {part.text}
              </span>
            );
          }
          return part.text || '';
        });
        return <div key={i} className="chord-chart-line">{parts}</div>;
      })}
    </div>
  );
}

/** Render a multi-block chord chart (no synthetic section labels). */
function ChordChartBlocksFromText(props) {
  const tuneMeter = props.tune && props.tune.meter ? props.tune.meter : null;
  let leadingMeterPending = !!tuneMeter;
  const blocks = chordChartBlocksForTuneDisplay(
    props.tune,
    props.chart || '',
    props.melodyNoteLines || [],
    { displayTranspose: Number(props.displayTranspose) || 0 }
  )
    .map(function(block) {
      const applyLeading = leadingMeterPending;
      if (applyLeading) leadingMeterPending = false;
      return {
        chart: block,
        applyLeadingMeter: applyLeading,
      };
    })
    .filter(function(item) { return chartBlockHasChords(item.chart); });
  if (blocks.length === 0) return null;
  return blocks.map(function(item, i) {
    return (
      <div key={i} className="chord-lyric-block">
        <ChordChartBlock
          chart={item.chart}
          meter={tuneMeter}
          applyLeadingMeter={item.applyLeadingMeter}
        />
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
  const rawTokenLines = props.tokenLines;
  const keepBeatMarkers = !!props.keepBeatMarkers;
  const tokenLines = keepBeatMarkers
    ? rawTokenLines
    : stripLyricBeatMarkersFromTokenLines(rawTokenLines);
  if (!tokenLines || tokenLines.length === 0) return null;
  return tokenLines.map(function(tokens, lineIndex) {
    if (!tokens || tokens.length === 0) {
      return <div key={lineIndex} className="chordpro-line-spacer" aria-hidden="true" />;
    }
    return (
      <div key={lineIndex} className="chordpro-line" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '0.35em', pageBreakInside: 'avoid' }}>
        {tokens.map(function(token, ti) {
          return (
            <span key={ti} className="chordpro-token" style={{ display: 'inline-flex', flexDirection: 'column' }}>
              <span className="chordpro-chord" style={{ fontWeight: 'bold', minHeight: '1.25em', lineHeight: '1.25em', whiteSpace: 'pre' }}>{token.chord || '\u00A0'}</span>
              <span className="chordpro-lyric" style={{ whiteSpace: 'pre' }}>
                {lyricBodyWithOptionalBeatMarkers(token.text, keepBeatMarkers)}
              </span>
            </span>
          );
        })}
      </div>
    );
  });
}

function renderPerLineAbcBlocks(props) {
  const tune = props.tune;
  const suppressLeadingTitle = props.suppressLeadingTitle;
  const keepBeatMarkers = !!props.keepBeatMarkers;
  const forceBlockLayout = props.forceBlockLayout;
  const melodyNoteLines = props.melodyNoteLines;
  const chordBlocks = props.chordBlocks;
  const lines = props.lines;

  const alignedBlocks = alignChordBlocksToLyrics(getLyricLinesForDisplay(tune), chordBlocks, {
    title: suppressLeadingTitle ? undefined : tune.name,
    composer: suppressLeadingTitle ? undefined : tune.composer,
    melodyNoteLines: melodyNoteLines,
  });
  const sheetAlignment = tune && tune.meta && Array.isArray(tune.meta.chordSheetAlignment)
    ? tune.meta.chordSheetAlignment
    : null;
  const tuneMeter = tune && tune.meter ? tune.meter : null;
  let leadingMeterPending = !!tuneMeter;

  return alignedBlocks.map(function(block, bi) {
    const hasWords = block.lyricLines.some(function(line) {
      return String(line).trim().length > 0;
    });
    // Structure/block charts skip revisits; inline lyrics still merge chords so
    // repeated verses/choruses keep under-lyric chords when sourcing from ABC.
    const inlineTokens = !forceBlockLayout && block.inlineChords && block.chart && hasWords
      ? mergeAlignedLyricBlockChords(block, melodyNoteLines, (function() {
        const mergeOpts = {};
        if (sheetAlignment && sheetAlignment[bi]) {
          mergeOpts.anchorWordIndexForBar = function(info) {
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
            const beatIdx = resolveLyricBeatAnchorWordIndex(info);
            if (beatIdx != null) return beatIdx;
            return Math.round((info.barIndex * info.wordCount) / info.barCount);
          };
        }
        return mergeOpts;
      })())
      : null;
    const useInline = !forceBlockLayout
      && inlineTokens
      && inlineTokens.length > 0
      && inlineTokens.some(function(row) { return row.length > 0; });
    const showChartAbove = !block.chartRevisit && !useInline && chartBlockHasChords(block.chart);
    const showExtraChartAbove = !block.chartRevisit && !useInline && chartBlockHasChords(block.extraChart);
    const applyLeadingMeter = leadingMeterPending && showChartAbove;
    if (applyLeadingMeter) leadingMeterPending = false;
    return (
      <div key={bi} className="chord-lyric-block">
        {Array.isArray(block.prefaceLines) && block.prefaceLines.map(function(line, pi) {
          return <div key={'preface-' + pi} className="lyrics-preface music-tune-heading">{line}</div>;
        })}
        <SectionHeader label={displaySectionHeader(block.header)} />
        {useInline ? (
          <ChordProLines tokenLines={inlineTokens} keepBeatMarkers={keepBeatMarkers} />
        ) : (
          <>
            {showChartAbove && (
              <ChordChartBlock
                chart={block.chart}
                meter={tuneMeter}
                applyLeadingMeter={applyLeadingMeter}
              />
            )}
            {showExtraChartAbove && <ChordChartBlock chart={block.extraChart} />}
            {block.lyricLines.map(function(line, li) {
              return (
                <div key={li} className="lyrics-line">
                  {lyricBodyWithOptionalBeatMarkers(line, keepBeatMarkers)}
                </div>
              );
            })}
          </>
        )}
      </div>
    );
  });
}

export default function TimedLyricsChordsView(props) {
  const tune = props.tune;
  const tunebook = props.tunebook;
  const hideChords = !!props.hideChords;
  const suppressLeadingTitle = !!props.suppressLeadingTitle;
  const keepBeatMarkers = !!props.keepBeatMarkers;
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
      style.fontSize = '1em';
      style.marginTop = '0.25em';
    } else if (!inheritZoom) {
      style.fontSize = zoom * 100 + '%';
    }
    return style;
  }

  function wrapFit(node) {
    if (!fitHeight || chordsOnly) return node;
    const hostClass = 'lyrics-fit-height-host'
      + (fit.overflows ? ' lyrics-fit-height-host--scrollable' : '');
    return (
      <div
        className={hostClass}
        ref={fit.containerRef}
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          height: '100%',
          overflow: fit.overflows ? 'auto' : 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
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
  const lines = buildLinesFromTune(tune);
  const renderPlan = resolveChordRenderPlan(tune, { hideChords: hideChords, chordsOnly: chordsOnly });

  if (renderPlan.mode === 'strip') {
    if (lines.length === 0) return null;
    return wrapFit(
      <div className="timed-lyrics-chords-view" style={contentFontStyle()}>
        <LyricsDisplayLines
          lines={stripChordsFromLyricLines(displayLines)}
          keepBeatMarkers={keepBeatMarkers}
        />
      </div>
    );
  }

  const melodyNoteLines = chordNoteLinesFromTune(tune);

  let chordChart = '';
  try {
    const melodyAbc = tunebook && tunebook.abcTools
      ? tunebook.abcTools.emptyABC(tune.name) + melodyNoteLines.join('\n')
      : '';
    chordChart = melodyAbc
      ? abcjsParser.renderChords(melodyAbc, false, chordTranspose, tune.key, tune.noteLength, tune.meter)
      : '';
  } catch (e) {
    chordChart = '';
  }

  const chordBlocks = chordChartBlocksForTuneDisplay(tune, chordChart, melodyNoteLines, {
    displayTranspose: chordTranspose,
  });
  const melodyHasChords = chordBlocks.some(chartBlockHasChords);
  const tuneKey = tune && tune.key;

  if (chordsOnly) {
    if (renderPlan.mode === 'passthrough_cow') {
      const hasHeaders = classified.some(function(item) { return item.type === 'header'; });
      const hasChords = classified.some(function(item) { return item.type === 'chord'; });
      if (hasChords) {
        return (
          <ChordsOnlyBlockView zoom={zoom} inheritZoom={inheritZoom} suppressTopMargin={suppressLeadingTitle}>
            {hasHeaders ? classified.map(function(item, index) {
              if (item.type === 'blank') {
                return <div key={index} className="chord-sheet-spacer" aria-hidden="true" />;
              }
              if (item.type === 'header') {
                return (
                  <SectionHeader key={index} label={displaySectionHeader(item.text)} />
                );
              }
              if (item.type === 'chord') {
                return (
                  <ChordChartBlock
                    key={index}
                    chart={applyChordDisplayTranspose(item.text, chordTranspose, tuneKey)}
                  />
                );
              }
              return null;
            }) : (
              <ChordChartBlocksFromText
                tune={tune}
                chart={applyChordDisplayTranspose(
                  classified.filter(function(item) { return item.type === 'chord'; }).map(function(item) { return item.text; }).join('\n'),
                  chordTranspose,
                  tuneKey
                )}
                melodyNoteLines={melodyNoteLines}
              />
            )}
          </ChordsOnlyBlockView>
        );
      }
    }

    if (renderPlan.mode === 'passthrough_chordpro') {
      const chordOnlyTokens = displayLines.map(function(line) {
        const trimmed = String(line || '').trim();
        if (!trimmed || isSectionHeader(trimmed)) return null;
        return parseChordProInlineLyricLine(line)
          .map(function(token) { return token.chord; })
          .filter(Boolean)
          .join(' ');
      }).filter(function(row) { return row && String(row).trim(); });
      if (chordOnlyTokens.length > 0) {
        return (
          <ChordsOnlyBlockView zoom={zoom} inheritZoom={inheritZoom} suppressTopMargin={suppressLeadingTitle}>
            <ChordChartBlocksFromText
              tune={tune}
              chart={applyChordDisplayTranspose(chordOnlyTokens.join('\n'), chordTranspose, tuneKey)}
              melodyNoteLines={melodyNoteLines}
            />
          </ChordsOnlyBlockView>
        );
      }
    }

    if (melodyHasChords && lines.length > 0 && !tuneHasLyricEmbeddedChords(tune)) {
      const alignedBlocks = alignChordBlocksToLyrics(getLyricLinesForDisplay(tune), chordBlocks, {
        melodyNoteLines: melodyNoteLines,
      });
      const blocksWithCharts = alignedBlocks.filter(function(block) {
        if (block.chartRevisit) {
          return !!displaySectionHeader(block.header);
        }
        return chartBlockHasChords(block.chart);
      });
      if (blocksWithCharts.length > 0) {
        const tuneMeter = tune && tune.meter ? tune.meter : null;
        let leadingMeterPending = !!tuneMeter;
        return (
          <ChordsOnlyBlockView zoom={zoom} inheritZoom={inheritZoom} suppressTopMargin={suppressLeadingTitle}>
            {blocksWithCharts.map(function(block, bi) {
              const showChart = !block.chartRevisit && chartBlockHasChords(block.chart);
              const applyLeadingMeter = leadingMeterPending && showChart;
              if (applyLeadingMeter) leadingMeterPending = false;
              return (
                <div key={bi} className="chord-lyric-block">
                  <SectionHeader label={displaySectionHeader(block.header)} />
                  {showChart && (
                    <ChordChartBlock
                      chart={block.chart}
                      meter={tuneMeter}
                      applyLeadingMeter={applyLeadingMeter}
                    />
                  )}
                </div>
              );
            })}
          </ChordsOnlyBlockView>
        );
      }
    }

    if (melodyHasChords && chordChart.trim()) {
      return (
        <ChordsOnlyBlockView zoom={zoom} inheritZoom={inheritZoom} suppressTopMargin={suppressLeadingTitle}>
          <ChordChartBlocksFromText
            tune={tune}
            chart={chordChart}
            melodyNoteLines={melodyNoteLines}
            displayTranspose={chordTranspose}
          />
        </ChordsOnlyBlockView>
      );
    }

    return (
      <ChordsOnlyBlockView zoom={zoom} inheritZoom={inheritZoom} suppressTopMargin={suppressLeadingTitle}>
        <div style={{ color: '#666' }}>No chord chart available for this tune.</div>
      </ChordsOnlyBlockView>
    );
  }

  if (renderPlan.mode === 'passthrough_cow') {
    return wrapFit(
      <div className="timed-lyrics-chords-view chord-sheet" style={contentFontStyle({ fontFamily: 'monospace', overflowX: 'auto' })}>
        {classified.map(function(item, index) {
          if (item.type === 'blank') {
            return <div key={index} className="chord-sheet-spacer" aria-hidden="true" />;
          }
          if (item.type === 'header') {
            return <SectionHeader key={index} label={displaySectionHeader(item.text)} />;
          }
          if (item.type === 'chord') {
            return (
              <ChordChartBlock
                key={index}
                chart={applyChordDisplayTranspose(item.text, chordTranspose, tuneKey)}
              />
            );
          }
          return (
            <div key={index} className="lyrics-line" style={{ whiteSpace: 'pre' }}>
              {lyricBodyWithOptionalBeatMarkers(item.text, keepBeatMarkers)}
            </div>
          );
        })}
      </div>
    );
  }

  if (renderPlan.mode === 'passthrough_chordpro') {
    const parsedTokenLines = displayLines.map(function(line) {
      const trimmed = String(line || '').trim();
      if (!trimmed) return [];
      if (isSectionHeader(trimmed)) return null;
      return parseChordProInlineLyricLine(line);
    });
    const tokenLines = transposeChordProTokenLines(
      keepBeatMarkers
        ? parsedTokenLines
        : stripLyricBeatMarkersFromTokenLines(parsedTokenLines),
      chordTranspose,
      tuneKey
    );
    return wrapFit(
      <div className="timed-lyrics-chords-view chordpro-inline" style={contentFontStyle()}>
        {displayLines.map(function(line, index) {
          const trimmed = String(line || '').trim();
          if (!trimmed) {
            return <div key={index} className="chordpro-line-spacer" aria-hidden="true" />;
          }
          if (isSectionHeader(trimmed)) {
            return <SectionHeader key={index} label={displaySectionHeader(trimmed)} />;
          }
          return (
            <ChordProLines
              key={index}
              tokenLines={[tokenLines[index]]}
              keepBeatMarkers={keepBeatMarkers}
            />
          );
        })}
      </div>
    );
  }

  if (renderPlan.mode === 'per_line_abc' && melodyHasChords && lines.length > 0) {
    return wrapFit(
      <div className="timed-lyrics-chords-view chord-blocks" style={contentFontStyle()}>
        {renderPerLineAbcBlocks({
          tune: tune,
          suppressLeadingTitle: suppressLeadingTitle,
          forceBlockLayout: forceBlockLayout,
          keepBeatMarkers: keepBeatMarkers,
          melodyNoteLines: melodyNoteLines,
          chordBlocks: chordBlocks,
          lines: lines,
        })}
      </div>
    );
  }

  if (lines.length > 0) {
    return wrapFit(
      <div className="timed-lyrics-chords-view" style={contentFontStyle()}>
        <LyricsDisplayLines lines={displayLines} keepBeatMarkers={keepBeatMarkers} />
      </div>
    );
  }

  return null;
}
