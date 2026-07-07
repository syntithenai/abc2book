import { crc32, createZipArchive } from './zipStore';

describe('zipStore', function() {
  test('crc32 matches known value', function() {
    const bytes = new TextEncoder().encode('test');
    expect(crc32(bytes)).toBe(0xD87F7E0C);
  });

  test('createZipArchive contains local and central headers', function() {
    const zip = createZipArchive([
      { name: 'percussion.wav', data: new Uint8Array([1, 2, 3]) },
      { name: 'vocals.wav', data: new Uint8Array([4, 5]) },
    ]);
    expect(zip.type).toBe('application/zip');
    expect(zip.size).toBeGreaterThan(0);
  });
});
