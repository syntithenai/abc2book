/**
 * Stable tune ids for playback router E2E parity tests.
 */
export const PLAYBACK_E2E_TUNE_IDS = {
  midi: 'e2e00000000000000000010',
  mp3: 'e2e00000000000000000011',
  youtube: 'e2e00000000000000000012',
  archive: 'e2e00000000000000000013',
  processed: 'e2e00000000000000000014',
  midifile: 'e2e00000000000000000015',
};

export const PLAYBACK_E2E_MIDI_ABC = `X:20
% abcbook-tune_id ${PLAYBACK_E2E_TUNE_IDS.midi}
T:Playback E2E MIDI
M:4/4
L:1/4
K:C
B:e2e-playback
C D E F |
`;

export const PLAYBACK_E2E_MP3_ABC = `X:21
% abcbook-tune_id ${PLAYBACK_E2E_TUNE_IDS.mp3}
T:Playback E2E MP3
M:4/4
L:1/4
K:C
B:e2e-playback
% abcbook-link-0 https://example.com/audio/e2e-test.mp3
% abcbook-link-title-0 E2E test audio
C D E F |
`;

export const PLAYBACK_E2E_YOUTUBE_ABC = `X:22
% abcbook-tune_id ${PLAYBACK_E2E_TUNE_IDS.youtube}
T:Playback E2E YouTube
M:4/4
L:1/4
K:C
B:e2e-playback
% abcbook-link-0 https://www.youtube.com/watch?v=dQw4w9WgXcQ
% abcbook-link-title-0 E2E YouTube
C D E F |
`;

export const PLAYBACK_E2E_ARCHIVE_ABC = `X:23
% abcbook-tune_id ${PLAYBACK_E2E_TUNE_IDS.archive}
T:Playback E2E Archive
M:4/4
L:1/4
K:C
B:e2e-playback
% abcbook-link-0 https://archive.org/details/e2e-test-item
% abcbook-link-title-0 E2E Archive
C D E F |
`;

export const PLAYBACK_E2E_PROCESSED_ABC = `X:24
% abcbook-tune_id ${PLAYBACK_E2E_TUNE_IDS.processed}
T:Playback E2E Processed
M:4/4
L:1/4
K:C
B:e2e-playback
% abcbook-tempo 120
% abcbook-pitch 2
% abcbook-link-0 https://example.com/audio/e2e-processed.mp3
% abcbook-link-title-0 E2E processed audio
C D E F |
`;

export const PLAYBACK_E2E_MIDIFILE_ABC = `X:25
% abcbook-tune_id ${PLAYBACK_E2E_TUNE_IDS.midifile}
T:Playback E2E MIDI file
M:4/4
L:1/4
K:C
B:e2e-playback
% abcbook-link-0 https://example.com/audio/e2e-test.mid
% abcbook-link-media-kind-0 midi
% abcbook-link-title-0 E2E MIDI file
C D E F |
`;

export const PLAYBACK_E2E_FULL_ABC = [
  PLAYBACK_E2E_MIDI_ABC,
  PLAYBACK_E2E_MP3_ABC,
  PLAYBACK_E2E_YOUTUBE_ABC,
  PLAYBACK_E2E_ARCHIVE_ABC,
  PLAYBACK_E2E_PROCESSED_ABC,
  PLAYBACK_E2E_MIDIFILE_ABC,
].join('\n');

export function playbackRouteUrl(base, tuneId, mode, linkIndex) {
  const root = String(base || 'http://localhost:3000').replace(/\/$/, '');
  if (mode === 'midi') {
    return root + '/#/tunes/' + encodeURIComponent(tuneId) + '/playMidi';
  }
  return root + '/#/tunes/' + encodeURIComponent(tuneId) + '/playMedia/' + String(linkIndex != null ? linkIndex : 0);
}
