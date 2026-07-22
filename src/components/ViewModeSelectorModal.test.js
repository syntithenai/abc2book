import { canShowFitHeightButton } from './ViewModeSelectorModal';

describe('canShowFitHeightButton', function() {
  test('hides fit height control during file snapshot overlay', function() {
    expect(canShowFitHeightButton({ notation: 'on', lyrics: false, structure: false }, {
      fileOverlayActive: true,
    })).toBe(false);
  });

  test('shows fit height control for notation when overlay is off', function() {
    expect(canShowFitHeightButton({ notation: 'on', lyrics: false, structure: false }, {
      fileOverlayActive: false,
    })).toBe(true);
  });
});
