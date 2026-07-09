import { useEffect, useMemo, useRef, useState } from 'react';
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

/**
 * Structure (chord block) panel.
 *
 * When lyrics have section headers, maps melody chord blocks to those sections:
 * - first occurrence of a section shows heading + chords
 * - repeated section (e.g. second #verse) shows heading only
 * - blank line / spacer between sections (double-bar gaps)
 * - orphan (unmapped) chord blocks appear before the last unidentified lyrics
 *
 * Auto-fits font so the longest chord line fills available width without wrapping.
 * Empty bars render as "/".
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
  } = props;
  const containerRef = useRef(null);
  const [fontSize, setFontSize] = useState('1em');

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

    // Fallback: raw melody blocks with spacers between double-bar sections.
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

  const measureText = useMemo(function() {
    const lines = [];
    structureSections.forEach(function(section) {
      if (section.label) lines.push(section.label);
      String(section.extraChart || '').split('\n').forEach(function(line) {
        if (line.trim()) lines.push(line);
      });
      String(section.chart || '').split('\n').forEach(function(line) {
        if (line.trim()) lines.push(line);
      });
    });
    return lines;
  }, [structureSections]);

  useEffect(function() {
    if (!containerRef.current) return undefined;
    function recalcFontSize() {
      const container = containerRef.current;
      if (!container) return;
      const availW = container.clientWidth - 32;
      if (!availW || availW <= 0) return;
      if (!measureText.length) return;
      const longest = measureText.reduce(function(a, b) {
        return a.length >= b.length ? a : b;
      }, '');
      if (!longest) return;
      const test = document.createElement('span');
      test.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-family:inherit;';
      test.textContent = longest;
      container.appendChild(test);
      var lo = 0.5;
      var hi = 3;
      for (var i = 0; i < 24; i++) {
        var mid = (lo + hi) / 2;
        test.style.fontSize = mid + 'em';
        if (test.offsetWidth <= availW) lo = mid;
        else hi = mid;
      }
      container.removeChild(test);
      setFontSize(lo.toFixed(3) + 'em');
    }
    recalcFontSize();
    const observer = new ResizeObserver(recalcFontSize);
    observer.observe(containerRef.current);
    return function() { observer.disconnect(); };
  }, [measureText]);

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
    <div className={'chord-block-view structure-chord-block' + (className ? ' ' + className : '')} ref={containerRef}>
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
      <div className="chord-block-lines" style={{ fontSize: fontSize }}>
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
