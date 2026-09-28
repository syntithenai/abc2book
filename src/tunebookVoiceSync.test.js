import { compactTuneForVoice } from './tunebookVoiceSync';

describe('compactTuneForVoice', function() {
  test('keeps names, books, tags and fetchable links only', function() {
    const tune = {
      id: 't1', name: 'Blackbird', composer: 'Lennon', books: ['songs'], tags: ['charlotte setlist'],
      links: [
        { link: 'data:audio/mp3;base64,xx', title: 'inline' },
        { link: 'https://youtu.be/x', title: 'yt', startAt: 5, recordingId: 'r' },
      ],
      voices: { 1: { notes: ['abc'] } },
    };
    expect(compactTuneForVoice(tune)).toEqual({
      id: 't1', name: 'Blackbird', composer: 'Lennon', books: ['songs'], tags: ['charlotte setlist'],
      links: [{ link: 'https://youtu.be/x', title: 'yt', startAt: 5 }], hasNotes: true,
    });
  });

  test('skips tunes without an id or name', function() {
    expect(compactTuneForVoice({ id: 'x' })).toBeNull();
    expect(compactTuneForVoice(null)).toBeNull();
  });
});
