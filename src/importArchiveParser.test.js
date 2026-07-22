import { isChordSheetMemberName, detectArchiveKind, isChordSheetZipArchive } from './importArchiveParser';

describe('importArchiveParser', function() {
  test('detectArchiveKind', function() {
    expect(detectArchiveKind('book.mscz')).toBe('mscz');
    expect(detectArchiveKind('lib.sbp')).toBe('sbp');
    expect(detectArchiveKind('lib.sbpbackup')).toBe('sbp');
    expect(detectArchiveKind('songs.onsongarchive')).toBe('onsongarchive');
    expect(detectArchiveKind('charts.zip')).toBe('zip');
  });

  test('isChordSheetMemberName', function() {
    expect(isChordSheetMemberName('songs/foo.cho')).toBe(true);
    expect(isChordSheetMemberName('songs/foo.chopro')).toBe(true);
    expect(isChordSheetMemberName('songs/foo.chordpro')).toBe(true);
    expect(isChordSheetMemberName('songs/foo.onsong')).toBe(true);
    expect(isChordSheetMemberName('__MACOSX/._foo.cho')).toBe(false);
    expect(isChordSheetMemberName('readme.md')).toBe(false);
  });

  test('isChordSheetZipArchive', function() {
    expect(isChordSheetZipArchive({ name: 'a.zip', type: 'application/zip' })).toBe(true);
    expect(isChordSheetZipArchive({ name: 'a.sbp' })).toBe(false);
  });
});
