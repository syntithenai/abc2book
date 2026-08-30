import useAbcTools from './useAbcTools'

describe('tuneFiles ABC round-trip', function() {
  test('json2abc and abc2json preserve tuneFiles metadata without blob data', function() {
    const tools = useAbcTools()
    const tune = {
      id: 'tune123',
      name: 'Test Tune',
      voices: { '1': { meta: '', notes: ['C'] } },
      books: [],
      tempo: 100,
      boost: 0,
      tuneFiles: [{
        id: 'fileabc',
        name: 'Chart.png',
        type: 'image/png',
        googleId: 'drive999',
        source: 'capture',
        pdfPage: 2,
      }],
      activeFile: 'fileabc',
    }
    const abc = tools.json2abc(tune)
    expect(abc).toContain('% abcbook-file-id-0 fileabc')
    expect(abc).toContain('% abcbook-file-name-0 Chart.png')
    expect(abc).toContain('% abcbook-file-type-0 image/png')
    expect(abc).toContain('% abcbook-file-google-id-0 drive999')
    expect(abc).toContain('% abcbook-file-source-0 capture')
    expect(abc).toContain('% abcbook-file-pdf-page-0 2')
    expect(abc).toContain('% abcbook-active-file fileabc')
    expect(abc).not.toContain('% abcbook-file-data-')

    const parsed = tools.abc2json(abc)
    expect(parsed.tuneFiles).toHaveLength(1)
    expect(parsed.tuneFiles[0].id).toBe('fileabc')
    expect(parsed.tuneFiles[0].name).toBe('Chart.png')
    expect(parsed.tuneFiles[0].googleId).toBe('drive999')
    expect(parsed.tuneFiles[0].source).toBe('capture')
    expect(parsed.tuneFiles[0].pdfPage).toBe(2)
    expect(parsed.activeFile).toBe('fileabc')
  })

  test('json2abc includes file-data when present on tuneFiles', function() {
    const tools = useAbcTools()
    const tune = {
      id: 'tune123',
      name: 'Test Tune',
      voices: { '1': { meta: '', notes: ['C'] } },
      books: [],
      tempo: 100,
      boost: 0,
      tuneFiles: [{
        id: 'fileabc',
        name: 'Chart.png',
        type: 'image/png',
        source: 'capture',
        data: 'data:image/png;base64,YWJj',
      }],
      activeFile: 'fileabc',
    }
    const abc = tools.json2abc(tune)
    expect(abc).toContain('% abcbook-file-data-0 data:image/png;base64,YWJj')
  })
})
