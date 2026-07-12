import {
  helpPathForSection,
  helpSectionIdFromLink,
  scrollToHelpSection,
} from './helpNavigation';

describe('helpNavigation', function() {
  test('helpSectionIdFromLink extracts section ids', function() {
    expect(helpSectionIdFromLink('/help#edit-music')).toBe('edit-music');
    expect(helpSectionIdFromLink('#abc-notation')).toBe('abc-notation');
    expect(helpSectionIdFromLink('/help')).toBe('');
  });

  test('helpPathForSection builds hash paths', function() {
    expect(helpPathForSection('edit-music')).toBe('/help#edit-music');
    expect(helpPathForSection('#practise')).toBe('/help#practise');
    expect(helpPathForSection('')).toBe('/help');
  });

  test('scrollToHelpSection scrolls to an existing element', function() {
    const el = document.createElement('div');
    el.id = 'edit-music';
    document.body.appendChild(el);
    const originalScrollTo = window.scrollTo;
    window.scrollTo = jest.fn();

    expect(scrollToHelpSection('edit-music')).toBe(true);
    expect(window.scrollTo).toHaveBeenCalled();

    window.scrollTo = originalScrollTo;
    el.remove();
  });
});
