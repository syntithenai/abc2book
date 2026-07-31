import { linkUriFromValue, linkUriString } from './tuneLinkUri';
import { RECORDING_LINK_PREFIX } from './linkRecording';

describe('tuneLinkUri', function() {
  test('linkUriFromValue normalizes strings, nested objects, and primitives', function() {
    expect(linkUriFromValue('https://example.com/a.mp3')).toBe('https://example.com/a.mp3');
    expect(linkUriFromValue({
      link: RECORDING_LINK_PREFIX + 'rec1',
      recordingId: 'rec1',
    })).toBe(RECORDING_LINK_PREFIX + 'rec1');
    expect(linkUriFromValue(42)).toBe('42');
    expect(linkUriFromValue(null)).toBe('');
    expect(linkUriFromValue(undefined)).toBe('');
  });

  test('linkUriString reads from tune link objects', function() {
    expect(linkUriString({
      link: 'https://youtu.be/abc',
      title: 'Y',
    })).toBe('https://youtu.be/abc');
    expect(linkUriString({
      link: { link: RECORDING_LINK_PREFIX + 'rec2', recordingId: 'rec2' },
      title: 'Nested',
    })).toBe(RECORDING_LINK_PREFIX + 'rec2');
    expect(linkUriString(null)).toBe('');
  });
});
