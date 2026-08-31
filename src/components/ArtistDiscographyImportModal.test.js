/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act, Simulate } from 'react-dom/test-utils'
import ArtistDiscographyImportModal from './ArtistDiscographyImportModal'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

jest.mock('../artistAlbumDiscographyClient', function() {
  return {
    albumTypeCategory: jest.requireActual('../artistAlbumDiscographyClient').albumTypeCategory,
    filterAlbumsByTypeCategories: jest.requireActual('../artistAlbumDiscographyClient').filterAlbumsByTypeCategories,
    fetchArtistAlbumDiscography: jest.fn(),
    fetchArtistAlbumTracks: jest.fn(),
  }
})

jest.mock('react-toastify', function() {
  return {
    toast: {
      success: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
    },
  }
})

const {
  fetchArtistAlbumDiscography,
  fetchArtistAlbumTracks,
} = require('../artistAlbumDiscographyClient')
const { toast } = require('react-toastify')

describe('ArtistDiscographyImportModal', function() {
  let container
  let root

  beforeEach(function() {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    fetchArtistAlbumDiscography.mockReset()
    fetchArtistAlbumTracks.mockReset()
    toast.error.mockReset()
  })

  afterEach(function() {
    act(function() {
      root.unmount()
    })
    container.remove()
    jest.useRealTimers()
  })

  test('loads albums, expands tracks, imports album, highlights in-library', async function() {
    fetchArtistAlbumDiscography.mockResolvedValue({
      artistName: 'Dolly Parton',
      artistMbid: 'mbid-1',
      albums: [
        {
          releaseGroupId: 'rg-1',
          title: 'Jolene',
          year: '1974',
          primaryType: 'Album',
          secondaryTypes: [],
        },
        {
          releaseGroupId: 'rg-2',
          title: 'Jolene Single',
          year: '1973',
          primaryType: 'Single',
          secondaryTypes: [],
        },
      ],
    })
    fetchArtistAlbumTracks.mockResolvedValue({
      titles: ['Jolene', 'When Someone Wants To Leave'],
      albumName: 'Jolene',
      artistName: 'Dolly Parton',
    })
    const onImportLines = jest.fn()

    await act(async function() {
      root.render(React.createElement(ArtistDiscographyImportModal, {
        show: true,
        artist: 'Dolly Parton',
        tunes: {
          t1: { id: 't1', name: 'Jolene', composer: 'Dolly Parton' },
        },
        onHide: jest.fn(),
        onImportLines: onImportLines,
      }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(document.body.textContent).toContain('Jolene')
    expect(document.body.querySelectorAll('[data-testid="discography-import-album"]').length).toBe(1)
    expect(document.body.querySelector('[data-testid="discography-type-single"]')).toBeTruthy()

    const toggle = document.body.querySelector('[data-testid="discography-import-album-toggle"]')
    await act(async function() {
      toggle.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(fetchArtistAlbumTracks).toHaveBeenCalled()
    expect(document.body.querySelector('[data-testid="discography-import-tracks"]')).toBeTruthy()
    expect(document.body.querySelector('[data-testid="discography-in-library"]')).toBeTruthy()
    expect(document.body.textContent).toContain('When Someone Wants To Leave')

    await act(async function() {
      document.body.querySelector('[data-testid="discography-import-album-btn"]').click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onImportLines).toHaveBeenCalledWith([
      'Jolene by Dolly Parton',
      'When Someone Wants To Leave by Dolly Parton',
    ])
  })

  test('import selected uses checked tracks', async function() {
    fetchArtistAlbumDiscography.mockResolvedValue({
      artistName: 'Altan',
      artistMbid: 'mbid-1',
      albums: [{
        releaseGroupId: 'rg-1',
        title: 'The Gap',
        year: '1994',
        primaryType: 'Album',
        secondaryTypes: [],
      }],
    })
    fetchArtistAlbumTracks.mockResolvedValue({
      titles: ['Sally Gardens', 'Drowsy Maggie'],
      albumName: 'The Gap',
      artistName: 'Altan',
    })
    const onImportLines = jest.fn()

    await act(async function() {
      root.render(React.createElement(ArtistDiscographyImportModal, {
        show: true,
        artist: 'Altan',
        tunes: {},
        onHide: jest.fn(),
        onImportLines: onImportLines,
      }))
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async function() {
      document.body.querySelector('[data-testid="discography-import-album-toggle"]').click()
      await Promise.resolve()
      await Promise.resolve()
    })

    const checks = document.body.querySelectorAll('[data-testid="discography-import-track-check"]')
    expect(checks.length).toBe(2)
    await act(async function() {
      checks[0].click()
    })

    await act(async function() {
      document.body.querySelector('[data-testid="discography-import-selected"]').click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onImportLines).toHaveBeenCalledWith(['Sally Gardens by Altan'])
  })

  test('text filter matches album titles immediately', async function() {
    fetchArtistAlbumDiscography.mockResolvedValue({
      artistName: 'Dolly Parton',
      artistMbid: 'mbid-1',
      albums: [
        {
          releaseGroupId: 'rg-1',
          title: 'Coat of Many Colors',
          year: '1971',
          primaryType: 'Album',
          secondaryTypes: [],
        },
        {
          releaseGroupId: 'rg-2',
          title: 'Jolene',
          year: '1974',
          primaryType: 'Album',
          secondaryTypes: [],
        },
      ],
    })
    fetchArtistAlbumTracks.mockResolvedValue({ titles: [], albumName: '' })

    await act(async function() {
      root.render(React.createElement(ArtistDiscographyImportModal, {
        show: true,
        artist: 'Dolly Parton',
        tunes: {},
        onHide: jest.fn(),
        onImportLines: jest.fn(),
      }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(document.body.querySelectorAll('[data-testid="discography-import-album"]').length).toBe(2)

    const input = document.body.querySelector('[data-testid="discography-text-filter"]')
    await act(async function() {
      Simulate.change(input, { target: { value: 'jolene' } })
    })

    expect(input.value).toBe('jolene')
    expect(document.body.querySelectorAll('[data-testid="discography-import-album"]').length).toBe(1)
    expect(document.body.textContent).toContain('Jolene')
  })

  test('text filter matches songs and expands albums', async function() {
    fetchArtistAlbumDiscography.mockResolvedValue({
      artistName: 'Dolly Parton',
      artistMbid: 'mbid-1',
      albums: [
        {
          releaseGroupId: 'rg-1',
          title: 'Coat of Many Colors',
          year: '1971',
          primaryType: 'Album',
          secondaryTypes: [],
        },
        {
          releaseGroupId: 'rg-2',
          title: 'Heartbreaker',
          year: '1978',
          primaryType: 'Album',
          secondaryTypes: [],
        },
      ],
    })
    fetchArtistAlbumTracks.mockImplementation(function(album) {
      if (album.releaseGroupId === 'rg-1') {
        return Promise.resolve({
          titles: ['Coat of Many Colors', 'Traveling Man'],
          albumName: album.title,
        })
      }
      return Promise.resolve({
        titles: ['Heartbreaker', 'I Really Got the Feeling'],
        albumName: album.title,
      })
    })

    await act(async function() {
      root.render(React.createElement(ArtistDiscographyImportModal, {
        show: true,
        artist: 'Dolly Parton',
        tunes: {},
        onHide: jest.fn(),
        onImportLines: jest.fn(),
      }))
      await Promise.resolve()
      await Promise.resolve()
    })

    const input = document.body.querySelector('[data-testid="discography-text-filter"]')
    await act(async function() {
      Simulate.change(input, { target: { value: 'traveling' } })
    })
    await act(async function() {
      await new Promise(function(resolve) { setTimeout(resolve, 300) })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(document.body.querySelectorAll('[data-testid="discography-import-album"]').length).toBe(1)
    expect(document.body.querySelector('[data-testid="discography-import-tracks"]')).toBeTruthy()
    expect(document.body.textContent).toContain('Traveling Man')
    expect(document.body.textContent).toContain('Coat of Many Colors')
  })

  test('in library filter shows albums with library matches', async function() {
    fetchArtistAlbumDiscography.mockResolvedValue({
      artistName: 'Dolly Parton',
      artistMbid: 'mbid-1',
      albums: [
        {
          releaseGroupId: 'rg-1',
          title: 'Coat of Many Colors',
          year: '1971',
          primaryType: 'Album',
          secondaryTypes: [],
        },
        {
          releaseGroupId: 'rg-2',
          title: 'Heartbreaker',
          year: '1978',
          primaryType: 'Album',
          secondaryTypes: [],
        },
      ],
    })
    fetchArtistAlbumTracks.mockImplementation(function(album) {
      if (album.releaseGroupId === 'rg-1') {
        return Promise.resolve({
          titles: ['Coat of Many Colors', 'Traveling Man'],
          albumName: album.title,
        })
      }
      return Promise.resolve({
        titles: ['Heartbreaker', 'I Really Got the Feeling'],
        albumName: album.title,
      })
    })

    await act(async function() {
      root.render(React.createElement(ArtistDiscographyImportModal, {
        show: true,
        artist: 'Dolly Parton',
        tunes: {
          t1: { id: 't1', name: 'Traveling Man', composer: 'Dolly Parton' },
        },
        onHide: jest.fn(),
        onImportLines: jest.fn(),
      }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(document.body.querySelector('[data-testid="discography-library-filter"]')).toBeTruthy()
    expect(document.body.querySelectorAll('[data-testid="discography-import-album"]').length).toBe(2)

    await act(async function() {
      document.body.querySelector('[data-testid="discography-library-filter"]').click()
    })
    await act(async function() {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(document.body.querySelectorAll('[data-testid="discography-import-album"]').length).toBe(1)
    expect(document.body.querySelector('[data-testid="discography-import-tracks"]')).toBeTruthy()
    expect(document.body.textContent).toContain('Traveling Man')
    expect(document.body.textContent).toContain('In library')
  })

  test('MusicBrainz busy on track load shows error without blanking modal', async function() {
    fetchArtistAlbumDiscography.mockResolvedValue({
      artistName: 'Altan',
      artistMbid: 'mbid-1',
      albums: [{
        releaseGroupId: 'rg-1',
        title: 'The Gap',
        year: '1994',
        primaryType: 'Album',
        secondaryTypes: [],
      }],
    })
    const busyErr = new Error('MusicBrainz is busy — wait a moment and try again.')
    busyErr.code = 'MUSICBRAINZ_BUSY'
    fetchArtistAlbumTracks.mockRejectedValue(busyErr)

    await act(async function() {
      root.render(React.createElement(ArtistDiscographyImportModal, {
        show: true,
        artist: 'Altan',
        tunes: {},
        onHide: jest.fn(),
        onImportLines: jest.fn(),
      }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(document.body.querySelector('[data-testid="artist-discography-import-modal"]')).toBeTruthy()
    expect(document.body.querySelector('[data-testid="discography-import-progress"]')).toBeNull()

    await act(async function() {
      document.body.querySelector('[data-testid="discography-import-album-toggle"]').click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(document.body.textContent).toContain('MusicBrainz is busy')
    expect(toast.error).toHaveBeenCalled()
    expect(document.body.querySelector('[data-testid="artist-discography-import-modal"]')).toBeTruthy()
    expect(document.body.querySelector('.modal-header .btn-close')).toBeTruthy()
  })

  test('initial discography load failure clears busy overlay', async function() {
    const busyErr = new Error('MusicBrainz is busy — wait a moment and try again.')
    busyErr.code = 'MUSICBRAINZ_BUSY'
    fetchArtistAlbumDiscography.mockRejectedValue(busyErr)

    await act(async function() {
      root.render(React.createElement(ArtistDiscographyImportModal, {
        show: true,
        artist: 'Altan',
        tunes: {},
        onHide: jest.fn(),
        onImportLines: jest.fn(),
      }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(document.body.querySelector('[data-testid="discography-import-progress"]')).toBeNull()
    expect(document.body.textContent).toContain('MusicBrainz is busy')
  })
})
