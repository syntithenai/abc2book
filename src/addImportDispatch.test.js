import {
  buildImportContext,
  classifyImportContent,
  normalizeImportInput,
} from './addImportDispatch';
import { buildSheetDraftFromResult } from './importSourceParse';
import {
  classifyTextImport,
  isSheetImageMimeOrName,
  looksLikeBulkListText,
  SHEET_IMAGE_RESOLVER_ERROR,
} from './importSourceParse';

jest.mock('./sheetImageTranscriptionClient', function() {
  return {
    __esModule: true,
    transcribeSheetImageFile: jest.fn(function() {
      return Promise.resolve({
        title: 'Photo Tune',
        artist: '',
        chordSheet: { text: '[C]hello' },
        melody: null,
        warnings: [],
      });
    }),
  };
});

jest.mock('./sheetImageImportUtils', function() {
  return {
    __esModule: true,
    buildDraftFromSheetImageResult: function(result) {
      return {
        chordDraft: {
          title: result && result.title,
          composer: result && result.artist,
          key: '',
          meter: '',
        },
        melodyAbc: result && result.melody && result.melody.abc ? result.melody.abc : '',
        warnings: [],
      };
    },
    createTuneFromSheetImageImport: jest.fn(function() {
      return { name: 'Photo Tune', voices: { '1': { meta: '', notes: [] } } };
    }),
  };
});

function mockTunebook() {
  return {
    abcTools: {
      abc2Tunebook: function(text) {
        return [{
          name: 'Imported',
          books: [],
          voices: { '1': { meta: '', notes: ['X:1', 'T:Imported', 'K:C', 'C2'] } },
        }];
      },
    },
  };
}

function mockContext(overrides) {
  return buildImportContext(Object.assign({
    resolverAvailable: true,
    token: { access_token: 'token' },
    tunebook: mockTunebook(),
    abcjsParser: {},
    book: 'songs',
  }, overrides || {}));
}

describe('addImportDispatch', function() {
  let dispatchAddImport;

  beforeEach(async function() {
    jest.resetModules();
    jest.doMock('./importSourceParse', function() {
      const actual = jest.requireActual('./importSourceParse');
      return Object.assign({}, actual, {
        transcribeSheetImageToResult: function() {
          return Promise.resolve({
            title: 'Photo Tune',
            artist: '',
            chordSheet: { text: '[C]hello' },
            melody: null,
            warnings: [],
          });
        },
      });
    });
    dispatchAddImport = (await import('./addImportDispatch')).dispatchAddImport;
  });
  test('normalizeImportInput accepts common shapes', function() {
    const file = new File(['abc'], 'tune.abc', { type: 'text/plain' });
    expect(normalizeImportInput(file).kind).toBe('file');
    expect(normalizeImportInput('hello').kind).toBe('text');
    expect(normalizeImportInput({ url: 'https://example.com/x.abc' }).kind).toBe('url');
    expect(normalizeImportInput({ text: 'X:1', fileName: 'a.abc' }).kind).toBe('source');
  });

  test('classifyTextImport detects url and abc', function() {
    expect(classifyTextImport('https://example.com/tune.abc', 'x.txt')).toBe('url');
    expect(classifyTextImport('X:1\nT:Hi\nK:C\nC2', 'tune.abc')).toBe('notation');
  });

  test('looksLikeBulkListText recognizes title lists', function() {
    const text = 'Wild Rover by The Dubliners\nWhiskey in the Jar by Dubliners';
    expect(looksLikeBulkListText(text)).toBe(true);
    expect(looksLikeBulkListText('X:1\nT:Hi\nK:C\nC2')).toBe(false);
  });

  test('isSheetImageMimeOrName detects pdf and images', function() {
    expect(isSheetImageMimeOrName('scan.pdf', 'application/pdf')).toBe(true);
    expect(isSheetImageMimeOrName('photo.jpg', 'image/jpeg')).toBe(true);
    expect(isSheetImageMimeOrName('icon.svg', 'image/svg+xml')).toBe(false);
  });

  test('dispatchAddImport parses pasted abc to review', async function() {
    const result = await dispatchAddImport('X:1\nT:Hi\nK:C\nC2', mockContext());
    expect(result.action).toBe('review');
    expect(result.candidates.length).toBe(1);
    expect(result.candidates[0].sourceKind).toBe('abc');
  });

  test('dispatchAddImport routes bulk textarea in bulk mode to review', async function() {
    const result = await dispatchAddImport('My Song by Me', mockContext({ bulkMode: true }));
    expect(result.action).toBe('review');
    expect(result.candidates[0].tune.name).toBe('My Song');
    expect(result.candidates[0].sourceKind).toBe('bulk-text');
  });

  test('dispatchAddImport returns audio action for mp3 files', async function() {
    const file = new File(['audio'], 'track.mp3', { type: 'audio/mpeg' });
    const result = await dispatchAddImport(file, mockContext());
    expect(result.action).toBe('audio');
    expect(result.files[0]).toBe(file);
  });

  test('dispatchAddImport blocks sheet images without resolver', async function() {
    const file = new File(['pdf'], 'sheet.pdf', { type: 'application/pdf' });
    const result = await dispatchAddImport(file, mockContext({ resolverAvailable: false }));
    expect(result.action).toBe('error');
    expect(result.needsResolver).toBe(true);
    expect(result.message).toBe(SHEET_IMAGE_RESOLVER_ERROR);
  });

  test('dispatchAddImport transcribes sheet images when resolver available', async function() {
    const file = new File(['img'], 'sheet.png', { type: 'image/png' });
    const result = await dispatchAddImport(file, mockContext({ resolverAvailable: true }));
    expect(result.action).toBe('review');
    expect(result.candidates[0].sourceKind).toBe('sheetimage');
    expect(result.candidates[0].skipEnrich).toBe(true);
  });

  test('buildSheetDraftFromResult maps transcription body to draft fields', function() {
    const draft = buildSheetDraftFromResult({
      title: 'Photo Tune',
      artist: '',
      chordSheet: { text: '[C]hello' },
      melody: null,
      warnings: [],
    }, 'sheet.png');
    expect(draft.title).toBe('Photo Tune');
    expect(draft.chordText).toBe('[C]hello');
    expect(draft.fileName).toBe('sheet.png');
  });

  test('dispatchAddImport sends sheet images to review even when stayOnForm is set', async function() {
    const file = new File(['img'], 'sheet.png', { type: 'image/png' });
    const result = await dispatchAddImport(file, mockContext({ resolverAvailable: true, stayOnForm: true }));
    expect(result.action).toBe('review');
    expect(result.candidates[0].sourceKind).toBe('sheetimage');
    expect(result.candidates[0].skipEnrich).toBe(true);
  });

  test('dispatchAddImport sends PDFs to review like other sheet images', async function() {
    const file = new File(['pdf'], 'Another Jig Will Do.pdf', { type: 'application/pdf' });
    const result = await dispatchAddImport(file, mockContext({ resolverAvailable: true, stayOnForm: true }));
    expect(result.action).toBe('review');
    expect(result.candidates[0].sourceKind).toBe('sheetimage');
  });

  test('dispatchAddImport returns error action when sheet image transcription finds nothing', async function() {
    jest.resetModules();
    jest.doMock('./importSourceParse', function() {
      const actual = jest.requireActual('./importSourceParse');
      return Object.assign({}, actual, {
        sheetImageFileToCandidates: function() {
          return Promise.reject(new Error(
            'No chords, lyrics, or melody were detected. Staff notation was found but melody recognition failed.'
          ));
        },
      });
    });
    const { dispatchAddImport: dispatchFresh } = await import('./addImportDispatch');
    const file = new File(['img'], 'staff.png', { type: 'image/png' });
    const result = await dispatchFresh(file, mockContext({ resolverAvailable: true }));
    expect(result.action).toBe('error');
    expect(result.message).toMatch(/melody recognition failed/i);
  });

  test('classifyImportContent marks audio files', function() {
    const file = new File(['audio'], 'track.wav', { type: 'audio/wav' });
    const payload = normalizeImportInput(file);
    expect(classifyImportContent(payload, mockContext())).toBe('audio');
  });
});
