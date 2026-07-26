/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act, Simulate } from 'react-dom/test-utils'
import AddTuneSimpleForm from './AddTuneSimpleForm'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

jest.mock('./ComposerSearchButton', function() {
  const React = require('react')
  return function ComposerSearchButton(props) {
    if (typeof props.children === 'function') {
      return props.children({
        buttonGroup: React.createElement('button', {
          type: 'button',
          'data-testid': 'field-search-button',
          disabled: !!props.disabled,
        }, 'Search'),
        suggestionsDropdown: null,
        errorNode: null,
      })
    }
    return null
  }
})

jest.mock('./FieldVoiceFillButton', function() {
  return function FieldVoiceFillButton() { return null }
})

jest.mock('./BookSelectorModal', function() {
  return function BookSelectorModal() { return null }
})

jest.mock('./TagsSelectorModal', function() {
  return function TagsSelectorModal() { return null }
})

jest.mock('./AddTuneYouTubePicker', function() {
  const React = require('react')
  return function AddTuneYouTubePicker(props) {
    return React.createElement('div', {
      'data-testid': 'add-tune-youtube-block',
      'data-search-query': props.searchQuery || '',
      'data-search-nonce': String(props.searchNonce || 0),
    }, 'YouTube')
  }
})

jest.mock('../useMusicBrainzArtistOptions', function() {
  return function useMusicBrainzArtistOptions() { return { options: [], loading: false } }
})

jest.mock('../artistDiscographyClient', function() {
  return {
    fetchArtistDiscography: jest.fn(),
  }
})

jest.mock('../albumDiscographyClient', function() {
  return {
    fetchAlbumDiscography: jest.fn(),
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

const { fetchArtistDiscography } = require('../artistDiscographyClient')
const { fetchAlbumDiscography } = require('../albumDiscographyClient')
const { toast } = require('react-toastify')

describe('AddTuneSimpleForm', function() {
  let container
  let root

  beforeEach(function() {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    fetchArtistDiscography.mockReset()
    toast.success.mockReset()
    toast.info.mockReset()
    toast.error.mockReset()
  })

  afterEach(function() {
    act(function() { root.unmount() })
    container.remove()
  })

  test('shows Search and YouTube below books/tags layout', function() {
    act(function() {
      root.render(React.createElement(AddTuneSimpleForm, {
        values: { title: 'Song', artist: '' },
        tunes: {},
        candidateId: 'add-1',
        onChange: jest.fn(),
      }))
    })
    expect(container.querySelector('[data-testid="field-search-button"]').disabled).toBe(false)
    expect(container.querySelector('[data-testid="add-tune-youtube-block"]')).toBeTruthy()
    expect(container.querySelector('.add-tune-books-tags')).toBeTruthy()
    expect(container.querySelector('[data-testid="add-tune-files-block"]')).toBeNull()
    expect(container.querySelector('[data-testid="add-tune-media-block"]')).toBeNull()
  })

  test('shows Files and Audio blocks only when they have values', function() {
    act(function() {
      root.render(React.createElement(AddTuneSimpleForm, {
        values: {
          title: 'Song',
          tuneFiles: [{ id: 'f1', name: 'sheet.png', type: 'image/png' }],
          links: [{ link: 'recording:r1', title: 'Take', recordingId: 'r1' }],
        },
        tunes: {},
        candidateId: 'add-1',
        onChange: jest.fn(),
      }))
    })
    expect(container.querySelector('[data-testid="add-tune-files-block"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="add-tune-media-block"]')).toBeTruthy()
  })

  test('clicking a selected artist updates the YouTube search to that artist', function() {
    act(function() {
      root.render(React.createElement(AddTuneSimpleForm, {
        values: {
          title: 'Whiskey in the Jar',
          artist: 'Traditional',
          artists: ['The Dubliners', 'Metallica'],
        },
        tunes: {},
        candidateId: 'add-1',
        onChange: jest.fn(),
      }))
    })

    const chip = container.querySelector('[data-testid="chip-list-select-item"]')
    expect(chip).toBeTruthy()
    expect(chip.textContent).toBe('The Dubliners')

    act(function() {
      chip.click()
    })

    const youtube = container.querySelector('[data-testid="add-tune-youtube-block"]')
    expect(youtube.getAttribute('data-search-query')).toBe('Whiskey in the Jar The Dubliners')
    expect(Number(youtube.getAttribute('data-search-nonce'))).toBeGreaterThan(0)
  })

  test('discography button is disabled without composer', function() {
    act(function() {
      root.render(React.createElement(AddTuneSimpleForm, {
        values: { title: 'Song', artist: '' },
        tunes: {},
        candidateId: 'add-1',
        onChange: jest.fn(),
      }))
    })
    expect(container.querySelector('[data-testid="add-tune-discography"]').disabled).toBe(true)
  })

  test('discography lookup shows spinner and fills bulk import', async function() {
    let resolveLookup
    fetchArtistDiscography.mockReturnValue(new Promise(function(resolve) {
      resolveLookup = resolve
    }))
    const onFillBulkDiscography = jest.fn()

    act(function() {
      root.render(React.createElement(AddTuneSimpleForm, {
        values: { title: 'Song', artist: 'The Beatles' },
        tunes: {},
        candidateId: 'add-1',
        onChange: jest.fn(),
        onFillBulkDiscography: onFillBulkDiscography,
      }))
    })

    const button = container.querySelector('[data-testid="add-tune-discography"]')
    expect(button.disabled).toBe(false)

    await act(async function() {
      button.click()
    })
    expect(container.querySelector('[data-testid="add-tune-discography-progress"]')).toBeTruthy()

    await act(async function() {
      resolveLookup({
        artistName: 'The Beatles',
        artistMbid: 'mbid-1',
        titles: ['Yesterday', 'Let It Be'],
      })
      await Promise.resolve()
    })

    expect(onFillBulkDiscography).toHaveBeenCalledWith([
      'Yesterday by The Beatles',
      'Let It Be by The Beatles',
    ])
    expect(toast.success).toHaveBeenCalled()
    expect(button.querySelector('.spinner-border')).toBeNull()
  })

  test('album load tracks button loads tracks into bulk import', async function() {
    fetchAlbumDiscography.mockResolvedValue({
      albumName: 'Abbey Road',
      artistName: 'The Beatles',
      titles: ['Come Together', 'Something'],
    })
    const onFillBulkDiscography = jest.fn()

    act(function() {
      root.render(React.createElement(AddTuneSimpleForm, {
        values: { title: 'Song', artist: 'The Beatles' },
        tunes: {},
        candidateId: 'add-1',
        onChange: jest.fn(),
        onFillBulkDiscography: onFillBulkDiscography,
      }))
    })

    const albumInput = container.querySelector('[data-testid="add-tune-album"]')
    await act(async function() {
      Simulate.change(albumInput, { target: { value: 'Abbey Road' } })
    })

    const button = container.querySelector('[data-testid="add-tune-album-discography"]')
    expect(button.disabled).toBe(false)

    await act(async function() {
      button.click()
      await Promise.resolve()
    })

    expect(fetchAlbumDiscography).toHaveBeenCalledWith('Abbey Road', 'The Beatles', expect.any(Object))
    expect(onFillBulkDiscography).toHaveBeenCalledWith([
      'Come Together by The Beatles',
      'Something by The Beatles',
    ])
  })

  test('album load tracks opens picker when lookup is ambiguous', async function() {
    fetchAlbumDiscography.mockResolvedValue({
      needsPicker: true,
      candidates: [
        {
          label: 'Greatest Hits (1980)',
          albumName: 'Greatest Hits',
          artistName: 'Artist A',
          matchType: 'Album match',
          confidence: 'medium',
        },
        {
          label: 'Greatest Hits (1990)',
          albumName: 'Greatest Hits',
          artistName: 'Artist B',
          matchType: 'Album match',
          confidence: 'medium',
        },
      ],
      titles: [],
    })

    act(function() {
      root.render(React.createElement(AddTuneSimpleForm, {
        values: { title: 'Song' },
        tunes: {},
        candidateId: 'add-1',
        onChange: jest.fn(),
      }))
    })

    const albumInput = container.querySelector('[data-testid="add-tune-album"]')
    await act(async function() {
      Simulate.change(albumInput, { target: { value: 'Greatest Hits' } })
    })

    await act(async function() {
      container.querySelector('[data-testid="add-tune-album-discography"]').click()
      await Promise.resolve()
    })

    expect(fetchAlbumDiscography).toHaveBeenCalledWith('Greatest Hits', '', expect.any(Object))
    expect(document.body.textContent).toContain('Choose album')
    expect(document.body.textContent).toContain('Artist A')
    expect(document.body.textContent).toContain('Greatest Hits (1980)')
  })

  test('album discography button is disabled without album name', function() {
    act(function() {
      root.render(React.createElement(AddTuneSimpleForm, {
        values: { title: 'Song', artist: 'The Beatles' },
        tunes: {},
        candidateId: 'add-1',
        onChange: jest.fn(),
      }))
    })
    expect(container.querySelector('[data-testid="add-tune-album-discography"]').disabled).toBe(true)
  })
})
