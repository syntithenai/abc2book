import {
  candidatesFromImportSource,
  classifyTextImport,
  isSheetImageImportFile,
  isSheetImageMimeOrName,
  SHEET_IMAGE_RESOLVER_ERROR,
} from './importSourceParse';

jest.mock('./sheetImageTranscriptionClient', function() {
  return {
    transcribeSheetImageFile: jest.fn(function() {
      return Promise.resolve({
        title: 'Sheet',
        artist: '',
        chordSheet: { text: '[C]hi' },
        melody: null,
        warnings: [],
      });
    }),
  };
});

jest.mock('./sheetImageImportUtils', function() {
  return {
    buildDraftFromSheetImageResult: function(result) {
      return {
        chordDraft: {
          title: result && result.title,
          composer: result && result.artist,
        },
        melodyAbc: '',
        warnings: [],
      };
    },
    createTuneFromSheetImageImport: jest.fn(function() {
      return { name: 'Sheet', voices: { '1': { meta: '', notes: [] } } };
    }),
  };
});

function baseOptions(overrides) {
  return Object.assign({
    tunebook: {
      abcTools: {
        abc2Tunebook: function() { return [{ name: 'A', books: [] }]; },
      },
    },
    abcjsParser: {},
    book: 'songs',
    accessToken: 'token',
    resolverAvailable: true,
  }, overrides || {});
}

describe('importSourceParse helpers', function() {
  test('classifyTextImport prefers notation for abc headers', function() {
    expect(classifyTextImport('X:1\nT:Hi\nK:C\nC2', 't.abc')).toBe('notation');
  });

  test('isSheetImageImportFile detects pdf files', function() {
    const file = new File(['%PDF'], 'chart.pdf', { type: 'application/pdf' });
    expect(isSheetImageImportFile(file)).toBe(true);
  });

  test('isSheetImageMimeOrName uses mime and extension', function() {
    expect(isSheetImageMimeOrName('scan.PDF', '')).toBe(true);
    expect(isSheetImageMimeOrName('doc.txt', 'text/plain')).toBe(false);
  });

  test('candidatesFromImportSource routes sheet image files to transcription', async function() {
    const file = new File(['img'], 'page.png', { type: 'image/png' });
    const candidates = await candidatesFromImportSource({ file: file, fileName: 'page.png' }, baseOptions());
    expect(candidates.length).toBe(1);
    expect(candidates[0].sourceKind).toBe('sheetimage');
  });

  test('candidatesFromImportSource rejects sheet images without resolver', async function() {
    const file = new File(['img'], 'page.png', { type: 'image/png' });
    await expect(
      candidatesFromImportSource({ file: file, fileName: 'page.png' }, baseOptions({ resolverAvailable: false }))
    ).rejects.toThrow(SHEET_IMAGE_RESOLVER_ERROR);
  });
});
