/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import useIndexes from './useIndexes'
import { rebuildIndexesFromTunes } from './tuneIndexRebuilder'

global.IS_REACT_ACT_ENVIRONMENT = true

jest.mock('./tuneIndexStore', function() {
  return {
    INDEX_STORE_KEYS: {
      books: 'bookstorage_index_books',
      tags: 'bookstorage_index_tags',
      genres: 'bookstorage_index_genres',
      artists: 'bookstorage_index_artists',
      albums: 'bookstorage_index_albums',
      tagGroups: 'bookstorage_tag_groups',
      meta: 'bookstorage_index_meta',
    },
    loadAllIndexes: function() { return Promise.resolve({}) },
    saveIndexSlice: function() { return Promise.resolve() },
    saveAllIndexes: function() { return Promise.resolve() },
    invalidateIndexCache: function() {},
  }
})

jest.mock('./tuneIndexRebuilder', function() {
  const actual = jest.requireActual('./tuneIndexRebuilder')
  return Object.assign({}, actual, { rebuildIndexesFromTunes: jest.fn() })
})

describe('useIndexes', function() {
  let container
  let root
  let hook

  function Harness() {
    hook = useIndexes()
    return null
  }

  beforeEach(async function() {
    container = document.createElement('div')
    root = createRoot(container)
    // eslint-disable-next-line testing-library/no-unnecessary-act, testing-library/no-render-in-setup -- plain React root, not Testing Library
    await act(async function() { root.render(<Harness />) })
  })

  afterEach(function() {
    act(function() { root.unmount() })
  })

  test('replays tunes indexed while a full rebuild is running', async function() {
    const before = { a: { id: 'a', tags: ['old'] } }
    let finishRebuild
    rebuildIndexesFromTunes.mockImplementation(function() {
      return new Promise(function(resolve) {
        finishRebuild = function() { resolve({ books: {}, tags: { old: ['a'] } }) }
      })
    })

    let rebuild
    await act(async function() { rebuild = hook.reindexTunesAsync(before) })

    const imported = {
      a: { id: 'a', tags: ['old', 'andrew kordas'] },
      b: { id: 'b', tags: ['andrew kordas'] },
    }
    await act(async function() {
      hook.indexChangedTunes(imported, ['a', 'b'])
      hook.indexTune({ id: 'c', tags: ['andrew kordas'] })
    })
    expect(hook.getIndexBundle().tagIndex['andrew kordas']).toBeUndefined()

    await act(async function() {
      finishRebuild()
      await rebuild
    })

    expect(hook.getIndexBundle().tagIndex['andrew kordas'].sort()).toEqual(['a', 'b', 'c'])
    expect(hook.getIndexBundle().tagIndex.old).toEqual(['a'])
  })
})
