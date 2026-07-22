import { isMsczFile, isMscxFile } from './msczExtract';
import { isOnsongArchiveFile } from './onsongArchiveParse';
import { isIRealProHtmlFile } from './irealProParse';
import { isVideoImportFile, isAudioImportFile } from './audioFileMetadata';

describe('format detectors', function() {
  test('mscz / mscx / onsong / ireal file detectors', function() {
    expect(isMsczFile({ name: 'score.mscz' })).toBe(true);
    expect(isMscxFile({ name: 'score.mscx' })).toBe(true);
    expect(isOnsongArchiveFile({ name: 'library.onsongarchive' })).toBe(true);
    expect(isIRealProHtmlFile({ name: 'playlist.html' })).toBe(true);
    expect(isIRealProHtmlFile({ name: 'notes.txt' })).toBe(false);
  });

  test('video vs audio classification', function() {
    expect(isVideoImportFile({ name: 'clip.mp4', type: 'video/mp4' })).toBe(true);
    expect(isAudioImportFile({ name: 'clip.mp4', type: 'video/mp4' })).toBe(false);
    expect(isAudioImportFile({ name: 'song.mp3', type: 'audio/mpeg' })).toBe(true);
    expect(isVideoImportFile({ name: 'song.mp3', type: 'audio/mpeg' })).toBe(false);
  });
});
