import {
  getPerformanceScrollRoot,
  isAtScrollBottom,
  isAtScrollTop,
  scrollPageStep,
  performScrollStep,
  isPerformanceContentAtBottom,
} from './performanceScrollUtils';
import { setActiveLyricsAutoscrollSession } from './lyricsAutoscrollUtils';

describe('performanceScrollUtils', function() {
  function makeRoot({ scrollTop, scrollHeight, clientHeight }) {
    return {
      element: {
        scrollTop: scrollTop,
        scrollHeight: scrollHeight,
        clientHeight: clientHeight,
        scrollBy: jest.fn(),
      },
      mode: 'element',
    };
  }

  test('detects top and bottom with threshold', function() {
    const top = makeRoot({ scrollTop: 0, scrollHeight: 1000, clientHeight: 400 });
    expect(isAtScrollTop(top, 8)).toBe(true);
    expect(isAtScrollBottom(top, 8)).toBe(false);

    const bottom = makeRoot({ scrollTop: 600, scrollHeight: 1000, clientHeight: 400 });
    expect(isAtScrollBottom(bottom, 8)).toBe(true);
    expect(isAtScrollTop(bottom, 8)).toBe(false);
  });

  test('scrollPageStep scrolls element by viewport fraction', function() {
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 800 });
    const el = {
      scrollTop: 100,
      scrollHeight: 2000,
      clientHeight: 500,
    };
    const root = { element: el, mode: 'element' };
    const moved = scrollPageStep(root, 1, 1, '.music-single');
    expect(moved).toBe(true);
    expect(el.scrollTop).toBe(900);
  });

  test('scrollPageStep nudges active lyrics autoscroll instead of smooth scrolling', function() {
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 800 });
    const nudgeByPixels = jest.fn();
    const root = makeRoot({ scrollTop: 100, scrollHeight: 2000, clientHeight: 500 });
    setActiveLyricsAutoscrollSession({
      nudgeByPixels: function(delta) {
        nudgeByPixels(delta);
        root.element.scrollTop += delta;
      },
    });
    const moved = scrollPageStep(root, 1, 1, '.music-single');
    expect(nudgeByPixels).toHaveBeenCalledWith(800);
    expect(moved).toBe(true);
    setActiveLyricsAutoscrollSession(null);
  });

  test('performScrollStep scrolls at top instead of jumping tunes', function() {
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 800 });
    const el = {
      scrollTop: 0,
      scrollHeight: 4000,
      clientHeight: 600,
    };
    const root = { element: el, mode: 'element' };
    const result = performScrollStep(root, 1, 1, 24, '.music-single');
    expect(result.moved).toBe(true);
    expect(result.atEdge).toBe(false);
    expect(el.scrollTop).toBe(800);
  });

  test('performScrollStep advances only when already at bottom', function() {
    const root = makeRoot({ scrollTop: 600, scrollHeight: 1000, clientHeight: 400 });
    const result = performScrollStep(root, 1, 1, 24);
    expect(result.atEdge).toBe(true);
    expect(result.edge).toBe('bottom');
  });

  test('performScrollStep scrolls when not at edge', function() {
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 500 });
    const el = {
      scrollTop: 100,
      scrollHeight: 2000,
      clientHeight: 500,
    };
    const root = { element: el, mode: 'element' };
    const result = performScrollStep(root, 1, 1, 24);
    expect(result.moved).toBe(true);
    expect(result.atEdge).toBe(false);
    expect(el.scrollTop).toBe(600);
  });

  test('getPerformanceScrollRoot uses gig lyrics column as scroll container', function() {
    const root = document.createElement('div');
    root.className = 'gig-mode-body';
    const lyricsCol = document.createElement('div');
    lyricsCol.className = 'gig-mode-lyrics-col';
    const lyrics = document.createElement('div');
    lyrics.className = 'timed-lyrics-chords-view';
    const line = document.createElement('div');
    line.className = 'lyrics-line';
    line.textContent = 'Hello';

    lyrics.appendChild(line);
    lyricsCol.appendChild(lyrics);
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
    jest.spyOn(lyricsCol, 'getBoundingClientRect').mockReturnValue({
      top: 100, bottom: 320, left: 0, right: 600, width: 600, height: 220,
    });
    jest.spyOn(lyrics, 'getBoundingClientRect').mockReturnValue({
      top: 110, bottom: 900, left: 0, right: 600, width: 600, height: 790,
    });
    jest.spyOn(line, 'getBoundingClientRect').mockReturnValue({
      top: 110, bottom: 130, left: 0, right: 600, width: 600, height: 20,
    });

    const scrollRoot = getPerformanceScrollRoot('.gig-mode-body');
    expect(scrollRoot.mode).toBe('element');
    expect(scrollRoot.element).toBe(lyricsCol);

    window.getComputedStyle.mockRestore();
    document.body.removeChild(root);
  });

  test('getPerformanceScrollRoot uses virtualized tune list scroll container', function() {
    const scrollEl = document.createElement('div');
    scrollEl.className = 'tune-list-scroll-root';
    Object.defineProperty(scrollEl, 'scrollTop', { configurable: true, writable: true, value: 0 });
    Object.defineProperty(scrollEl, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(scrollEl, 'clientHeight', { configurable: true, value: 400 });
    scrollEl.scrollBy = jest.fn();
    document.body.appendChild(scrollEl);

    const scrollRoot = getPerformanceScrollRoot('.music-single');
    expect(scrollRoot.mode).toBe('element');
    expect(scrollRoot.element).toBe(scrollEl);

    document.body.removeChild(scrollEl);
  });

  test('getPerformanceScrollRoot uses inner panel when page does not scroll', function() {
    const root = document.createElement('div');
    root.className = 'music-single';
    const lyricsCol = document.createElement('div');
    lyricsCol.className = 'music-and-lyrics-text';
    lyricsCol.style.overflowY = 'auto';
    Object.defineProperty(lyricsCol, 'scrollHeight', { configurable: true, value: 5000 });
    Object.defineProperty(lyricsCol, 'clientHeight', { configurable: true, value: 600 });
    Object.defineProperty(lyricsCol, 'scrollTop', { configurable: true, writable: true, value: 0 });
    root.appendChild(lyricsCol);
    document.body.appendChild(root);

    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 800 });
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 800 });

    jest.spyOn(window, 'getComputedStyle').mockImplementation(function(el) {
      if (el === lyricsCol) return { overflowY: 'auto' };
      return { overflowY: 'visible' };
    });

    const scrollRoot = getPerformanceScrollRoot('.music-single');
    expect(scrollRoot.mode).toBe('element');
    expect(scrollRoot.element).toBe(lyricsCol);

    window.getComputedStyle.mockRestore();
    document.body.removeChild(root);
  });

  test('isPerformanceContentAtBottom is true when tune content ends before document footer', function() {
    const root = document.createElement('div');
    root.className = 'music-single';
    const lyrics = document.createElement('div');
    lyrics.className = 'timed-lyrics-chords-view';
    root.appendChild(lyrics);
    const footer = document.createElement('div');
    footer.className = 'music-single-footer-meta';
    footer.textContent = 'Books and tags';
    root.appendChild(footer);
    document.body.appendChild(root);

    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 800 });
    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 400 });
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(document.documentElement, 'scrollTop', { configurable: true, writable: true, value: 400 });

    jest.spyOn(lyrics, 'getBoundingClientRect').mockReturnValue({
      top: 100, bottom: 700, left: 0, right: 600, width: 600, height: 600,
    });

    const scrollRoot = { element: null, mode: 'window' };
    expect(isAtScrollBottom(scrollRoot, 24)).toBe(false);
    expect(isPerformanceContentAtBottom('.music-single', scrollRoot, 24)).toBe(true);

    lyrics.getBoundingClientRect.mockRestore();
    document.body.removeChild(root);
  });
});

describe('performanceKeyBindings', function() {
  const {
    matchPerformanceAction,
    DEFAULT_PERFORMANCE_BINDINGS,
  } = require('./performanceKeyBindings');

  test('matches default pedal keys', function() {
    expect(matchPerformanceAction({ key: 'PageDown' }, DEFAULT_PERFORMANCE_BINDINGS)).toBe('scrollDown');
    expect(matchPerformanceAction({ key: 'PageUp' }, DEFAULT_PERFORMANCE_BINDINGS)).toBe('scrollUp');
    expect(matchPerformanceAction({ key: 'x' }, DEFAULT_PERFORMANCE_BINDINGS)).toBe(null);
  });

  test('matches custom stored bindings', function() {
    const custom = Object.assign({}, DEFAULT_PERFORMANCE_BINDINGS, {
      scrollDown: ['ArrowDown'],
      scrollUp: ['ArrowUp'],
    });
    expect(matchPerformanceAction({ key: 'ArrowDown' }, custom)).toBe('scrollDown');
    expect(matchPerformanceAction({ key: 'ArrowUp' }, custom)).toBe('scrollUp');
    expect(matchPerformanceAction({ key: 'Unidentified', code: 'PageDown' }, custom)).toBe(null);
    expect(matchPerformanceAction({ key: 'Unidentified', code: 'PageDown' }, Object.assign({}, DEFAULT_PERFORMANCE_BINDINGS, {
      scrollDown: ['PageDown', 'Unidentified'],
    }))).toBe('scrollDown');
  });
});
