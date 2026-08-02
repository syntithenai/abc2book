import {
  createWorkspace,
  createScratchpadItem,
  blankCompositionState,
} from './scratchpadStore'
import {
  assembleCompositionTune,
  buildCompositionPairings,
  applyEmbeddedChordAction,
  reorderCompositionChunks,
  setCompositionPairing,
  buildAbcForNotationChunk,
  addCompositionPairingRow,
  assignLyricsChunkToPairingRow,
  assignNotationChunkToPairingRow,
  buildCompositionPairingRows,
  normalizeCompositionPairingRows,
} from './scratchpadCompositionAssembly'
import { standardizeTextToChordProOnTune } from './scratchpadCompositionChordImport'

const WORKSPACES_KEY = 'bookstorage_scratchpad_workspaces'
const ITEMS_KEY = 'bookstorage_scratchpad_items'
const ACTIVE_WORKSPACE_KEY = 'bookstorage_scratchpad_active_workspace'

beforeEach(function() {
  localStorage.removeItem(WORKSPACES_KEY)
  localStorage.removeItem(ITEMS_KEY)
  localStorage.removeItem(ACTIVE_WORKSPACE_KEY)
})

describe('scratchpad composition store', function() {
  test('creates composition item with empty chunks', async function() {
    const ws = createWorkspace('Comp')
    const item = await createScratchpadItem({ workspaceId: ws.id, type: 'composition', title: 'My comp' })
    expect(item.type).toBe('composition')
    expect(item.composition.lyricsChunks).toEqual([])
    expect(item.composition.notationChunks).toEqual([])
    expect(item.composition.tuneSnapshot.name).toBe('My comp')
  })
})

describe('scratchpadCompositionAssembly', function() {
  test('buildCompositionPairings pairs by order', function() {
    const composition = blankCompositionState('c1', 'Comp')
    composition.lyricsChunks = [
      { id: 'l1', label: 'Lyrics 1', order: 0, enabled: true },
      { id: 'l2', label: 'Lyrics 2', order: 1, enabled: true },
    ]
    composition.notationChunks = [
      { id: 'n1', label: 'Strain 1', order: 0, enabled: true },
    ]
    const pairings = buildCompositionPairings(composition)
    expect(pairings.length).toBe(2)
    expect(pairings[0].lyricsChunk.id).toBe('l1')
    expect(pairings[0].notationChunk.id).toBe('n1')
    expect(pairings[1].lyricsChunk.id).toBe('l2')
    expect(pairings[1].notationChunk).toBeNull()
  })

  test('assembleCompositionTune merges text lyrics chunk', async function() {
    const ws = createWorkspace('Assembly')
    const textItem = await createScratchpadItem({
      workspaceId: ws.id,
      type: 'text',
      title: 'Lyrics',
      textBody: 'Verse one line\nSecond line',
    })
    const comp = await createScratchpadItem({ workspaceId: ws.id, type: 'composition' })
    const composition = Object.assign({}, comp.composition, {
      lyricsChunks: [{
        id: 'lc1',
        sourceKind: 'text-section',
        sourceItemId: textItem.id,
        sectionIndex: 0,
        label: 'Section',
        order: 0,
        enabled: true,
        plainLyricsOnly: true,
      }],
    })
    const tune = assembleCompositionTune(composition)
    expect(tune.words.join('\n')).toContain('Verse one line')
  })

  test('applyEmbeddedChordAction plain adds lyrics chunk flag', function() {
    const composition = blankCompositionState('c1', 'Comp')
    const result = applyEmbeddedChordAction(composition, 'plain', {
      text: 'C G Am\nSing',
      lyricsChunk: { id: 'l1', label: 'L', order: 0, enabled: true },
    })
    expect(result.ok).toBe(true)
    expect(result.composition.lyricsChunks.length).toBe(1)
    expect(result.composition.lyricsChunks[0].plainLyricsOnly).toBe(true)
  })

  test('reorderCompositionChunks swaps order indices', function() {
    const composition = blankCompositionState('c1', 'Comp')
    composition.lyricsChunks = [
      { id: 'l1', label: 'A', order: 0, enabled: true },
      { id: 'l2', label: 'B', order: 1, enabled: true },
    ]
    const next = reorderCompositionChunks(composition, 'lyrics', 'l2', 'up')
    expect(next.lyricsChunks[0].id).toBe('l2')
    expect(next.lyricsChunks[1].id).toBe('l1')
    expect(next.lyricsChunks[0].order).toBe(0)
    expect(next.lyricsChunks[1].order).toBe(1)
  })

  test('setCompositionPairing overrides default order pairing', function() {
    const composition = blankCompositionState('c1', 'Comp')
    composition.lyricsChunks = [
      { id: 'l1', label: 'L1', order: 0, enabled: true },
      { id: 'l2', label: 'L2', order: 1, enabled: true },
    ]
    composition.notationChunks = [
      { id: 'n1', label: 'N1', order: 0, enabled: true },
      { id: 'n2', label: 'N2', order: 1, enabled: true },
    ]
    const next = setCompositionPairing(composition, 'l2', 'n1')
    const pairings = buildCompositionPairings(next)
    expect(pairings[0].lyricsChunk.id).toBe('l1')
    expect(pairings[0].notationChunk.id).toBe('n2')
    expect(pairings[1].lyricsChunk.id).toBe('l2')
    expect(pairings[1].notationChunk.id).toBe('n1')
  })

  test('buildAbcForNotationChunk returns ABC for chord sheet with derived tune', function() {
    const tune = blankCompositionState('c1', 'Comp').tuneSnapshot
    const standardized = standardizeTextToChordProOnTune(tune, 'C | G | Am |')
    const chunk = {
      sourceKind: 'chord-sheet',
      derivedTuneSnapshot: standardized.tune,
    }
    const abc = buildAbcForNotationChunk(chunk)
    expect(abc).toMatch(/X:/)
    expect(abc).toMatch(/K:/)
  })

  test('addCompositionPairingRow and assign chunks', function() {
    let composition = blankCompositionState('c1', 'Comp')
    composition = addCompositionPairingRow(composition)
    const rows = buildCompositionPairingRows(composition)
    expect(rows.length).toBe(1)
    const pairingId = rows[0].id
    composition = assignLyricsChunkToPairingRow(composition, pairingId, {
      id: 'l1',
      label: 'Verse',
      sourceKind: 'text-section',
      sourceItemId: 'text1',
      sectionIndex: 0,
      order: 0,
      enabled: true,
    })
    composition = assignNotationChunkToPairingRow(composition, pairingId, {
      id: 'n1',
      label: 'Strain 1',
      sourceKind: 'notation-strain',
      sourceItemId: 'note1',
      strainIndex: 0,
      order: 0,
      enabled: true,
    })
    const nextRows = buildCompositionPairingRows(composition)
    expect(nextRows[0].lyricsChunk.id).toBe('l1')
    expect(nextRows[0].notationChunk.id).toBe('n1')
  })

  test('normalizeCompositionPairingRows migrates legacy pairings', function() {
    const composition = blankCompositionState('c1', 'Comp')
    composition.lyricsChunks = [{ id: 'l1', label: 'L1', order: 0, enabled: true }]
    composition.notationChunks = [{ id: 'n1', label: 'N1', order: 0, enabled: true }]
    composition.pairings = [{ lyricsChunkId: 'l1', notationChunkId: 'n1' }]
    const normalized = normalizeCompositionPairingRows(composition)
    expect(normalized.pairings.length).toBe(1)
    expect(normalized.pairings[0].id).toBeTruthy()
    expect(buildCompositionPairingRows(normalized)[0].notationChunk.id).toBe('n1')
  })
})
