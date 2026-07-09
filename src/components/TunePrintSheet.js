import { useEffect, useMemo, useRef, useState } from 'react';
import abcjs from 'abcjs';
import TimedLyricsChordsView from './TimedLyricsChordsView';
import LyricsDisplayLines from '../LyricsDisplayLines';
import PrintBackgroundMarkdown, { renderPrintBackgroundMeasureBlock } from './PrintBackgroundMarkdown';
import useAbcjsParser from '../useAbcjsParser';
import useQRCode from '../useQRCode';
import {
  viewModeToDisplayFlags,
  resolveDisplayFlagsForTune,
} from '../viewModeUtils';
import { tuneHasExplicitChords } from '../timedLyricsChordsDisplay';
import { hasChordLines } from '../chordSheetUtils';
import { getLyricLinesForDisplay } from '../wLinesUtils';
import {
  buildAbcWithNoteSpacing,
  stripEmbeddedChordsFromAbc,
  stripLyricLinesFromAbc,
} from '../noteSpacingUtils';
import { filterTuneVoices } from '../abcVoiceFilter';
import { getTuneVoiceKeys, getVisibleVoiceKeys } from '../abcVoiceViewSettings';
import {
  buildGigNotationRenderOptions,
  findStaffWidthForHorizontalFit,
  fitNotationSvg,
  getRenderDimensions,
  computeNotationFit,
  NOTATION_FIT_HORIZONTAL,
  applyNotationFit,
  applyFitViewBox,
  measureFitFrame,
} from '../gigNotationFit';
import {
  getPrintNotationPaper,
  getPrintNotationColumnWidth,
  PRINT_CHORDS_COL_WIDTH_PX,
  PRINT_INNER_WIDTH_PX,
  PRINT_NOTATION_COL_WIDTH_PX,
  PRINT_PAGE_HEIGHT_PX,
} from '../generateTunesPdf';
import {
  getOffsetTopWithin,
  getPrintPageFooterReserve,
  getSafeLyricsAvailableHeight,
  lyricsBlockOverflowsPage,
  measureProbeLyricsHeight,
  PRINT_LYRICS_BASE_FONT_PX,
  PRINT_LYRICS_BESIDE_CHORDS_BASE_FONT_PX,
  PRINT_LYRICS_BESIDE_CHORDS_MAX_FONT_PX,
  PRINT_LYRICS_MIN_FONT_PX,
  PRINT_LYRICS_SPLIT_PAGE_TOP_RESERVE_PX,
  resolvePrintLyricsBesideChordsLayout,
  resolvePrintLyricsLayoutWithMeasurement,
  resolvePrintLyricsSplitPageLayout,
} from '../printLyricsLayout';
import { parseMarkdownBlocks } from '../markdownUtils';
import {
  assignBackgroundBlocksToPages,
  buildBackgroundPrintPageAvailability,
  expandBackgroundBlocksForPrint,
  getBackgroundBlockHeightsFromElements,
  getBackgroundContinuationPageFontSize,
  getMainTunePageBackgroundAvailablePx,
  getPrintBackgroundFooterReserve,
  PRINT_BACKGROUND_BASE_FONT_PX,
  PRINT_BACKGROUND_CONTINUATION_TOP_RESERVE_PX,
  PRINT_BACKGROUND_CONTINUATION_NO_HEADER_TOP_RESERVE_PX,
  PRINT_BACKGROUND_MIN_FONT_PX,
  resolveBackgroundPageLayout,
  resolveBackgroundSectionFontSize,
  shouldBackgroundStartOnNewPrintPage,
} from '../printBackgroundInfoLayout';

function stripPrintNotationHeaders(abcText) {
  if (!abcText) return '';
  return abcText.split('\n').filter(function(line) {
    const trimmed = line.trim();
    if (trimmed.startsWith('B:')) return false;
    if (trimmed.startsWith('T:')) return false;
    if (trimmed.startsWith('N: AKA:')) return false;
    if (trimmed.startsWith('% abcbook-tags')) return false;
    return true;
  }).join('\n');
}

function PrintLyricsColumns(props) {
  const columnCount = props.columnCount === 3 ? 3 : 2;
  return (
    <div className={'print-pdf-lyrics-columns print-pdf-lyrics-columns--' + columnCount}>
      {props.children}
    </div>
  );
}

function PrintLyricsBlock(props) {
  if (!props.children) return null;
  const fontSizePx = props.fontSizePx || PRINT_LYRICS_BASE_FONT_PX;
  const lineHeight = props.lineHeight || 1.45;
  const lyricsEl = (
    <div className="music-view-lyrics" style={{ fontSize: fontSizePx + 'px', lineHeight: lineHeight }}>
      {props.children}
    </div>
  );
  return (
    <div
      className={'print-pdf-lyrics-full-width print-pdf-lyrics-fit'
        + (props.compact ? ' print-pdf-lyrics-fit--compact' : '')
        + (props.fillHeight ? ' print-pdf-lyrics-fill-height' : '')
        + (props.className ? ' ' + props.className : '')}
      ref={props.blockRef}
      style={props.maxWidthPx ? {
        width: '100%',
        maxWidth: props.maxWidthPx + 'px',
        boxSizing: 'border-box',
      } : undefined}
    >
      {props.columnCount === 1 ? lyricsEl : (
        <PrintLyricsColumns columnCount={props.columnCount}>
          {lyricsEl}
        </PrintLyricsColumns>
      )}
    </div>
  );
}

function PrintPageHeader(props) {
  const tune = props.tune;
  if (!tune) return null;
  const showComposer = !!props.showComposer && !!tune.composer;
  const capo = Number(tune.capo) || 0;
  const showCapo = props.showCapo !== false && capo > 0;
  const showQr = !!(props.useQR && props.useLink);
  if (!tune.name && !showComposer && !showCapo && !showQr) return null;

  return (
    <div className={'print-pdf-page-header avoidbreak' + (showQr ? '' : ' print-pdf-page-header--no-qr')}>
      {showQr ? (
        <div className="print-pdf-page-header-qr">
          <div
            className="print-qrcode"
            style={{ width: '128px', height: '128px' }}
            ref={props.qrRef || null}
          />
        </div>
      ) : null}
      <div className="print-pdf-page-header-text">
        <div className="print-pdf-page-header-title-row">
          <div className="title print-pdf-tune-title">{tune.name}</div>
          {showComposer ? <div className="composer print-pdf-composer">{tune.composer}</div> : null}
        </div>
        {showCapo ? <div className="print-pdf-capo">Capo {capo}</div> : null}
      </div>
    </div>
  );
}

export default function TunePrintSheet(props) {
  const tune = props.tune;
  const tunebook = props.tunebook;
  const viewMode = props.viewMode;
  const useQR = props.useQR;
  const abcjsParser = useAbcjsParser({ tunebook: tunebook });
  const QRCode = useQRCode();
  const notationColRef = useRef(null);
  const notationRef = useRef(null);
  const qrRef = useRef(null);
  const pageRef = useRef(null);
  const bgBlockRef = useRef(null);
  const bgDividerRef = useRef(null);
  const lyricsAnchorRef = useRef(null);
  const lyricsProbe1Ref = useRef(null);
  const lyricsProbe2Ref = useRef(null);
  const lyricsProbe3Ref = useRef(null);
  const lyricsFlowProbeRef = useRef(null);
  const chordsLyricsFlowRef = useRef(null);
  const lyricsBlockRef = useRef(null);
  const splitLyricsPageRef = useRef(null);
  const splitLyricsAnchorRef = useRef(null);
  const splitLyricsBlockRef = useRef(null);
  const bgBlockMeasureRefs = useRef([]);
  const bgHeaderMeasureRef = useRef(null);
  const bgContinuationHeaderMeasureRef = useRef(null);

  // Print uses transpose only; capo is shown in the page header, not applied to chords/notation.
  const printDisplayTranspose = Number(tune && tune.transpose) || 0;
  const hasChords = !!(tune && tuneHasExplicitChords(tune, tunebook, abcjsParser));
  const displayFlags = useMemo(function() {
    return resolveDisplayFlagsForTune(
      viewModeToDisplayFlags(viewMode),
      tune,
      tunebook,
      { hasChords: hasChords }
    );
  }, [viewMode, tune, tunebook, hasChords]);

  const notationMode = displayFlags.notation;
  const showNotation = notationMode !== 'off';
  const showLyrics = !!displayFlags.lyrics;
  const showStructure = !!displayFlags.structure;
  const showChordsAnnotate = !!displayFlags.chords;
  const showInfo = displayFlags.info && !props.hideBackgroundInfo;
  const showChordsBlockColumn = showStructure;
  const chordsBlockFullPage = showChordsBlockColumn && !showNotation && !showLyrics;
  // Print: lyrics always sit full-width below notation when both are shown.
  const printStackedLyrics = showNotation && showLyrics;
  const printLyricsOnlyLayout = showLyrics && !showNotation && !showChordsBlockColumn;
  const printLyricsBesideChords = showLyrics && !showNotation && showChordsBlockColumn;
  const needsLyricsLayoutMeasure = printStackedLyrics || printLyricsOnlyLayout || printLyricsBesideChords;
  const lyricsProbeWidthPx = PRINT_INNER_WIDTH_PX;
  const showSideColumn = showChordsBlockColumn;
  const hideChordsInText = !showChordsAnnotate;
  const plainLyricLines = tune ? getLyricLinesForDisplay(tune) : [];
  const isLyricChordSheet = hasChordLines(plainLyricLines);
  const infoOnlyFullPage = showInfo && !showNotation && !showLyrics && !showChordsBlockColumn;
  const backgroundInfoText = tune && typeof tune.backgroundInfo === 'string' ? tune.backgroundInfo.trim() : '';
  const backgroundMarkdownBlocks = useMemo(function() {
    const parsed = backgroundInfoText ? parseMarkdownBlocks(backgroundInfoText) : [];
    return expandBackgroundBlocksForPrint(parsed);
  }, [backgroundInfoText]);
  const needsBackgroundPagination = showInfo && backgroundMarkdownBlocks.length > 0;
  const [backgroundBlockPages, setBackgroundBlockPages] = useState(null);
  const [backgroundPageFontSizes, setBackgroundPageFontSizes] = useState([]);
  const [backgroundPaginationReady, setBackgroundPaginationReady] = useState(!needsBackgroundPagination);
  const canSplitBackground = showInfo && backgroundMarkdownBlocks.length > 0 && !infoOnlyFullPage;
  const [lyricsLayout, setLyricsLayout] = useState(function() {
    return {
      status: needsLyricsLayoutMeasure ? 'measuring' : 'ready',
      placement: needsLyricsLayoutMeasure ? 'inline' : 'none',
      columns: 2,
      fontSizePx: PRINT_LYRICS_BASE_FONT_PX,
    };
  });
  const [lyricsFitVerified, setLyricsFitVerified] = useState(!needsLyricsLayoutMeasure);
  const lyricsLayoutReady = !needsLyricsLayoutMeasure
    || (lyricsLayout.status === 'ready' && lyricsFitVerified);
  const notationColumnWidth = getPrintNotationColumnWidth(showChordsBlockColumn);

  const useLink = tune && tune.links && tune.links[0] && tune.links[0].link
    ? tune.links[0].link
    : '';

  useEffect(function() {
    if (!useQR || !QRCode || !qrRef.current || !useLink) return;
    while (qrRef.current.firstChild) {
      qrRef.current.removeChild(qrRef.current.firstChild);
    }
    new QRCode(qrRef.current, {
      text: useLink,
      width: 128,
      height: 128,
      colorDark: '#000000',
      colorLight: '#ffffff',
      useSVG: true,
      correctLevel: QRCode.CorrectLevel.H,
    });
  }, [useQR, QRCode, useLink, tune && tune.id]);

  useEffect(function() {
    if (!showNotation || !notationRef.current || !notationColRef.current || !tune || !tunebook) {
      return undefined;
    }

    function runRender() {
      const colEl = notationColRef.current;
      const renderEl = notationRef.current;
      if (!colEl || !renderEl) return;

      const paperEl = colEl.querySelector('.print-pdf-notation-paper') || colEl;
      colEl.style.width = notationColumnWidth + 'px';
      colEl.style.minWidth = notationColumnWidth + 'px';
      colEl.style.maxWidth = showChordsBlockColumn ? notationColumnWidth + 'px' : 'none';
      paperEl.style.width = '100%';
      renderEl.style.width = '100%';
      const paper = getPrintNotationPaper({ withBlockChords: showChordsBlockColumn });

      const tuneVoiceKeys = getTuneVoiceKeys(tune);
      const visibleVoiceKeys = getVisibleVoiceKeys(tune.id, tuneVoiceKeys);
      const visibleTune = filterTuneVoices(tune, visibleVoiceKeys);
      const displayTune = Object.assign({}, visibleTune, { transpose: printDisplayTranspose });
      const displayAbc = buildAbcWithNoteSpacing(displayTune, tunebook.abcTools, { includeLyrics: false });
      let staffAbc = stripPrintNotationHeaders(displayAbc);
      staffAbc = stripLyricLinesFromAbc(staffAbc);
      if (!showChordsAnnotate) {
        staffAbc = stripEmbeddedChordsFromAbc(staffAbc, tunebook.abcTools);
      }
      const renderOptions = buildGigNotationRenderOptions(printDisplayTranspose);

      function renderAtStaffWidth(staffWidth) {
        renderEl.innerHTML = '';
        abcjs.renderAbc(renderEl, staffAbc, Object.assign({}, renderOptions, {
          staffwidth: staffWidth,
        }));
        const svg = renderEl.querySelector('svg');
        if (!svg) return null;
        const dims = getRenderDimensions(svg);
        if (!(dims.width > 0) || !(dims.height > 0)) return null;
        return { svg: svg, dims: dims };
      }

      try {
        const fit = findStaffWidthForHorizontalFit(function(staffWidth) {
          return renderAtStaffWidth(staffWidth);
        }, paper.availW, paper.availH, paper.availW);
        const rendered = renderAtStaffWidth(fit.staffWidth);
        if (!rendered || !rendered.svg) return;
        const frame = measureFitFrame(rendered.svg);
        const dims = frame ? applyFitViewBox(rendered.svg, frame) : null;
        const fitResult = dims
          ? computeNotationFit(dims, NOTATION_FIT_HORIZONTAL, paper.availW, paper.availH)
          : null;
        if (fitResult) {
          applyNotationFit(rendered.svg, renderEl, fitResult);
        } else {
          fitNotationSvg(rendered.svg, renderEl, colEl);
        }
      } catch (e) {
        console.log('print notation render', e);
      }
    }

    function startRender() {
      requestAnimationFrame(runRender);
    }

    const fontsReady = typeof document !== 'undefined' && document.fonts && document.fonts.ready;
    if (fontsReady && typeof fontsReady.then === 'function') {
      fontsReady.then(startRender);
    } else {
      startRender();
    }

    return undefined;
  }, [showNotation, showChordsBlockColumn, notationColumnWidth, tune, tunebook, viewMode, showChordsAnnotate, printDisplayTranspose]);

  useEffect(function() {
    if (!needsLyricsLayoutMeasure || !tune) {
      setLyricsLayout({
        status: 'ready',
        placement: 'none',
        columns: 2,
        fontSizePx: PRINT_LYRICS_BASE_FONT_PX,
      });
      setLyricsFitVerified(true);
      return undefined;
    }
    setLyricsFitVerified(false);
    setLyricsLayout({
      status: 'measuring',
      placement: 'inline',
      columns: 2,
      fontSizePx: PRINT_LYRICS_BASE_FONT_PX,
    });
    let cancelled = false;
    let measureAttempts = 0;

    function measureLyricsLayout() {
      if (cancelled) return;
      measureAttempts += 1;
      const page = pageRef.current;
      const anchor = lyricsAnchorRef.current;
      const probe1 = lyricsProbe1Ref.current;
      const probe2 = lyricsProbe2Ref.current;
      const probe3 = lyricsProbe3Ref.current;
      const inlineProbe = printLyricsBesideChords ? probe1 : probe2;
      if (!page || !anchor || !inlineProbe) {
        if (measureAttempts < 40) {
          setTimeout(measureLyricsLayout, 50);
          return;
        }
        setLyricsLayout({
          status: 'ready',
          placement: 'inline',
          columns: printLyricsBesideChords ? 1 : 2,
          fontSizePx: PRINT_LYRICS_BASE_FONT_PX,
        });
        setLyricsFitVerified(true);
        return;
      }
      if (printStackedLyrics && !probe3) {
        if (measureAttempts < 40) {
          setTimeout(measureLyricsLayout, 50);
          return;
        }
        setLyricsLayout({
          status: 'ready',
          placement: 'inline',
          columns: 2,
          fontSizePx: PRINT_LYRICS_BASE_FONT_PX,
        });
        setLyricsFitVerified(true);
        return;
      }
      if (showNotation) {
        const svg = page.querySelector('.print-pdf-notation-render svg');
        if (!svg && measureAttempts < 40) {
          setTimeout(measureLyricsLayout, 50);
          return;
        }
      }
      if (!(inlineProbe.offsetHeight > 0) && measureAttempts < 40) {
        setTimeout(measureLyricsLayout, 50);
        return;
      }
      const anchorTop = getOffsetTopWithin(anchor, page);
      const contentBelowPx = (canSplitBackground && !needsBackgroundPagination
        && bgBlockRef.current && bgBlockRef.current.offsetHeight > 0)
        ? bgBlockRef.current.offsetHeight + 12
        : 0;
      if (probe1) {
        probe1.style.width = PRINT_NOTATION_COL_WIDTH_PX + 'px';
      }
      if (probe2) {
        probe2.style.width = (printLyricsBesideChords ? PRINT_INNER_WIDTH_PX : lyricsProbeWidthPx) + 'px';
      }
      if (probe3) {
        probe3.style.width = (printLyricsBesideChords ? PRINT_INNER_WIDTH_PX : lyricsProbeWidthPx) + 'px';
      }
      const allowSplit = printStackedLyrics || printLyricsOnlyLayout;
      if (printLyricsBesideChords && probe1) {
        const flowProbe = lyricsFlowProbeRef.current;
        const chordSide = flowProbe && flowProbe.querySelector('.print-pdf-chords-side');
        if ((!flowProbe || !chordSide || !(chordSide.offsetHeight > 0)) && measureAttempts < 40) {
          setTimeout(measureLyricsLayout, 50);
          return;
        }
        const availableHeightPx = getSafeLyricsAvailableHeight(
          anchorTop,
          PRINT_PAGE_HEIGHT_PX,
          getPrintPageFooterReserve(page),
          contentBelowPx
        );
        const resolvedBeside = resolvePrintLyricsBesideChordsLayout({
          availableHeightPx: availableHeightPx,
          measure1Col: function(fontSizePx) {
            measureProbeLyricsHeight(probe1, 1, fontSizePx);
            return flowProbe ? flowProbe.offsetHeight : measureProbeLyricsHeight(probe1, 1, fontSizePx);
          },
          minFontPx: PRINT_LYRICS_MIN_FONT_PX,
          maxFontPx: PRINT_LYRICS_BESIDE_CHORDS_MAX_FONT_PX,
        });
        setLyricsLayout(Object.assign({ status: 'ready' }, resolvedBeside));
        return;
      }
      const resolved = resolvePrintLyricsLayoutWithMeasurement({
        anchorTopPx: anchorTop,
        pageHeightPx: PRINT_PAGE_HEIGHT_PX,
        footerReservePx: getPrintPageFooterReserve(page),
        contentBelowPx: contentBelowPx,
        allowSplit: allowSplit,
        allow2Col: !printLyricsBesideChords,
        allow3Col: !printLyricsBesideChords,
        splitPageTopReservePx: PRINT_LYRICS_SPLIT_PAGE_TOP_RESERVE_PX,
        measure1Col: printLyricsBesideChords ? function(fontSizePx) {
          return measureProbeLyricsHeight(probe1, 1, fontSizePx);
        } : null,
        measure2Col: probe2 ? function(fontSizePx) {
          return measureProbeLyricsHeight(probe2, 2, fontSizePx);
        } : null,
        measure3Col: probe3 ? function(fontSizePx) {
          return measureProbeLyricsHeight(probe3, 3, fontSizePx);
        } : null,
      });
      setLyricsLayout({
        status: 'ready',
        placement: resolved.placement,
        columns: resolved.columns,
        fontSizePx: resolved.fontSizePx,
      });
    }

    function scheduleMeasure() {
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          setTimeout(measureLyricsLayout, 100);
        });
      });
    }

    const fontsReady = typeof document !== 'undefined' && document.fonts && document.fonts.ready;
    if (fontsReady && typeof fontsReady.then === 'function') {
      fontsReady.then(scheduleMeasure);
    } else {
      scheduleMeasure();
    }

    return function() {
      cancelled = true;
    };
  }, [
    needsLyricsLayoutMeasure,
    printStackedLyrics,
    printLyricsOnlyLayout,
    printLyricsBesideChords,
    lyricsProbeWidthPx,
    canSplitBackground,
    needsBackgroundPagination,
    tune && tune.id,
    viewMode,
    showNotation,
    showChordsBlockColumn,
    showChordsAnnotate,
    printDisplayTranspose,
    plainLyricLines.length,
    isLyricChordSheet,
  ]);

  useEffect(function() {
    if (!needsLyricsLayoutMeasure || !tune || lyricsLayout.status !== 'ready') {
      return undefined;
    }
    if (printLyricsBesideChords) {
      let cancelled = false;
      let verifyAttempts = 0;

      function verifyBesideChordsFit() {
        if (cancelled) return;
        verifyAttempts += 1;
        const page = pageRef.current;
        const flowEl = chordsLyricsFlowRef.current;
        const anchor = lyricsAnchorRef.current;
        if (!page || !flowEl || !anchor || !(flowEl.offsetHeight > 0)) {
          if (verifyAttempts < 32) {
            setTimeout(verifyBesideChordsFit, 50);
          }
          return;
        }
        const contentBelowPx = (canSplitBackground && !needsBackgroundPagination
          && bgBlockRef.current && bgBlockRef.current.offsetHeight > 0)
          ? bgBlockRef.current.offsetHeight + 12
          : 0;
        const overflows = lyricsBlockOverflowsPage(
          page,
          flowEl,
          anchor,
          PRINT_PAGE_HEIGHT_PX,
          getPrintPageFooterReserve(page),
          contentBelowPx
        );
        if (!overflows) {
          setLyricsFitVerified(true);
          return;
        }
        setLyricsFitVerified(false);
        if (lyricsLayout.fontSizePx > PRINT_LYRICS_MIN_FONT_PX) {
          setLyricsLayout(function(prev) {
            return Object.assign({}, prev, {
              fontSizePx: prev.fontSizePx - 1,
            });
          });
          return;
        }
        if (verifyAttempts < 32) {
          setTimeout(verifyBesideChordsFit, 50);
        } else {
          setLyricsFitVerified(true);
        }
      }

      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          setTimeout(verifyBesideChordsFit, 80);
        });
      });

      return function() {
        cancelled = true;
      };
    }

    let cancelled = false;
    let verifyAttempts = 0;

    function remeasureSplitLayout() {
      const page = pageRef.current;
      const probe2 = lyricsProbe2Ref.current;
      const probe3 = lyricsProbe3Ref.current;
      if (!page || !probe2) return null;
      probe2.style.width = PRINT_INNER_WIDTH_PX + 'px';
      if (probe3) {
        probe3.style.width = PRINT_INNER_WIDTH_PX + 'px';
      }
      return resolvePrintLyricsSplitPageLayout({
        pageHeightPx: PRINT_PAGE_HEIGHT_PX,
        footerReservePx: getPrintPageFooterReserve(page),
        splitPageTopReservePx: PRINT_LYRICS_SPLIT_PAGE_TOP_RESERVE_PX,
        allow3Col: true,
        measure2Col: function(fontSizePx) {
          return measureProbeLyricsHeight(probe2, 2, fontSizePx);
        },
        measure3Col: probe3 ? function(fontSizePx) {
          return measureProbeLyricsHeight(probe3, 3, fontSizePx);
        } : null,
      });
    }

    function verifyLyricsFit() {
      if (cancelled) return;
      verifyAttempts += 1;
      const isSplit = lyricsLayout.placement === 'split';
      const page = isSplit ? splitLyricsPageRef.current : pageRef.current;
      const block = isSplit ? splitLyricsBlockRef.current : lyricsBlockRef.current;
      const anchor = isSplit ? splitLyricsAnchorRef.current : lyricsAnchorRef.current;
      if (!page || !block || !(block.offsetHeight > 0)) {
        if (verifyAttempts < 32) {
          setTimeout(verifyLyricsFit, 50);
        }
        return;
      }
      const contentBelowPx = isSplit ? 0 : (
        (canSplitBackground && !needsBackgroundPagination
          && bgBlockRef.current && bgBlockRef.current.offsetHeight > 0)
          ? bgBlockRef.current.offsetHeight + 12
          : 0
      );
      const footerReservePx = getPrintPageFooterReserve(page);
      const overflows = lyricsBlockOverflowsPage(
        page,
        block,
        anchor,
        PRINT_PAGE_HEIGHT_PX,
        footerReservePx,
        contentBelowPx
      );
      if (!overflows) {
        setLyricsFitVerified(true);
        return;
      }
      setLyricsFitVerified(false);
      if (lyricsLayout.fontSizePx > PRINT_LYRICS_MIN_FONT_PX) {
        setLyricsLayout(function(prev) {
          return Object.assign({}, prev, {
            fontSizePx: prev.fontSizePx - 1,
          });
        });
        return;
      }
      if (!isSplit && printLyricsOnlyLayout && lyricsLayout.columns < 3) {
        setLyricsLayout({
          status: 'measuring',
          placement: 'inline',
          columns: 3,
          fontSizePx: PRINT_LYRICS_BASE_FONT_PX,
        });
        return;
      }
      if (!isSplit) {
        const splitLayout = remeasureSplitLayout();
        if (splitLayout) {
          verifyAttempts = 0;
          setLyricsLayout({
            status: 'ready',
            placement: splitLayout.placement,
            columns: splitLayout.columns,
            fontSizePx: splitLayout.fontSizePx,
          });
          setTimeout(verifyLyricsFit, 80);
          return;
        }
      }
      if (verifyAttempts < 32) {
        setTimeout(verifyLyricsFit, 50);
      } else {
        setLyricsFitVerified(true);
      }
    }

    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        setTimeout(verifyLyricsFit, 80);
      });
    });

    return function() {
      cancelled = true;
    };
  }, [
    needsLyricsLayoutMeasure,
    printStackedLyrics,
    printLyricsOnlyLayout,
    printLyricsBesideChords,
    canSplitBackground,
    needsBackgroundPagination,
    tune && tune.id,
    lyricsLayout.status,
    lyricsLayout.placement,
    lyricsLayout.columns,
    lyricsLayout.fontSizePx,
  ]);

  useEffect(function() {
    if (!needsBackgroundPagination || !tune) {
      setBackgroundBlockPages(null);
      setBackgroundPageFontSizes([]);
      setBackgroundPaginationReady(true);
      return undefined;
    }
    if (needsLyricsLayoutMeasure && !lyricsLayoutReady) {
      setBackgroundPaginationReady(false);
      setBackgroundBlockPages(null);
      return undefined;
    }

    setBackgroundPaginationReady(false);
    setBackgroundBlockPages(null);
    let cancelled = false;
    let measureAttempts = 0;
    bgBlockMeasureRefs.current = [];

    function measureBackgroundPagination() {
      if (cancelled) return;
      measureAttempts += 1;
      const forceBackgroundContinuationOnly = shouldBackgroundStartOnNewPrintPage({
        canSplitBackground: canSplitBackground,
        showLyrics: showLyrics,
        showChordsBlockColumn: showChordsBlockColumn,
        showNotation: showNotation,
      });
      const blockEls = bgBlockMeasureRefs.current;
      const allMeasured = backgroundMarkdownBlocks.every(function(_, index) {
        return blockEls[index] && blockEls[index].offsetHeight > 0;
      });
      if (!allMeasured) {
        if (measureAttempts < 40) {
          setTimeout(measureBackgroundPagination, 50);
          return;
        }
        const blockHeights = backgroundMarkdownBlocks.map(function(_, index) {
          const el = blockEls[index];
          return el && el.offsetHeight > 0 ? el.offsetHeight : 120;
        });
        const page = pageRef.current;
        const footerReservePx = page ? getPrintBackgroundFooterReserve(page) : getPrintPageFooterReserve(page);
        const firstHeaderHeight = bgHeaderMeasureRef.current && bgHeaderMeasureRef.current.offsetHeight > 0
          ? bgHeaderMeasureRef.current.offsetHeight
          : PRINT_BACKGROUND_CONTINUATION_TOP_RESERVE_PX;
        const continuationHeaderHeight = bgContinuationHeaderMeasureRef.current
          && bgContinuationHeaderMeasureRef.current.offsetHeight > 0
          ? bgContinuationHeaderMeasureRef.current.offsetHeight
          : PRINT_BACKGROUND_CONTINUATION_TOP_RESERVE_PX;
        const getAvailableForPage = buildBackgroundPrintPageAvailability({
          pageHeightPx: PRINT_PAGE_HEIGHT_PX,
          footerReservePx: footerReservePx,
          firstPageTopReservePx: firstHeaderHeight + 12,
          continuationTopReservePx: continuationHeaderHeight + 12,
          continuationNoHeaderTopReservePx: PRINT_BACKGROUND_CONTINUATION_NO_HEADER_TOP_RESERVE_PX,
          mainPageAvailablePx: 0,
          infoOnlyFullPage: infoOnlyFullPage,
          hasHeaderOnPage: function(pageIndex) {
            return pageIndex === 0;
          },
        });
        const pages = assignBackgroundBlocksToPages(
          blockHeights,
          backgroundMarkdownBlocks,
          {
            getAvailableForPage: getAvailableForPage,
            baseFontPx: PRINT_BACKGROUND_BASE_FONT_PX,
            minFontPx: PRINT_BACKGROUND_MIN_FONT_PX,
            skipMainPageWhenSectionDoesNotFit: false,
            forceBackgroundContinuationOnly: forceBackgroundContinuationOnly,
            useBaseFontForPageFit: true,
          }
        );
        const fontSizes = pages.map(function(blockIndices, pageIndex) {
          let sectionHeight = 0;
          blockIndices.forEach(function(blockIndex) {
            sectionHeight += blockHeights[blockIndex] || 0;
          });
          return resolveBackgroundSectionFontSize(
            sectionHeight,
            getAvailableForPage(pageIndex),
            PRINT_BACKGROUND_BASE_FONT_PX,
            PRINT_BACKGROUND_MIN_FONT_PX
          );
        });
        setBackgroundPageFontSizes(fontSizes);
        setBackgroundBlockPages(pages);
        setBackgroundPaginationReady(true);
        return;
      }

      const blockHeights = getBackgroundBlockHeightsFromElements(blockEls);
      const page = pageRef.current;
      const footerReservePx = page ? getPrintBackgroundFooterReserve(page) : getPrintPageFooterReserve(page);
      const firstHeaderHeight = bgHeaderMeasureRef.current && bgHeaderMeasureRef.current.offsetHeight > 0
        ? bgHeaderMeasureRef.current.offsetHeight
        : PRINT_BACKGROUND_CONTINUATION_TOP_RESERVE_PX;
      const continuationHeaderHeight = bgContinuationHeaderMeasureRef.current
        && bgContinuationHeaderMeasureRef.current.offsetHeight > 0
        ? bgContinuationHeaderMeasureRef.current.offsetHeight
        : PRINT_BACKGROUND_CONTINUATION_TOP_RESERVE_PX;
      const mainPageAvailablePx = (!infoOnlyFullPage && page && bgDividerRef.current)
        ? getMainTunePageBackgroundAvailablePx(page, bgDividerRef.current, 12)
        : 0;
      if (!infoOnlyFullPage && !(mainPageAvailablePx > 0) && !forceBackgroundContinuationOnly && measureAttempts < 40) {
        setTimeout(measureBackgroundPagination, 50);
        return;
      }
      const getAvailableForPage = buildBackgroundPrintPageAvailability({
        pageHeightPx: PRINT_PAGE_HEIGHT_PX,
        footerReservePx: footerReservePx,
        firstPageTopReservePx: firstHeaderHeight + 12,
        continuationTopReservePx: continuationHeaderHeight + 12,
        continuationNoHeaderTopReservePx: PRINT_BACKGROUND_CONTINUATION_NO_HEADER_TOP_RESERVE_PX,
        mainPageAvailablePx: mainPageAvailablePx,
        infoOnlyFullPage: infoOnlyFullPage,
        hasHeaderOnPage: function(pageIndex) {
          return pageIndex === 0;
        },
      });
      const pages = assignBackgroundBlocksToPages(
        blockHeights,
        backgroundMarkdownBlocks,
        {
          getAvailableForPage: getAvailableForPage,
          baseFontPx: PRINT_BACKGROUND_BASE_FONT_PX,
          minFontPx: PRINT_BACKGROUND_MIN_FONT_PX,
          skipMainPageWhenSectionDoesNotFit: !infoOnlyFullPage && mainPageAvailablePx > 0 && !forceBackgroundContinuationOnly,
          forceBackgroundContinuationOnly: forceBackgroundContinuationOnly,
          useBaseFontForPageFit: true,
        }
      );
      const fontSizes = pages.map(function(blockIndices, pageIndex) {
        let sectionHeight = 0;
        blockIndices.forEach(function(blockIndex) {
          sectionHeight += blockHeights[blockIndex] || 0;
        });
        return resolveBackgroundSectionFontSize(
          sectionHeight,
          getAvailableForPage(pageIndex),
          PRINT_BACKGROUND_BASE_FONT_PX,
          PRINT_BACKGROUND_MIN_FONT_PX
        );
      });
      setBackgroundPageFontSizes(fontSizes);
      setBackgroundBlockPages(pages);
      setBackgroundPaginationReady(true);
    }

    function scheduleMeasure() {
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          setTimeout(measureBackgroundPagination, 100);
        });
      });
    }

    if (!infoOnlyFullPage && showNotation) {
      const page = pageRef.current;
      const svg = page && page.querySelector('.print-pdf-notation-render svg');
      if (!svg && measureAttempts < 1) {
        scheduleMeasure();
        return function() {
          cancelled = true;
        };
      }
    }

    const fontsReady = typeof document !== 'undefined' && document.fonts && document.fonts.ready;
    if (fontsReady && typeof fontsReady.then === 'function') {
      fontsReady.then(scheduleMeasure);
    } else {
      scheduleMeasure();
    }

    return function() {
      cancelled = true;
    };
  }, [
    needsBackgroundPagination,
    backgroundInfoText,
    backgroundMarkdownBlocks.length,
    infoOnlyFullPage,
    showNotation,
    showLyrics,
    showChordsBlockColumn,
    useQR,
    useLink,
    tune && tune.id,
    needsLyricsLayoutMeasure,
    lyricsLayoutReady,
    lyricsLayout.placement,
  ]);

  if (!tune) return null;

  function renderBackgroundInfoBlocks(blockIndices, className, fontSizePx) {
    if (!blockIndices || blockIndices.length === 0) return null;
    const blocks = blockIndices.map(function(index) {
      return backgroundMarkdownBlocks[index];
    }).filter(Boolean);
    if (blocks.length === 0) return null;
    const sizePx = fontSizePx || PRINT_BACKGROUND_BASE_FONT_PX;
    return (
      <div
        className={'tune-background-info-view' + (className || '')}
        style={{ fontSize: sizePx + 'px', lineHeight: 1.45 }}
      >
        <PrintBackgroundMarkdown blocks={blocks} />
      </div>
    );
  }

  const shouldBackgroundStartOnNewPage = shouldBackgroundStartOnNewPrintPage({
    canSplitBackground: canSplitBackground,
    showLyrics: showLyrics,
    showChordsBlockColumn: showChordsBlockColumn,
    showNotation: showNotation,
  });
  const backgroundPageLayout = resolveBackgroundPageLayout(
    backgroundBlockPages,
    shouldBackgroundStartOnNewPage
  );
  const mainPageBackgroundBlockIndices = backgroundPageLayout.mainBlockIndices
    || (!needsBackgroundPagination && backgroundMarkdownBlocks.length > 0 && !shouldBackgroundStartOnNewPage
      ? backgroundMarkdownBlocks.map(function(_, index) { return index; })
      : null);
  const paginatedBackgroundPages = backgroundPageLayout.continuationPages;
  const includeBackgroundOnMainPage = !!(mainPageBackgroundBlockIndices && mainPageBackgroundBlockIndices.length > 0);

  const fullLyricsPanel = showLyrics ? (
    isLyricChordSheet
      ? <TimedLyricsChordsView tune={tune} tunebook={tunebook} hideChords={hideChordsInText} />
      : (plainLyricLines.length > 0
        ? <LyricsDisplayLines className="full-lyrics-panel" lines={plainLyricLines} />
        : <TimedLyricsChordsView tune={tune} tunebook={tunebook} hideChords={hideChordsInText} suppressLeadingTitle={true} />)
  ) : null;

  const backgroundInfoPanel = showInfo && (backgroundInfoText || infoOnlyFullPage) && includeBackgroundOnMainPage ? (
    renderBackgroundInfoBlocks(
      mainPageBackgroundBlockIndices,
      infoOnlyFullPage ? ' tune-background-info-view--full-page' : '',
      backgroundPageFontSizes[0] || PRINT_BACKGROUND_BASE_FONT_PX
    )
  ) : null;

  const lyricsBody = (isLyricChordSheet || showChordsAnnotate) ? (
    <TimedLyricsChordsView
      tune={tune}
      tunebook={tunebook}
      chordTranspose={printDisplayTranspose}
      hideChords={hideChordsInText}
      suppressLeadingTitle={true}
    />
  ) : fullLyricsPanel;

  const lyricsPanel = showLyrics ? (
    <div className="music-view-lyrics">
      {lyricsBody}
    </div>
  ) : null;

  const notationPanel = showNotation ? (
    <div className="music-view-notation print-pdf-notation-col" ref={notationColRef}>
      <div className="print-pdf-notation-paper music-notation-section">
        <div className="print-pdf-notation-render" ref={notationRef} />
      </div>
    </div>
  ) : null;

  const chordsBlockContent = showChordsBlockColumn ? (
    <TimedLyricsChordsView
      tune={tune}
      tunebook={tunebook}
      chordTranspose={printDisplayTranspose}
      chordsOnly={true}
      forceBlockLayout={true}
      suppressLeadingTitle={true}
      compact={!chordsBlockFullPage}
      zoom={chordsBlockFullPage ? 2.4 : undefined}
    />
  ) : null;
  const chordsBlockContentForFlow = showChordsBlockColumn ? (
    <TimedLyricsChordsView
      tune={tune}
      tunebook={tunebook}
      chordTranspose={printDisplayTranspose}
      chordsOnly={true}
      forceBlockLayout={true}
      suppressLeadingTitle={true}
      compact={true}
      zoom={0.95}
    />
  ) : null;

  const sideColumn = showSideColumn && !printLyricsBesideChords ? (
    <div
      className={'music-chords-block-col' + (chordsBlockFullPage ? ' music-chords-block-col--full-page' : '')}
      style={showChordsBlockColumn && showNotation ? {
        width: PRINT_CHORDS_COL_WIDTH_PX + 'px',
        minWidth: PRINT_CHORDS_COL_WIDTH_PX + 'px',
        maxWidth: PRINT_CHORDS_COL_WIDTH_PX + 'px',
        flex: '0 0 ' + PRINT_CHORDS_COL_WIDTH_PX + 'px',
      } : undefined}
    >
      {chordsBlockContent}
    </div>
  ) : null;

  const inlineStackedLyrics = printStackedLyrics
    && lyricsLayout.placement !== 'split'
    && lyricsLayout.placement !== 'none';
  const inlineLyricsOnly = printLyricsOnlyLayout
    && lyricsLayout.placement !== 'split'
    && lyricsLayout.placement !== 'none';
  const inlineLyricsBesideChords = printLyricsBesideChords
    && lyricsLayout.placement !== 'split'
    && lyricsLayout.placement !== 'none';

  const chordsLyricsFlowPanel = printLyricsBesideChords ? (
    <div
      className="print-pdf-chords-lyrics-flow print-pdf-view-split--lyrics-beside-chords"
      ref={chordsLyricsFlowRef}
      style={{ width: PRINT_INNER_WIDTH_PX + 'px' }}
    >
      <div className="print-pdf-lyrics-flow print-pdf-lyrics-flow--beside-chords">
        <div className="print-pdf-lyrics-anchor" ref={lyricsAnchorRef} />
        {inlineLyricsBesideChords ? (
          <PrintLyricsBlock
            blockRef={lyricsBlockRef}
            columnCount={1}
            fontSizePx={lyricsLayout.fontSizePx}
            className="print-pdf-lyrics-beside-chords"
          >
            {lyricsBody}
          </PrintLyricsBlock>
        ) : null}
      </div>
      <div className="music-chords-block-col print-pdf-chords-side">
        {chordsBlockContentForFlow}
      </div>
    </div>
  ) : null;

  const mainColumn = showNotation ? (
    <div
      className="music-view-main"
      style={showSideColumn ? {
        width: PRINT_NOTATION_COL_WIDTH_PX + 'px',
        minWidth: PRINT_NOTATION_COL_WIDTH_PX + 'px',
        maxWidth: PRINT_NOTATION_COL_WIDTH_PX + 'px',
        flex: '0 0 ' + PRINT_NOTATION_COL_WIDTH_PX + 'px',
      } : {
        width: PRINT_INNER_WIDTH_PX + 'px',
        minWidth: PRINT_INNER_WIDTH_PX + 'px',
        maxWidth: 'none',
        flex: '1 1 auto',
      }}
    >
      {notationPanel}
    </div>
  ) : null;

  const pageNumber = props.pageNumber;
  const pageCount = props.pageCount;
  const showCapoInHeader = !infoOnlyFullPage
    && (showNotation || showLyrics || showChordsBlockColumn);
  const printPageHeader = (
    <PrintPageHeader
      tune={tune}
      showComposer={!showNotation}
      showCapo={showCapoInHeader}
      useQR={useQR}
      useLink={useLink}
      qrRef={qrRef}
    />
  );
  const continuationPageHeader = (
    <PrintPageHeader
      tune={tune}
      showComposer={true}
      showCapo={showCapoInHeader}
    />
  );
  const backgroundContinuationPageHeader = (
    <PrintPageHeader
      tune={tune}
      showComposer={true}
      showCapo={false}
    />
  );
  const backgroundLayoutReady = backgroundPaginationReady;
  const printLayoutReady = (lyricsLayoutReady && backgroundLayoutReady) ? 'true' : 'false';
  const splitLyricsPage = (printStackedLyrics || printLyricsOnlyLayout)
    && lyricsLayout.status === 'ready'
    && lyricsLayout.placement === 'split';
  const backgroundMeasureHeader = (
    <PrintPageHeader
      tune={tune}
      showComposer={!showNotation}
      showCapo={false}
      useQR={infoOnlyFullPage && useQR}
      useLink={useLink}
    />
  );

  const mainPageInner = (
    <>
      {printPageHeader}
      {chordsLyricsFlowPanel}
      {(mainColumn || sideColumn) ? (
        <div
          className={'music-view-split print-pdf-view-split'
          + (sideColumn ? ' music-view-split--with-chords' : '')
          + (mainColumn ? '' : ' music-view-split--chords-only')
          + (printStackedLyrics ? ' print-pdf-view-split--stacked-lyrics' : '')}
          style={{ width: PRINT_INNER_WIDTH_PX + 'px' }}
        >
          {mainColumn}
          {sideColumn}
        </div>
      ) : null}
      {printLyricsOnlyLayout ? (
        <div className="print-pdf-lyrics-anchor" ref={lyricsAnchorRef} />
      ) : null}
      {printStackedLyrics ? (
        <div className="print-pdf-lyrics-anchor" ref={lyricsAnchorRef} />
      ) : null}
      {needsBackgroundPagination && !backgroundPaginationReady ? (
        <div className="print-pdf-bg-pagination-measure-host" aria-hidden="true">
          <div ref={bgHeaderMeasureRef}>
            {backgroundMeasureHeader}
          </div>
          <div ref={bgContinuationHeaderMeasureRef}>
            {continuationPageHeader}
          </div>
          {backgroundMarkdownBlocks.map(function(block, index) {
            return (
              <div
                key={'bg-block-measure-' + index}
                ref={function(el) { bgBlockMeasureRefs.current[index] = el; }}
                className={'tune-background-info-view print-pdf-bg-block-measure'
                  + (infoOnlyFullPage ? ' tune-background-info-view--full-page' : '')}
                style={{ width: PRINT_INNER_WIDTH_PX + 'px' }}
              >
                {renderPrintBackgroundMeasureBlock(block, 'bg-measure-' + index)}
              </div>
            );
          })}
        </div>
      ) : null}
      {needsLyricsLayoutMeasure ? (
        <div
          className="print-pdf-lyrics-measure-host"
          aria-hidden="true"
          style={{ width: lyricsProbeWidthPx + 'px' }}
        >
          {printLyricsBesideChords ? (
            <div
              className="print-pdf-chords-lyrics-flow print-pdf-chords-lyrics-flow--measure"
              ref={lyricsFlowProbeRef}
              style={{ width: PRINT_INNER_WIDTH_PX + 'px' }}
            >
              <div className="print-pdf-lyrics-flow print-pdf-lyrics-flow--beside-chords">
                <PrintLyricsBlock
                  blockRef={lyricsProbe1Ref}
                  columnCount={1}
                  fontSizePx={PRINT_LYRICS_BESIDE_CHORDS_BASE_FONT_PX}
                  compact={true}
                  className="print-pdf-lyrics-beside-chords"
                >
                  {lyricsBody}
                </PrintLyricsBlock>
              </div>
              <div className="music-chords-block-col print-pdf-chords-side">
                {chordsBlockContentForFlow}
              </div>
            </div>
          ) : null}
          <PrintLyricsBlock
            blockRef={lyricsProbe2Ref}
            columnCount={2}
            fontSizePx={PRINT_LYRICS_BASE_FONT_PX}
            compact={printLyricsBesideChords}
          >
            {lyricsBody}
          </PrintLyricsBlock>
          <PrintLyricsBlock
            blockRef={lyricsProbe3Ref}
            columnCount={3}
            fontSizePx={PRINT_LYRICS_BASE_FONT_PX}
            compact={printLyricsBesideChords}
          >
            {lyricsBody}
          </PrintLyricsBlock>
        </div>
      ) : null}
      {inlineLyricsOnly ? (
        <PrintLyricsBlock
          blockRef={lyricsBlockRef}
          columnCount={lyricsLayout.columns}
          fontSizePx={lyricsLayout.fontSizePx}
        >
          {lyricsBody}
        </PrintLyricsBlock>
      ) : null}
      {inlineStackedLyrics ? (
        <PrintLyricsBlock
          blockRef={lyricsBlockRef}
          columnCount={lyricsLayout.columns}
          fontSizePx={lyricsLayout.fontSizePx}
        >
          {lyricsBody}
        </PrintLyricsBlock>
      ) : null}
      {showInfo && backgroundInfoText && !infoOnlyFullPage ? (
        <div ref={bgDividerRef} className="print-pdf-bg-divider-anchor" aria-hidden="true" />
      ) : null}
      {backgroundInfoPanel ? (
        <div ref={bgBlockRef}>
          <hr className="music-page-divider" />
          {backgroundInfoPanel}
        </div>
      ) : null}
    </>
  );

  const pageFooter = (pageNumber > 0 && pageCount > 0) ? (
    <footer className="print-pdf-page-footer" aria-label={'Page ' + pageNumber + ' of ' + pageCount}>
      Page {pageNumber} of {pageCount}
    </footer>
  ) : null;

  const lyricsPage = splitLyricsPage ? (
    <div
      className="print-pdf-tune-page avoidbreak print-pdf-lyrics-page"
      ref={splitLyricsPageRef}
      data-tune-id={tune.id}
      data-print-lyrics-page="true"
      data-print-layout-ready={lyricsFitVerified ? 'true' : 'false'}
    >
      <div className="print-pdf-tune-body">
        <div className="print-pdf-tune-inner" style={{ width: PRINT_INNER_WIDTH_PX + 'px' }}>
          {continuationPageHeader}
          <div className="print-pdf-lyrics-anchor" ref={splitLyricsAnchorRef} />
          <PrintLyricsBlock
            blockRef={splitLyricsBlockRef}
            columnCount={lyricsLayout.columns}
            fontSizePx={lyricsLayout.fontSizePx}
          >
            {lyricsBody}
          </PrintLyricsBlock>
        </div>
      </div>
      {pageFooter}
    </div>
  ) : null;

  const mainPage = (
    <div
      className="print-pdf-tune-page avoidbreak"
      ref={pageRef}
      data-tune-id={tune.id}
      data-print-layout-ready={printLayoutReady}
    >
      <div className="print-pdf-tune-body">
        <div className="print-pdf-tune-inner" style={{ width: PRINT_INNER_WIDTH_PX + 'px' }}>
          {mainPageInner}
        </div>
      </div>
      {pageFooter}
    </div>
  );

  if (splitLyricsPage || paginatedBackgroundPages.length > 0) {
    return (
      <>
        {mainPage}
        {lyricsPage}
        {paginatedBackgroundPages.map(function(blockIndices, pageIndex) {
          const showBackgroundPageHeader = !infoOnlyFullPage && pageIndex === 0;
          return (
            <div
              key={'print-bg-page-' + tune.id + '-' + pageIndex}
              className="print-pdf-tune-page avoidbreak print-pdf-background-info-page"
              data-tune-id={tune.id}
              data-print-bg-page="true"
              data-print-layout-ready={backgroundPaginationReady ? 'true' : 'false'}
            >
              <div className="print-pdf-tune-body">
                <div className="print-pdf-tune-inner" style={{ width: PRINT_INNER_WIDTH_PX + 'px' }}>
                  {showBackgroundPageHeader ? backgroundContinuationPageHeader : null}
                  {renderBackgroundInfoBlocks(
                    blockIndices,
                    ' print-pdf-background-info-body',
                    getBackgroundContinuationPageFontSize(
                      backgroundPageFontSizes,
                      backgroundBlockPages,
                      pageIndex,
                      shouldBackgroundStartOnNewPage
                    )
                  )}
                </div>
              </div>
              {pageFooter}
            </div>
          );
        })}
      </>
    );
  }

  return mainPage;
}
