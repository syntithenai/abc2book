import {
  blobToImportFile,
  extensionForMime,
  readClipboardPasteEvent,
} from './clipboardImport';

describe('clipboardImport', function() {
  test('extensionForMime maps common import types', function() {
    expect(extensionForMime('image/png')).toBe('png');
    expect(extensionForMime('audio/mpeg')).toBe('mp3');
    expect(extensionForMime('application/pdf')).toBe('pdf');
    expect(extensionForMime('audio/unknown-format')).toBe('unknown-format');
  });

  test('blobToImportFile names images and audio distinctly', function() {
    const image = blobToImportFile(new Blob(['x'], { type: 'image/png' }), 'image/png', 1);
    expect(image.name).toBe('pasted-image-1.png');
    expect(image.type).toBe('image/png');

    const audio = blobToImportFile(new Blob(['x'], { type: 'audio/mpeg' }), 'audio/mpeg', 2);
    expect(audio.name).toBe('pasted-audio-2.mp3');
  });

  test('readClipboardPasteEvent returns files from clipboard items', function() {
    const file = new File(['abc'], 'tune.abc', { type: 'text/plain' });
    const event = {
      clipboardData: {
        items: [{
          kind: 'file',
          getAsFile: function() { return file; },
        }],
        getData: function() { return ''; },
      },
    };
    const result = readClipboardPasteEvent(event);
    expect(result.files).toEqual([file]);
    expect(result.text).toBe('');
  });

  test('readClipboardPasteEvent returns text when no files are present', function() {
    const event = {
      clipboardData: {
        items: [{
          kind: 'string',
          getAsFile: function() { return null; },
        }],
        getData: function(type) {
          return type === 'text/plain' ? 'X:1\nK:C\nC' : '';
        },
      },
    };
    const result = readClipboardPasteEvent(event);
    expect(result.files).toEqual([]);
    expect(result.text).toBe('X:1\nK:C\nC');
  });
});
