import {
  LYRICS_AUTOSCROLL_COMPLETION_RATIO,
  LYRICS_AUTOSCROLL_DEFAULT_DURATION_SEC,
  LYRICS_SECONDS_PER_LINE,
  applyLyricsScrollPosition,
  applySpeedMultiplierToScrollState,
  computePixelsPerSecond,
  computeScrollProgress,
  countLyricLinesForScroll,
  getLyricLinesForAutoscroll,
  findScrollableContainer,
  getEffectiveMediaDurationSeconds,
  getLyricsAutoscrollDurationSeconds,
  findVisibleNotationElement,
  getLyricsScrollContext,
  getLyricsScrollMetrics,
  isNotationStackedAboveLyrics,
  interpolateScrollY,
  readLyricsScrollPosition,
  resyncAutoscrollToManualPosition,
  isAtLyricsScrollBottom,
  shouldStopAutoscrollAtBottom,
  LYRICS_AUTOSCROLL_BOTTOM_HOLD_MS,
  resolveLyricsScrollMediaDuration,
  stepSpeedMultiplier,
  clampSpeedMultiplier,
  getTuneLyricsScrollSpeed,
} from './lyricsAutoscrollUtils';

function mediaControllerWithElementDuration(duration) {
  return {
    duration: duration,
    playerRef: {
      current: {
        duration: duration,
      },
    },
    getPlaybackProgress: function() {
      return { duration: duration };
    },
    isMediaPlaybackRoute: function() { return true; },
    isMidiPlaybackRoute: function() { return false; },
  };
}

function mediaControllerWithMidiState(duration) {
  return {
    duration: duration,
    playerRef: { current: null },
    filteredPlayerRef: { current: null },
    ytPlayerRef: { current: null },
    getPlaybackProgress: function() { return { duration: duration }; },
    isMediaPlaybackRoute: function() { return true; },
    isMidiPlaybackRoute: function() { return false; },
  };
}

describe('lyricsAutoscrollUtils', function() {
  test('uses default duration when no media link or loaded media', function() {
    expect(getEffectiveMediaDurationSeconds({ links: [{}] }, {}, 0)).toBe(LYRICS_AUTOSCROLL_DEFAULT_DURATION_SEC);
    expect(getEffectiveMediaDurationSeconds(null, null, 0)).toBe(LYRICS_AUTOSCROLL_DEFAULT_DURATION_SEC);
    expect(resolveLyricsScrollMediaDuration({ links: [{}] }, mediaControllerWithMidiState(22), 0)).toBe(0);
  });

  test('uses loaded media element duration only', function() {
    const controller = mediaControllerWithElementDuration(240);
    expect(resolveLyricsScrollMediaDuration({ links: [{ url: 'x' }] }, controller, 0)).toBe(240);
    expect(getEffectiveMediaDurationSeconds({ links: [{ url: 'x' }] }, controller, 0)).toBe(240);
  });

  test('finishes autoscroll before full media duration', function() {
    const controller = mediaControllerWithElementDuration(240);
    const tune = { links: [{ url: 'x' }] };
    expect(getLyricsAutoscrollDurationSeconds(tune, controller, 0)).toBe(240 * LYRICS_AUTOSCROLL_COMPLETION_RATIO);
    expect(getLyricsAutoscrollDurationSeconds(tune, null, 0)).toBe(LYRICS_AUTOSCROLL_DEFAULT_DURATION_SEC);
  });

  test('ignores shared playback progress when media is not loaded', function() {
    const controller = mediaControllerWithMidiState(22);
    const tune = {
      links: [{ url: 'x' }],
      wLines: ['one', 'two', 'three'],
    };
    expect(getEffectiveMediaDurationSeconds(tune, controller, 0)).toBe(LYRICS_AUTOSCROLL_DEFAULT_DURATION_SEC);
  });

  test('uses lyric line count to set a slower minimum duration', function() {
    const shortTune = {
      wLines: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
    };
    expect(countLyricLinesForScroll(shortTune)).toBe(10);
    expect(getEffectiveMediaDurationSeconds(shortTune, null, 0)).toBe(LYRICS_AUTOSCROLL_DEFAULT_DURATION_SEC);

    const longTune = {
      wLines: Array.from({ length: 50 }, function(_, i) { return 'line ' + i; }),
    };
    expect(getEffectiveMediaDurationSeconds(longTune, null, 0)).toBe(50 * LYRICS_SECONDS_PER_LINE);
  });

  test('counts only the first lyric version before a separator row', function() {
    const tune = {
      wLines: [
        'Version one line 1',
        'Version one line 2',
        '--------------',
        'Version two line 1',
        'Version two line 2',
        'Version two line 3',
      ],
    };
    expect(getLyricLinesForAutoscroll(tune)).toEqual([
      'Version one line 1',
      'Version one line 2',
    ]);
    expect(countLyricLinesForScroll(tune)).toBe(2);
    expect(getEffectiveMediaDurationSeconds(tune, null, 0)).toBe(LYRICS_AUTOSCROLL_DEFAULT_DURATION_SEC);
  });

  test('uses region end minus start when both are set', function() {
    const tune = {
      links: [{
        playbackLoops: [{
          active: true,
          startAt: '1:00',
          endAt: '4:30',
        }],
      }],
    };
    const controller = mediaControllerWithElementDuration(600);
    expect(getEffectiveMediaDurationSeconds(tune, controller, 0)).toBe(210);
  });

  test('uses media duration minus start when only start is set', function() {
    const tune = {
      links: [{ startAt: '0:30' }],
    };
    const controller = mediaControllerWithElementDuration(180);
    expect(getEffectiveMediaDurationSeconds(tune, controller, 0)).toBe(150);
  });

  test('computes pixels per second with multiplier', function() {
    expect(computePixelsPerSecond(600, 120, 1)).toBe(5);
    expect(computePixelsPerSecond(600, 120, 2)).toBe(10);
    expect(computePixelsPerSecond(0, 120, 1)).toBe(0);
  });

  test('interpolates scroll position over time', function() {
    const state = { startTime: 1000, startY: 100, endY: 500, totalMs: 4000, speedMultiplier: 1 };
    expect(computeScrollProgress(1000, state)).toBe(0);
    expect(computeScrollProgress(3000, state)).toBe(0.5);
    expect(interpolateScrollY(state, 0.5)).toBe(300);
    expect(computeScrollProgress(5000, state)).toBe(1);
  });

  test('clamps and steps speed multiplier', function() {
    expect(clampSpeedMultiplier(10)).toBe(3);
    expect(clampSpeedMultiplier(0.05)).toBe(0.1);
    expect(stepSpeedMultiplier(1, 1)).toBeCloseTo(1.2);
    expect(stepSpeedMultiplier(1.2, -1)).toBeCloseTo(1);
  });

  test('reads saved lyrics scroll speed from tune', function() {
    expect(getTuneLyricsScrollSpeed(null)).toBe(1);
    expect(getTuneLyricsScrollSpeed({ lyricsScrollSpeed: 0.5 })).toBe(0.5);
    expect(getTuneLyricsScrollSpeed({ lyricsScrollSpeed: 9 })).toBe(3);
  });

  test('uses scrollable ancestor for nested lyrics containers', function() {
    const container = document.createElement('div');
    const lyrics = document.createElement('div');
    lyrics.className = 'timed-lyrics-chords-view';
    const line = document.createElement('div');
    line.className = 'lyrics-line';
    line.textContent = 'Hello';
    lyrics.appendChild(line);
    const separator = document.createElement('div');
    separator.className = 'lyrics-line';
    separator.textContent = '--------------';
    lyrics.appendChild(separator);
    const extra = document.createElement('div');
    extra.className = 'lyrics-line';
    extra.textContent = 'Other version';
    lyrics.appendChild(extra);
    container.appendChild(lyrics);
    document.body.appendChild(container);

    Object.defineProperty(container, 'scrollHeight', { configurable: true, value: 1200 });
    Object.defineProperty(container, 'clientHeight', { configurable: true, value: 400 });
  Object.defineProperty(container, 'scrollTop', { configurable: true, writable: true, value: 250 });
    container.style.overflowY = 'auto';

    jest.spyOn(window, 'getComputedStyle').mockImplementation(function(el) {
      if (el === container) {
        return { overflowY: 'auto' };
      }
      return { overflowY: 'visible' };
    });
    jest.spyOn(lyrics, 'getBoundingClientRect').mockReturnValue({
      top: 40,
      bottom: 500,
      width: 100,
      height: 460,
    });
    jest.spyOn(line, 'getBoundingClientRect').mockReturnValue({
      top: 40,
      bottom: 60,
      width: 100,
      height: 20,
    });
    jest.spyOn(separator, 'getBoundingClientRect').mockReturnValue({
      top: 80,
      bottom: 100,
      width: 100,
      height: 20,
    });
    jest.spyOn(extra, 'getBoundingClientRect').mockReturnValue({
      top: 120,
      bottom: 140,
      width: 100,
      height: 20,
    });
    jest.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      bottom: 400,
      width: 100,
      height: 400,
    });

    const context = getLyricsScrollContext(container);
    expect(context.mode).toBe('element');
    expect(context.scrollContainer).toBe(container);
    expect(context.lyricsRoot).toBe(lyrics);

    const metrics = getLyricsScrollMetrics(lyrics, context);
    expect(metrics.mode).toBe('element');
    expect(metrics.startY).toBe(290);
    expect(metrics.distance).toBeGreaterThanOrEqual(0);

    applyLyricsScrollPosition(metrics, metrics.startY);
    expect(container.scrollTop).toBe(290);

    window.getComputedStyle.mockRestore();
    document.body.removeChild(container);
  });

  test('detects notation stacked above lyrics', function() {
    const notation = document.createElement('div');
    notation.className = 'gig-mode-notation-col';
    const lyrics = document.createElement('div');
    lyrics.className = 'timed-lyrics-chords-view';
    document.body.appendChild(notation);
    document.body.appendChild(lyrics);

    jest.spyOn(notation, 'getBoundingClientRect').mockReturnValue({
      top: 80, bottom: 380, left: 0, right: 400, width: 400, height: 300,
    });
    jest.spyOn(lyrics, 'getBoundingClientRect').mockReturnValue({
      top: 400, bottom: 900, left: 0, right: 400, width: 400, height: 500,
    });

    expect(isNotationStackedAboveLyrics(notation, lyrics)).toBe(true);

    jest.spyOn(lyrics, 'getBoundingClientRect').mockReturnValue({
      top: 80, bottom: 900, left: 420, right: 820, width: 400, height: 820,
    });
    expect(isNotationStackedAboveLyrics(notation, lyrics)).toBe(false);

    notation.getBoundingClientRect.mockRestore();
    lyrics.getBoundingClientRect.mockRestore();
    document.body.removeChild(notation);
    document.body.removeChild(lyrics);
  });

  test('uses gig lyrics column when notation reduces its viewport', function() {
    const root = document.createElement('div');
    root.className = 'gig-mode-body';
    const notation = document.createElement('div');
    notation.className = 'gig-mode-notation-col';
    const lyricsCol = document.createElement('div');
    lyricsCol.className = 'gig-mode-lyrics-col';
    const lyrics = document.createElement('div');
    lyrics.className = 'timed-lyrics-chords-view';
    const line = document.createElement('div');
    line.className = 'lyrics-line';
    line.textContent = 'Hello';
    const line2 = document.createElement('div');
    line2.className = 'lyrics-line';
    line2.textContent = 'World';

    lyrics.appendChild(line);
    lyrics.appendChild(line2);
    lyricsCol.appendChild(lyrics);
    root.appendChild(notation);
    root.appendChild(lyricsCol);
    document.body.appendChild(root);

    Object.defineProperty(lyricsCol, 'scrollHeight', { configurable: true, value: 800 });
    Object.defineProperty(lyricsCol, 'clientHeight', { configurable: true, value: 220 });
    Object.defineProperty(lyricsCol, 'scrollTop', { configurable: true, writable: true, value: 0 });
    lyricsCol.style.overflowY = 'auto';

    jest.spyOn(window, 'getComputedStyle').mockImplementation(function(el) {
      if (el === lyricsCol) return { overflowY: 'auto' };
      return { overflowY: 'visible' };
    });
    jest.spyOn(notation, 'getBoundingClientRect').mockReturnValue({
      top: 60, bottom: 320, left: 0, right: 600, width: 600, height: 260,
    });
    jest.spyOn(lyricsCol, 'getBoundingClientRect').mockReturnValue({
      top: 330, bottom: 550, left: 0, right: 600, width: 600, height: 220,
    });
    jest.spyOn(lyrics, 'getBoundingClientRect').mockReturnValue({
      top: 340, bottom: 900, left: 0, right: 600, width: 600, height: 560,
    });
    jest.spyOn(line, 'getBoundingClientRect').mockReturnValue({
      top: 340, bottom: 360, left: 0, right: 600, width: 600, height: 20,
    });
    jest.spyOn(line2, 'getBoundingClientRect').mockReturnValue({
      top: 820, bottom: 840, left: 0, right: 600, width: 600, height: 20,
    });

    const context = getLyricsScrollContext(root);
    expect(context.mode).toBe('element');
    expect(context.scrollContainer).toBe(lyricsCol);
    expect(findVisibleNotationElement(root)).toBe(notation);

    const metrics = getLyricsScrollMetrics(lyrics, context, root);
    expect(metrics.mode).toBe('element');
    expect(metrics.distance).toBeGreaterThan(0);
    expect(metrics.distance).toBeLessThan(800);

    window.getComputedStyle.mockRestore();
    document.body.removeChild(root);
  });

  test('window scroll start accounts for stacked notation height', function() {
    const root = document.createElement('div');
    root.className = 'music-single';
    const notation = document.createElement('div');
    notation.className = 'music-and-lyrics-notation';
    const lyrics = document.createElement('div');
    lyrics.className = 'full-lyrics-panel';
    const line = document.createElement('div');
    line.className = 'lyrics-line';
    line.textContent = 'Verse one';

    lyrics.appendChild(line);
    root.appendChild(notation);
    root.appendChild(lyrics);
    document.body.appendChild(root);

    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 0 });
    jest.spyOn(notation, 'getBoundingClientRect').mockReturnValue({
      top: 70, bottom: 370, left: 0, right: 500, width: 500, height: 300,
    });
    jest.spyOn(lyrics, 'getBoundingClientRect').mockReturnValue({
      top: 380, bottom: 500, left: 0, right: 500, width: 500, height: 120,
    });
    jest.spyOn(line, 'getBoundingClientRect').mockReturnValue({
      top: 380, bottom: 400, left: 0, right: 500, width: 500, height: 20,
    });
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 2000 });

    const context = getLyricsScrollContext(root);
    const metrics = getLyricsScrollMetrics(lyrics, context, root);
    expect(metrics.mode).toBe('window');
    expect(metrics.startY).toBe(10);

    document.body.removeChild(root);
  });

  test('autoscrolls tall single-view notation when lyrics are hidden', function() {
    const root = document.createElement('div');
    root.className = 'music-single';
    const notation = document.createElement('div');
    notation.className = 'tune-panel-notation music-body-notation';
    const svgWrap = document.createElement('div');
    svgWrap.className = 'music-notation-section';
    notation.appendChild(svgWrap);
    root.appendChild(notation);
    document.body.appendChild(root);

    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 0 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 700 });
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 2200 });

    jest.spyOn(notation, 'getBoundingClientRect').mockReturnValue({
      top: 120, bottom: 1800, left: 0, right: 800, width: 800, height: 1680,
    });
    jest.spyOn(svgWrap, 'getBoundingClientRect').mockReturnValue({
      top: 120, bottom: 1800, left: 0, right: 800, width: 800, height: 1680,
    });

    expect(findVisibleNotationElement(root)).toBe(notation);

    const context = getLyricsScrollContext(root);
    expect(context.lyricsRoot).toBe(notation);
    expect(context.mode).toBe('window');

    const metrics = getLyricsScrollMetrics(notation, context, root);
    expect(metrics.mode).toBe('window');
    expect(metrics.distance).toBeGreaterThan(500);
    // Must not pin start to notation bottom (that made distance ~0 / "Fits on screen").
    expect(metrics.startY).toBeLessThan(200);

    document.body.removeChild(root);
  });

  test('autoscrolls fit-to-width file image by displayed height', function() {
    const {
      findAutoscrollContentRoot,
      findVisibleFilePanelElement,
    } = require('./lyricsAutoscrollUtils');
    const root = document.createElement('div');
    root.className = 'music-single';
    const filePanel = document.createElement('div');
    filePanel.className = 'tune-panel-file tune-file-fit-width';
    const img = document.createElement('img');
    img.className = 'tune-file-image';
    filePanel.appendChild(img);
    root.appendChild(filePanel);
    document.body.appendChild(root);

    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 0 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 700 });
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 2400 });

    jest.spyOn(filePanel, 'getBoundingClientRect').mockReturnValue({
      top: 100, bottom: 2100, left: 0, right: 800, width: 800, height: 2000,
    });
    jest.spyOn(img, 'getBoundingClientRect').mockReturnValue({
      top: 100, bottom: 2100, left: 0, right: 800, width: 800, height: 2000,
    });

    expect(findVisibleFilePanelElement(root)).toBe(filePanel);
    expect(findAutoscrollContentRoot(root)).toBe(filePanel);

    const context = getLyricsScrollContext(root);
    expect(context.lyricsRoot).toBe(filePanel);
    const metrics = getLyricsScrollMetrics(filePanel, context, root);
    expect(metrics.distance).toBeGreaterThan(500);

    document.body.removeChild(root);
  });

  test('persists lyrics scroll speed in abc for sync', function() {
    const useAbcTools = require('./useAbcTools').default;
    const abcTools = useAbcTools();
    const tune = {
      id: 'tune-scroll-speed',
      name: 'Scroll Speed Tune',
      key: 'C',
      lyricsScrollSpeed: 1.2,
      voices: { V: { notes: ['C2'] } },
    };
    const abc = abcTools.json2abc(tune);
    expect(abc).toContain('% abcbook-lyrics-scroll-speed 1.2');
    const parsed = abcTools.abc2json(abc);
    expect(parsed.lyricsScrollSpeed).toBeCloseTo(1.2);
  });

  test('reads scroll position from element and window modes', function() {
    const container = document.createElement('div');
    Object.defineProperty(container, 'scrollTop', { configurable: true, value: 120, writable: true });
    expect(readLyricsScrollPosition({ mode: 'element', scrollContainer: container })).toBe(120);

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 250 });
    Object.defineProperty(document.documentElement, 'scrollTop', { configurable: true, value: 250 });
    expect(readLyricsScrollPosition({ mode: 'window', scrollContainer: null })).toBe(250);
  });

  test('resyncs autoscroll timing after manual scroll adjustment', function() {
    const state = {
      startTime: 1000,
      startY: 100,
      endY: 500,
      totalMs: 4000,
      pixelsPerMs: 0.1,
    };
    const now = jest.spyOn(performance, 'now').mockReturnValue(3000);
    const result = resyncAutoscrollToManualPosition(state, 300);
    expect(result.atBottom).toBe(false);
    expect(state.startY).toBe(300);
    expect(state.startTime).toBe(3000);
    expect(state.totalMs).toBe(2000);
    now.mockRestore();
  });

  test('holds at bottom when manually scrolled past the end', function() {
    const state = {
      startTime: 1000,
      startY: 100,
      endY: 500,
      totalMs: 4000,
      pixelsPerMs: 0.1,
    };
    const result = resyncAutoscrollToManualPosition(state, 520);
    expect(result.atBottom).toBe(true);
    expect(state.startY).toBe(500);
    expect(state.totalMs).toBe(Number.POSITIVE_INFINITY);
  });

  test('applies speed changes to an in-progress scroll immediately', function() {
    const state = {
      startTime: 1000,
      startY: 100,
      endY: 500,
      totalMs: 4000,
      pixelsPerMs: 0.1,
      speedMultiplier: 1,
    };
    const now = jest.spyOn(performance, 'now').mockReturnValue(2500);
    const result = applySpeedMultiplierToScrollState(state, 2, 300);
    expect(result.applied).toBe(true);
    expect(result.atBottom).toBe(false);
    expect(state.speedMultiplier).toBe(2);
    expect(state.pixelsPerMs).toBeCloseTo(0.2);
    expect(state.startY).toBe(300);
    expect(state.startTime).toBe(2500);
    expect(state.totalMs).toBeCloseTo(1000);
    now.mockRestore();
  });

  test('detects bottom hold completion', function() {
    expect(shouldStopAutoscrollAtBottom(null, 5000, 1000)).toBe(false);
    expect(shouldStopAutoscrollAtBottom(4000, 4999, 1000)).toBe(false);
    expect(shouldStopAutoscrollAtBottom(4000, 5000, 1000)).toBe(true);
  });

  test('detects when scroll position is at lyrics end', function() {
    const state = { endY: 500 };
    expect(isAtLyricsScrollBottom(state, 500)).toBe(true);
    expect(isAtLyricsScrollBottom(state, 498)).toBe(true);
    expect(isAtLyricsScrollBottom(state, 490)).toBe(false);
  });

  test('lyrics+structure sync scrolls by lyrics height, not sticky structure', function() {
    const root = document.createElement('div');
    root.className = 'music-single';
    const host = document.createElement('div');
    host.className = 'tune-lyrics-structure-sync-host';
    const inner = document.createElement('div');
    inner.className = 'tune-lyrics-structure-sync-inner';
    const lyricsCol = document.createElement('div');
    lyricsCol.className = 'tune-lyrics-structure-sync-lyrics tune-panel-lyrics';
    const lyricsView = document.createElement('div');
    lyricsView.className = 'timed-lyrics-chords-view';
    const line1 = document.createElement('div');
    line1.className = 'lyrics-line';
    line1.textContent = 'Verse one';
    const line2 = document.createElement('div');
    line2.className = 'lyrics-line';
    line2.textContent = 'Verse two';
    lyricsView.appendChild(line1);
    lyricsView.appendChild(line2);
    lyricsCol.appendChild(lyricsView);
    const structureCol = document.createElement('div');
    structureCol.className = 'tune-lyrics-structure-sync-structure tune-panel-structure';
    const section = document.createElement('div');
    section.className = 'structure-section';
    section.textContent = 'A';
    structureCol.appendChild(section);
    inner.appendChild(lyricsCol);
    inner.appendChild(structureCol);
    host.appendChild(inner);
    root.appendChild(host);
    document.body.appendChild(root);

    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 0 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 700 });
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 2400 });

    jest.spyOn(host, 'getBoundingClientRect').mockReturnValue({
      top: 100, bottom: 2000, left: 0, right: 800, width: 800, height: 1900,
    });
    jest.spyOn(lyricsCol, 'getBoundingClientRect').mockReturnValue({
      top: 100, bottom: 2000, left: 0, right: 520, width: 520, height: 1900,
    });
    jest.spyOn(lyricsView, 'getBoundingClientRect').mockReturnValue({
      top: 100, bottom: 2000, left: 0, right: 520, width: 520, height: 1900,
    });
    jest.spyOn(line1, 'getBoundingClientRect').mockReturnValue({
      top: 100, bottom: 130, left: 0, right: 520, width: 520, height: 30,
    });
    jest.spyOn(line2, 'getBoundingClientRect').mockReturnValue({
      top: 1900, bottom: 1930, left: 0, right: 520, width: 520, height: 30,
    });
    // Sticky structure stays in the viewport — must not define scroll end.
    jest.spyOn(structureCol, 'getBoundingClientRect').mockReturnValue({
      top: 100, bottom: 700, left: 540, right: 800, width: 260, height: 600,
    });
    jest.spyOn(section, 'getBoundingClientRect').mockReturnValue({
      top: 120, bottom: 680, left: 540, right: 800, width: 260, height: 560,
    });

    const context = getLyricsScrollContext(root);
    expect(context.lyricsRoot).toBe(lyricsCol);
    expect(context.mode).toBe('window');

    const metrics = getLyricsScrollMetrics(context.lyricsRoot, context, root);
    expect(metrics.mode).toBe('window');
    expect(metrics.distance).toBeGreaterThan(1000);

    document.body.removeChild(root);
  });
});
