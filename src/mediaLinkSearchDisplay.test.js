import {
  isDeviceFileResult,
  isMusicCollectionResult,
  mediaSearchSourceLabel,
} from './mediaLinkSearchDisplay';

describe('mediaLinkSearchDisplay device source', function() {
  test('isDeviceFileResult identifies device-file candidates', function() {
    expect(isDeviceFileResult({ source: 'device-file' })).toBe(true);
    expect(isDeviceFileResult({ source: 'music-collection' })).toBe(false);
  });

  test('mediaSearchSourceLabel returns Device label', function() {
    expect(mediaSearchSourceLabel('device-file')).toBe('Device');
    expect(mediaSearchSourceLabel('music-collection')).toBe('My library');
  });

  test('isMusicCollectionResult still works', function() {
    expect(isMusicCollectionResult({ source: 'music-collection' })).toBe(true);
  });
});
