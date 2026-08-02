jest.mock('react-toastify', function() {
  return {
    toast: { error: jest.fn(), success: jest.fn() },
  }
})

jest.mock('./scratchpadExportToast', function() {
  return {
    showScratchpadExportToast: jest.fn(),
    scratchpadItemPath: function(id) { return '/scratchpad/' + id },
  }
})

import {
  createWorkspace,
  getScratchpadItem,
} from './scratchpadStore'
import {
  exportTuneToScratchpadComposition,
  guessCompositionPairingsFromStructure,
  chordSectionLabelText,
} from './exportTuneToScratchpadComposition'
import { mergeScratchpadCompositionIntoTune } from './scratchpadAssociate'
import { generateCompositionChunkId } from './scratchpadCompositionChordImport'
import { getPlainLyricLines } from './wLinesUtils'
import { resolvePrimaryVoiceKey } from './abcVoiceUtils'

const WORKSPACES_KEY = 'bookstorage_scratchpad_workspaces'
const ITEMS_KEY = 'bookstorage_scratchpad_items'
const ACTIVE_WORKSPACE_KEY = 'bookstorage_scratchpad_active_workspace'

beforeEach(function() {
  localStorage.removeItem(WORKSPACES_KEY)
  localStorage.removeItem(ITEMS_KEY)
  localStorage.removeItem(ACTIVE_WORKSPACE_KEY)
})

function compactNotes(text) {
  return String(text || '').replace(/\s+/g, '')
}

function primaryVoiceNotes(tune) {
  if (!tune || !tune.voices) return ''
  const key = resolvePrimaryVoiceKey(tune.voices)
  const voice = tune.voices[key]
  return voice && Array.isArray(voice.notes) ? voice.notes.join(' ') : ''
}

function compactLyrics(tune) {
  return getPlainLyricLines(tune)
    .map(function(line) { return String(line || '').trim() })
    .filter(Boolean)
    .join('\n')
}

describe('guessCompositionPairingsFromStructure', function() {
  test('chordSectionLabelText reads persisted label objects', function() {
    expect(chordSectionLabelText('Verse')).toBe('Verse')
    expect(chordSectionLabelText({
      header: '[Chorus]',
      title: 'Chorus',
      type: 'chorus',
    })).toBe('Chorus')
    expect(chordSectionLabelText({ header: '# Bridge', title: '', type: 'bridge' })).toBe('Bridge')
  })

  test('pairs by section type when chord section labels match', function() {
    const lyricsChunks = [
      { id: 'l1', label: 'Verse', order: 0, sectionIndex: 0 },
      { id: 'l2', label: 'Chorus', order: 1, sectionIndex: 1 },
    ]
    const notationChunks = [
      { id: 'n1', label: 'Chorus', order: 0, strainIndex: 1 },
      { id: 'n2', label: 'Verse', order: 1, strainIndex: 0 },
    ]
    const pairings = guessCompositionPairingsFromStructure(lyricsChunks, notationChunks, {
      lyricSections: [
        { header: '[Verse]', lines: ['v'], title: 'Verse', type: 'verse' },
        { header: '[Chorus]', lines: ['c'], title: 'Chorus', type: 'chorus' },
      ],
      strains: [{ index: 0 }, { index: 1 }],
      chordSectionLabels: ['Verse', 'Chorus'],
    })
    const byLyrics = {}
    pairings.forEach(function(pair) {
      if (pair.lyricsChunkId) byLyrics[pair.lyricsChunkId] = pair.notationChunkId
    })
    expect(byLyrics.l1).toBe('n2')
    expect(byLyrics.l2).toBe('n1')
  })

  test('falls back to positional pairing when titles differ', function() {
    const lyricsChunks = [
      { id: 'l1', label: 'Section 1', order: 0, sectionIndex: 0 },
      { id: 'l2', label: 'Section 2', order: 1, sectionIndex: 1 },
      { id: 'l3', label: 'Section 3', order: 2, sectionIndex: 2 },
    ]
    const notationChunks = [
      { id: 'n1', label: 'Strain 1', order: 0, strainIndex: 0 },
      { id: 'n2', label: 'Strain 2', order: 1, strainIndex: 1 },
    ]
    const pairings = guessCompositionPairingsFromStructure(lyricsChunks, notationChunks, {
      lyricSections: [
        { header: '', lines: ['a'], title: 'Section 1' },
        { header: '', lines: ['b'], title: 'Section 2' },
        { header: '', lines: ['c'], title: 'Section 3' },
      ],
      strains: [{ index: 0 }, { index: 1 }],
    })
    expect(pairings.length).toBe(3)
    expect(pairings[0].lyricsChunkId).toBe('l1')
    expect(pairings[0].notationChunkId).toBe('n1')
    expect(pairings[1].lyricsChunkId).toBe('l2')
    expect(pairings[1].notationChunkId).toBe('n2')
    expect(pairings[2].lyricsChunkId).toBe('l3')
    expect(pairings[2].notationChunkId).toBeNull()
  })
})

describe('exportTuneToScratchpadComposition', function() {
  test('creates lyrics-only composition', async function() {
    const ws = createWorkspace('Export')
    const tune = {
      id: 't-lyrics',
      name: 'Lyrics Tune',
      words: ['Hello', 'world'],
      voices: { 1: { notes: [], meta: {} } },
    }
    const item = await exportTuneToScratchpadComposition({
      tune: tune,
      workspaceId: ws.id,
    })
    expect(item.type).toBe('composition')
    expect(item.linkedTuneId).toBe('t-lyrics')
    expect(item.composition.lyricsChunks.length).toBe(1)
    expect(item.composition.notationChunks.length).toBe(0)
    expect(item.composition.lyricsChunks[0].wholeItem).toBe(true)
  })

  test('creates notation-only composition', async function() {
    const ws = createWorkspace('Export')
    const tune = {
      id: 't-notes',
      name: 'Notes Tune',
      meter: '4/4',
      key: 'C',
      noteLength: '1/8',
      voices: { 1: { notes: ['C D E F | G A B c |'], meta: {} } },
    }
    const item = await exportTuneToScratchpadComposition({
      tune: tune,
      workspaceId: ws.id,
    })
    expect(item.composition.notationChunks.length).toBe(1)
    expect(item.composition.lyricsChunks.length).toBe(0)
    expect(item.composition.notationChunks[0].wholeItem).toBe(true)
  })

  test('creates per-section and per-strain chunks for multi-section tune', async function() {
    const ws = createWorkspace('Export')
    const tune = {
      id: 't-multi',
      name: 'Multi',
      meter: '4/4',
      key: 'C',
      noteLength: '1/8',
      words: ['[Verse]', 'Line one', '', '[Chorus]', 'Chorus line'],
      chordSectionLabels: [
        { header: '[Verse]', title: 'Verse', type: 'verse' },
        { header: '[Chorus]', title: 'Chorus', type: 'chorus' },
      ],
      voices: {
        1: { notes: ['C D E F | G A B c || d e f g | a b c\' d |'], meta: {} },
      },
    }
    const item = await exportTuneToScratchpadComposition({
      tune: tune,
      workspaceId: ws.id,
    })
    expect(item.composition.lyricsChunks.length).toBe(2)
    expect(item.composition.notationChunks.length).toBe(2)
    expect(item.composition.notationChunks[0].label).toBe('Verse')
    expect(item.composition.notationChunks[1].label).toBe('Chorus')
    expect(item.composition.notationChunks[0].label).not.toContain('[object Object]')
    expect(item.composition.pairings.length).toBe(2)
    const textSourceIds = item.composition.lyricsChunks.map(function(chunk) {
      return chunk.sourceItemId
    })
    const notationSourceIds = item.composition.notationChunks.map(function(chunk) {
      return chunk.sourceItemId
    })
    expect(new Set(textSourceIds).size).toBe(1)
    expect(new Set(notationSourceIds).size).toBe(1)
  })

  test('round-trip export assemble associate preserves notation and lyrics', async function() {
    const ws = createWorkspace('RoundTrip')
    const original = {
      id: 't-round',
      name: 'Round Trip',
      meter: '4/4',
      key: 'C',
      noteLength: '1/8',
      books: ['book-a'],
      links: [{ title: 'link', link: 'https://example.com' }],
      words: ['[Verse]', 'Sing verse', '', '[Chorus]', 'Sing chorus'],
      chordSectionLabels: ['Verse', 'Chorus'],
      voices: {
        1: { notes: ['C D E F | G A B c || d e f g | a b c\' d |'], meta: {} },
      },
    }
    const item = await exportTuneToScratchpadComposition({
      tune: original,
      workspaceId: ws.id,
    })
    const stored = getScratchpadItem(item.id)
    const merged = mergeScratchpadCompositionIntoTune(original, stored.composition.tuneSnapshot)

    expect(merged.id).toBe('t-round')
    expect(merged.books).toEqual(['book-a'])
    expect(merged.links).toEqual([{ title: 'link', link: 'https://example.com' }])

    const originalNotes = compactNotes(primaryVoiceNotes(original))
    const mergedNotes = compactNotes(primaryVoiceNotes(merged))
    expect(mergedNotes).toBe(originalNotes)

    expect(compactLyrics(merged)).toContain('Sing verse')
    expect(compactLyrics(merged)).toContain('Sing chorus')
  })

  test('rejects tune with no lyrics or notation', async function() {
    const ws = createWorkspace('Empty')
    await expect(exportTuneToScratchpadComposition({
      tune: { id: 'empty', name: 'Empty', voices: { 1: { notes: [], meta: {} } } },
      workspaceId: ws.id,
    })).rejects.toThrow('no lyrics or notation')
  })
})

describe('exportTuneToScratchpadComposition chunk builders via pairing helper', function() {
  test('wholeItem chunks pair when only one of each', function() {
    const lyricsChunks = [{
      id: generateCompositionChunkId(),
      label: 'Lyrics',
      order: 0,
      wholeItem: true,
    }]
    const notationChunks = [{
      id: generateCompositionChunkId(),
      label: 'Strain 1',
      order: 0,
      wholeItem: true,
    }]
    const pairings = guessCompositionPairingsFromStructure(lyricsChunks, notationChunks, {
      lyricSections: [{ header: '', lines: ['a'], title: 'Lyrics' }],
      strains: [{ index: 0 }],
    })
    expect(pairings.length).toBe(1)
    expect(pairings[0].lyricsChunkId).toBe(lyricsChunks[0].id)
    expect(pairings[0].notationChunkId).toBe(notationChunks[0].id)
  })
})
