import { isSbpFile } from './sbpParse';

describe('sbpParse', function() {
  test('isSbpFile', function() {
    expect(isSbpFile({ name: 'library.sbp' })).toBe(true);
    expect(isSbpFile({ name: 'SongbookPro Backup.sbpbackup' })).toBe(true);
    expect(isSbpFile({ name: 'songs.zip' })).toBe(false);
  });
});
