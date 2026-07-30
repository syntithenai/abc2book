import { initFootPedalController, updateFootPedalController } from './footPedalController';
import { setPerformanceBindingKeys } from './performanceKeyBindings';

describe('footPedalController', function() {
  beforeEach(function() {
    localStorage.removeItem('bookstorage_performance_keys');
    updateFootPedalController({
      tunebook: null,
      navigate: null,
      mediaController: null,
      nowPlayingQueue: null,
      getPathname: function() { return '/tunes/abc'; },
    });
  });

  test('intercepts standard pedal keys on tune pages', function() {
    const navigate = jest.fn();
    const tunebook = {
      navigateToNextSong: jest.fn(),
      navigateToPreviousSong: jest.fn(),
    };
    initFootPedalController({
      tunebook: tunebook,
      navigate: navigate,
      getPathname: function() { return '/tunes/abc'; },
    });

    document.body.innerHTML = '<div class="music-single" style="height:2000px">Tune</div>';
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 3000 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 800 });
    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 0 });
    Object.defineProperty(document.documentElement, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 0,
    });
    Object.defineProperty(document, 'scrollingElement', {
      configurable: true,
      value: document.documentElement,
    });

    const event = new KeyboardEvent('keydown', {
      key: 'PageDown',
      code: 'PageDown',
      bubbles: true,
      cancelable: true,
    });
    const prevented = !window.dispatchEvent(event);
    expect(prevented).toBe(true);
  });

  test('uses custom mapped keys in addition to defaults', function() {
    setPerformanceBindingKeys('scrollDown', ['F13']);
    const navigate = jest.fn();
    const tunebook = {
      navigateToNextSong: jest.fn(),
      navigateToPreviousSong: jest.fn(),
    };
    initFootPedalController({
      tunebook: tunebook,
      navigate: navigate,
      getPathname: function() { return '/tunes'; },
    });

    document.body.innerHTML = '<div class="tune-list-scroll-root" style="height:200px;overflow:auto"><div style="height:2000px">List</div></div>';
    const listEl = document.querySelector('.tune-list-scroll-root');
    Object.defineProperty(listEl, 'clientHeight', { configurable: true, value: 200 });
    Object.defineProperty(listEl, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(listEl, 'scrollTop', { configurable: true, writable: true, value: 0 });

    const pageDown = new KeyboardEvent('keydown', {
      key: 'PageDown',
      code: 'PageDown',
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(pageDown);
    expect(listEl.scrollTop).toBeGreaterThan(100);
  });
});
