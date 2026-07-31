import { toast } from 'react-toastify';
import { announceFootPedalOpeningTune } from './footPedalOpeningToast';

jest.mock('react-toastify', function() {
  return {
    toast: {
      info: jest.fn(),
    },
  };
});

describe('announceFootPedalOpeningTune', function() {
  beforeEach(function() {
    toast.info.mockClear();
  });

  test('shows Opening with the tune title', function() {
    announceFootPedalOpeningTune({ name: 'Wild Rover' });
    expect(toast.info).toHaveBeenCalledWith('Opening Wild Rover', { autoClose: 2200 });
  });

  test('ignores tunes without a title', function() {
    announceFootPedalOpeningTune({ name: '   ' });
    expect(toast.info).not.toHaveBeenCalled();
  });
});
