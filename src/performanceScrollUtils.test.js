import {
  getPerformanceScrollRoot,
  isAtScrollBottom,
  isAtScrollTop,
  scrollPageStep,
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
    const root = makeRoot({ scrollTop: 100, scrollHeight: 2000, clientHeight: 500 });
    scrollPageStep(root, 1, 0.8);
    expect(root.element.scrollBy).toHaveBeenCalledWith({ top: 400, behavior: 'smooth' });
  });

  test('scrollPageStep nudges active lyrics autoscroll instead of smooth scrolling', function() {
    const nudgeByPixels = jest.fn();
    setActiveLyricsAutoscrollSession({ nudgeByPixels: nudgeByPixels });
    const root = makeRoot({ scrollTop: 100, scrollHeight: 2000, clientHeight: 500 });
    scrollPageStep(root, 1, 0.8);
    expect(nudgeByPixels).toHaveBeenCalledWith(400);
    expect(root.element.scrollBy).not.toHaveBeenCalled();
    setActiveLyricsAutoscrollSession(null);
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
});

describe('performanceKeyBindings', function() {
  const {
    matchPerformanceAction,
    DEFAULT_PERFORMANCE_BINDINGS,
    GIG_PERFORMANCE_BINDINGS,
  } = require('./performanceKeyBindings');

  test('matches default pedal keys', function() {
    expect(matchPerformanceAction({ key: 'PageDown' }, DEFAULT_PERFORMANCE_BINDINGS)).toBe('scrollDown');
    expect(matchPerformanceAction({ key: 'PageUp' }, DEFAULT_PERFORMANCE_BINDINGS)).toBe('scrollUp');
    expect(matchPerformanceAction({ key: 'x' }, DEFAULT_PERFORMANCE_BINDINGS)).toBe(null);
  });

  test('matches gig arrow keys', function() {
    expect(matchPerformanceAction({ key: 'ArrowRight' }, GIG_PERFORMANCE_BINDINGS)).toBe('nextTune');
    expect(matchPerformanceAction({ key: 'ArrowLeft' }, GIG_PERFORMANCE_BINDINGS)).toBe('previousTune');
    expect(matchPerformanceAction({ key: 'ArrowDown' }, GIG_PERFORMANCE_BINDINGS)).toBe('scrollDown');
    expect(matchPerformanceAction({ key: 'ArrowUp' }, GIG_PERFORMANCE_BINDINGS)).toBe('scrollUp');
  });
});
