import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'react-bootstrap';
import {
  alignChordBlocksToLyrics,
  chartBlockHasChords,
  formatChordChartForDisplay,
  splitChordChartIntoBlocks,
} from '../chordSheetUtils';
import { getLyricLinesForDisplay } from '../wLinesUtils';
import { displaySectionHeader } from '../LyricsDisplayLines';
import { useFitTextScale } from '../useFitTextScale';

/**
 * Structure (chord block) panel.
 *
 * Maps melody chord blocks to lyric sections when headers exist.
 * Auto-fits font so the longest chord line fills available width.
 * When fitHeight is set, also scales to fill the panel height.
 */
export default function StructureChordBlock(props) {
  const {
    chords,
    uniqueChords,
    useInstrument,
    className,
    tune,
    title,
    composer,
    fitHeight,
    inheritScale,
  } = props;

  const structureSections = useMemo(function() {
    const chart = chords || '';
    const chordBlocks = splitChordChartIntoBlocks(chart);
    const lyricLines = tune ? getLyricLinesForDisplay(tune) : [];
    const hasLyricContent = lyricLines.some(function(line) {
      return String(line || '').trim().length > 0;
    });

    if (hasLyricContent && chordBlocks.length > 0) {
      const aligned = alignChordBlocksToLyrics(lyricLines, chordBlocks, {
        title: title || (tune && tune.name),
        composer: composer || (tune && tune.composer),
      });
      const sections = [];
      aligned.forEach(function(block) {
        const label = displaySectionHeader(block.header);
        const showChart = !block.chartRevisit && chartBlockHasChords(block.chart);
        const showExtra = chartBlockHasChords(block.extraChart);
        if (!label && !showChart && !showExtra) return;
        sections.push({
          label: label,
          chart: showChart ? formatChordChartForDisplay(block.chart) : '',
          extraChart: showExtra ? formatChordChartForDisplay(block.extraChart) : '',
          headingOnly: !!block.chartRevisit && !!label,
        });
      });
      if (sections.length > 0) return sections;
    }

    const display = formatChordChartForDisplay(chart);
    if (!display) return [];
    return splitChordChartIntoBlocks(display).map(function(block) {
      return {
        label: null,
        chart: formatChordChartForDisplay(block),
        extraChart: '',
        headingOnly: false,
      };
    }).filter(function(section) {
      return !!section.chart;
    });
  }, [chords, tune, title, composer]);

  const sectionsKey = useMemo(function() {
    return structureSections.map(function(s) {
      return (s.label || '') + '|' + (s.chart || '') + '|' + (s.extraChart || '');
    }).join('||');
  }, [structureSections]);

  const useOwnFit = !inheritScale;

  const { containerRef, contentRef, fontScale } = useFitTextScale({
    fitHeight: useOwnFit && !!fitHeight,
    measureLongestLine: useOwnFit,
    minScale: 0.35,
    maxScale: fitHeight ? 4.5 : 3.2,
    padX: 16,
    padY: 16,
    deps: [sectionsKey, !!fitHeight, !!inheritScale],
  });

  const chordKeys = uniqueChords && typeof uniqueChords === 'object'
    ? Object.keys(uniqueChords)
    : [];

  function renderChartLines(chartText, keyPrefix) {
    return String(chartText || '').split('\n').map(function(line, idx) {
      if (!line.trim()) {
        return <div key={keyPrefix + '-sp-' + idx} className="chord-block-spacer" />;
      }
      return <div key={keyPrefix + '-' + idx} className="chord-block-line">{line}</div>;
    });
  }

  return (
    <div
      className={
        'chord-block-view structure-chord-block'
        + (fitHeight ? ' structure-chord-block--fit-height' : '')
        + (className ? ' ' + className : '')
      }
      ref={useOwnFit ? containerRef : null}
    >
      {chordKeys.length > 0 && useInstrument ? (
        <div className="chord-block-diagram-buttons">
          {chordKeys.map(function(chord) {
            return (
              <Link key={chord} to={'/chords/' + useInstrument + '/' + chord + '/'}>
                <Button size="sm">{chord}</Button>
              </Link>
            );
          })}
        </div>
      ) : null}
      <div
        className="chord-block-lines"
        ref={useOwnFit ? contentRef : null}
        style={useOwnFit ? { fontSize: fontScale + 'em', flex: '0 0 auto' } : { flex: '0 0 auto' }}
      >
        {structureSections.map(function(section, si) {
          return (
            <div key={si} className={'structure-section' + (section.headingOnly ? ' structure-section--heading-only' : '')}>
              {si > 0 ? <div className="structure-section-gap" aria-hidden="true" /> : null}
              {section.label ? (
                <div className="chord-section-header lyrics-section-header">
                  {section.label}
                </div>
              ) : null}
              {section.extraChart ? renderChartLines(section.extraChart, 'extra-' + si) : null}
              {section.chart ? renderChartLines(section.chart, 'chart-' + si) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
