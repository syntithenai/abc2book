import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'react-bootstrap';
import {
  alignChordBlocksToLyrics,
  chartBlockHasChords,
  chordChartFingerprint,
  formatChordChartForDisplay,
  ensureLeadingMeterMarker,
  parseChordChartDisplayLine,
  sanitizeChordChartBlock,
  splitChordChartIntoBlocks,
} from '../chordSheetUtils';
import {
  chordChartBlocksForTuneDisplay,
  chordNoteLinesFromTune,
} from '../chordBlockMerge';
import { getLyricLinesForDisplay } from '../wLinesUtils';
import { displaySectionHeader, SectionHeader } from '../LyricsDisplayLines';
import { useFitTextScale } from '../useFitTextScale';
import StructureCapoControl from './StructureCapoControl';

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

function chartFingerprintAlreadyShown(fp, shownFingerprints) {
  if (!fp) return false;
  if (shownFingerprints[fp]) return true;
  const keys = Object.keys(shownFingerprints);
  for (let i = 0; i < keys.length; i++) {
    const shown = keys[i];
    if (shown && fp.length > shown.length && fp.indexOf(shown) === 0) return true;
  }
  return false;
}

function markChartsAsShown(chartText, shownFingerprints) {
  splitChordChartIntoBlocks(chartText).forEach(function(part) {
    const fp = chordChartFingerprint(part);
    if (fp) shownFingerprints[fp] = true;
  });
}

function renderChartLineParts(line, keyPrefix) {
  return parseChordChartDisplayLine(line).map(function(part, partKey) {
    if (part.type === 'meter') {
      return renderChordMeterMark(part, keyPrefix + '-m-' + partKey);
    }
    if (part.type === 'repeat') {
      return (
        <span key={keyPrefix + '-rm-' + partKey} className="chord-repeat-mark">
          {part.text}
        </span>
      );
    }
    return part.text || '';
  });
}

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
    fitHeightGrow,
    inheritScale,
    melodyNoteLines,
    capoOffset,
    capoEnabled,
    onCapoToggle,
    onCapoOffsetChange,
    showCapoControl,
    chordTranspose,
  } = props;

  const displayTranspose = Number(chordTranspose) || 0;

  const melodyKey = useMemo(function() {
    return chordNoteLinesFromTune(tune, melodyNoteLines).join('\n');
  }, [tune, melodyNoteLines]);

  const structureSections = useMemo(function() {
    const chart = chords || '';
    const lyricLines = tune ? getLyricLinesForDisplay(tune) : [];
    const hasLyricContent = lyricLines.some(function(line) {
      return String(line || '').trim().length > 0;
    });
    const tuneMeter = tune && tune.meter ? tune.meter : null;

    const noteLines = chordNoteLinesFromTune(tune, melodyNoteLines);
    const chordBlocks = chordChartBlocksForTuneDisplay(tune, chart, noteLines, {
      displayTranspose: displayTranspose,
    });
    function formatSectionChart(chartText, applyLeadingMeter) {
      const withMeter = applyLeadingMeter
        ? ensureLeadingMeterMarker(chartText, tuneMeter)
        : chartText;
      return formatChordChartForDisplay(withMeter);
    }

    if (hasLyricContent && chordBlocks.length > 0) {
      const aligned = alignChordBlocksToLyrics(lyricLines, chordBlocks, {
        title: title || (tune && tune.name),
        composer: composer || (tune && tune.composer),
        melodyNoteLines: noteLines,
      });
      const sections = [];
      const shownFingerprints = Object.create(null);
      let leadingMeterPending = !!tuneMeter;
      aligned.forEach(function(block) {
        if (chartBlockHasChords(block.chart)) markChartsAsShown(block.chart, shownFingerprints);
        if (chartBlockHasChords(block.extraChart)) markChartsAsShown(block.extraChart, shownFingerprints);
      });
      aligned.forEach(function(block) {
        const label = displaySectionHeader(block.header);
        const showChart = !block.chartRevisit && chartBlockHasChords(block.chart);
        const showExtra = !block.chartRevisit && chartBlockHasChords(block.extraChart);
        if (!label && !showChart && !showExtra) return;
        const applyLeading = leadingMeterPending && showChart;
        if (applyLeading) leadingMeterPending = false;
        sections.push({
          label: label,
          chart: showChart ? formatSectionChart(block.chart, applyLeading) : '',
          extraChart: showExtra ? formatChordChartForDisplay(block.extraChart) : '',
          headingOnly: !!block.chartRevisit && !!label,
        });
      });
      chordBlocks.forEach(function(blockChart) {
        const cleaned = sanitizeChordChartBlock(blockChart);
        if (!chartBlockHasChords(cleaned)) return;
        const fp = chordChartFingerprint(cleaned);
        if (chartFingerprintAlreadyShown(fp, shownFingerprints)) return;
        const applyLeading = leadingMeterPending;
        if (applyLeading) leadingMeterPending = false;
        sections.push({
          label: null,
          chart: formatSectionChart(cleaned, applyLeading),
          extraChart: '',
          headingOnly: false,
        });
        if (fp) shownFingerprints[fp] = true;
      });
      if (sections.length > 0) {
        return sections;
      }
    }

    const display = formatChordChartForDisplay(chart);
    if (!display) return [];
    let leadingMeterPending = !!tuneMeter;
    return chordChartBlocksForTuneDisplay(tune, display, noteLines, {
      displayTranspose: displayTranspose,
    }).map(function(block) {
      const applyLeading = leadingMeterPending;
      if (applyLeading) leadingMeterPending = false;
      return {
        label: null,
        chart: formatSectionChart(block, applyLeading),
        extraChart: '',
        headingOnly: false,
      };
    }).filter(function(section) {
      return !!section.chart;
    });
  }, [chords, tune, title, composer, melodyKey, melodyNoteLines, displayTranspose]);

  const sectionsKey = useMemo(function() {
    return structureSections.map(function(s) {
      return (s.label || '') + '|' + (s.chart || '') + '|' + (s.extraChart || '');
    }).join('||');
  }, [structureSections]);

  const useOwnFit = !inheritScale;

  const heightGrow = fitHeightGrow !== false;

  const { containerRef, contentRef, fontScale, overflows } = useFitTextScale({
    fitHeight: useOwnFit && !!fitHeight,
    measureLongestLine: useOwnFit,
    minScale: 0.35,
    maxScale: fitHeight ? (heightGrow ? 4.5 : 1) : 3.2,
    padX: 16,
    padY: 16,
    // Heading-only stanzas (repeated verses/choruses with no chart of their
    // own) still render, but must not shrink the chord text to fit.
    fitHeightExcludeSelector: '.structure-section--no-chart',
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
      return (
        <div key={keyPrefix + '-' + idx} className="chord-block-line">
          {renderChartLineParts(line, keyPrefix + '-' + idx)}
        </div>
      );
    });
  }

  return (
    <div
      className={
        'chord-block-view structure-chord-block'
        + (fitHeight ? ' structure-chord-block--fit-height' : '')
        + (fitHeight && useOwnFit && overflows ? ' structure-chord-block--scroll' : '')
        + (className ? ' ' + className : '')
      }
      ref={useOwnFit ? containerRef : null}
    >
      {(chordKeys.length > 0 && useInstrument) || showCapoControl ? (
        <div className="chord-block-diagram-toolbar">
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
          {showCapoControl ? (
            <StructureCapoControl
              capoOffset={capoOffset || 0}
              capoEnabled={!!capoEnabled}
              onToggle={onCapoToggle}
              onOffsetChange={onCapoOffsetChange}
              tune={tune}
              chordGridText={chords}
            />
          ) : null}
        </div>
      ) : null}
      <div
        className="chord-block-lines"
        ref={useOwnFit ? contentRef : null}
        style={useOwnFit ? { fontSize: fontScale + 'em' } : undefined}
      >
        {structureSections.map(function(section, si) {
          const noChart = !section.chart && !section.extraChart;
          return (
            <div
              key={si}
              className={
                'structure-section'
                + (section.headingOnly ? ' structure-section--heading-only' : '')
                + (noChart ? ' structure-section--no-chart' : '')
              }
            >
              {si > 0 ? <div className="structure-section-gap" aria-hidden="true" /> : null}
              {section.label ? (
                <SectionHeader
                  label={section.label}
                  source={section.label}
                  className="chord-section-header"
                />
              ) : null}
              {section.chart ? renderChartLines(section.chart, 'chart-' + si) : null}
              {section.extraChart ? renderChartLines(section.extraChart, 'extra-' + si) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
