jest.mock('localforage', function() {
  const stores = {}
  function createInstance(opts) {
    const name = opts && opts.name ? opts.name : 'default'
    if (!stores[name]) stores[name] = {}
    return {
      setItem: function(key, value) {
        if (!stores[name]) stores[name] = {}
        stores[name][key] = value
        return Promise.resolve(value)
      },
      getItem: function(key) {
        const bucket = stores[name] || {}
        return Promise.resolve(bucket[key] || null)
      },
      removeItem: function(key) {
        const bucket = stores[name] || {}
        delete bucket[key]
        return Promise.resolve()
      },
      clear: function() {
        stores[name] = {}
        return Promise.resolve()
      },
    }
  }
  return { createInstance: createInstance, __stores: stores }
})

jest.mock('./utilsFunctions', function() {
  const actualMod = jest.requireActual('./utilsFunctions')
  const actual = actualMod.default || actualMod
  return function utilsFunctions() {
    const utils = actual()
    return Object.assign({}, utils, {
      blobToBase64: function(blob) {
        if (!blob) return Promise.resolve()
        const type = blob.type || 'image/png'
        return Promise.resolve('data:' + type + ';base64,ZmFrZQ==')
      },
    })
  }
})

import localforage from 'localforage'
import useAbcTools from './useAbcTools'
import {
  shouldDefaultEmbedSnapshots,
  tunesHaveSnapshots,
  prepareTunesForAbcExport,
  hydrateEmbeddedTuneFileSnapshots,
} from './abcSnapshotEmbed'
import { getStoredTuneFile, saveStoredTuneFile } from './tuneFiles'

describe('abcSnapshotEmbed', function() {
  beforeEach(function() {
    const stores = localforage.__stores || {}
    Object.keys(stores).forEach(function(name) {
      stores[name] = {}
    })
  })

  test('shouldDefaultEmbedSnapshots is true when any tune has snapshots', function() {
    expect(shouldDefaultEmbedSnapshots([])).toBe(false)
    expect(shouldDefaultEmbedSnapshots([{ id: 'a', name: 'A' }])).toBe(false)
    expect(tunesHaveSnapshots([{ id: 'a', tuneFiles: [{ id: 'f1', name: 'x.png' }] }])).toBe(true)
    expect(shouldDefaultEmbedSnapshots([
      { id: 'a' },
      { id: 'b', tuneFiles: [{ id: 'f1', name: 'snap.png', type: 'image/png' }] },
    ])).toBe(true)
  })

  test('prepareTunesForAbcExport omits data when embedSnapshots is false', async function() {
    await saveStoredTuneFile({
      id: 'fileabc',
      data: 'data:image/png;base64,cG5n',
      type: 'image/png',
      name: 'Chart.png',
    })
    const tunes = [{
      id: 'tune123',
      name: 'Test',
      tuneFiles: [{ id: 'fileabc', name: 'Chart.png', type: 'image/png' }],
    }]
    const prepared = await prepareTunesForAbcExport(tunes, { embedSnapshots: false })
    expect(prepared[0].tuneFiles[0].data).toBeUndefined()
  })

  test('prepareTunesForAbcExport attaches base64 when embedSnapshots is true', async function() {
    await saveStoredTuneFile({
      id: 'fileabc',
      data: 'data:image/png;base64,cG5nLWJ5dGVz',
      type: 'image/png',
      name: 'Chart.png',
    })
    const tunes = [{
      id: 'tune123',
      name: 'Test',
      tuneFiles: [{ id: 'fileabc', name: 'Chart.png', type: 'image/png' }],
    }]
    const prepared = await prepareTunesForAbcExport(tunes, { embedSnapshots: true })
    expect(prepared[0].tuneFiles[0].data).toMatch(/^data:image\/png;base64,/)
  })

  test('json2abc embeds file-data when tuneFiles have data; abc2json restores onto tuneFiles', function() {
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
    expect(abc).toContain('% abcbook-file-id-0 fileabc')
    expect(abc).toContain('% abcbook-file-data-0 data:image/png;base64,YWJj')

    const parsed = tools.abc2json(abc)
    expect(parsed.tuneFiles).toHaveLength(1)
    expect(parsed.tuneFiles[0].id).toBe('fileabc')
    expect(parsed.tuneFiles[0].data).toBe('data:image/png;base64,YWJj')
    expect(parsed.files || []).toEqual([])
  })

  test('legacy file-data without tuneFiles id still lands on tune.files', function() {
    const tools = useAbcTools()
    const abc = [
      'X:1',
      'T:Legacy',
      'K:C',
      'C',
      '% abcbook-file-name-0 old.png',
      '% abcbook-file-type-0 image/png',
      '% abcbook-file-data-0 data:image/png;base64,b2xk',
    ].join('\n')
    const parsed = tools.abc2json(abc)
    expect(parsed.tuneFiles).toEqual([])
    expect(parsed.files[0].data).toBe('data:image/png;base64,b2xk')
  })

  test('hydrateEmbeddedTuneFileSnapshots stores blob and strips data from meta', async function() {
    const tune = {
      id: 'tune123',
      name: 'Test',
      tuneFiles: [{
        id: 'fileabc',
        name: 'Chart.png',
        type: 'image/png',
        source: 'import',
        data: 'data:image/png;base64,cG5n',
      }],
    }
    const hydrated = await hydrateEmbeddedTuneFileSnapshots(tune)
    expect(hydrated.tuneFiles[0].data).toBeUndefined()
    expect(hydrated.tuneFiles[0].id).toBe('fileabc')
    const stored = await getStoredTuneFile('fileabc')
    expect(stored).toBeTruthy()
    expect(stored.data).toBe('data:image/png;base64,cG5n')
    expect(stored.name).toBe('Chart.png')
  })
})
