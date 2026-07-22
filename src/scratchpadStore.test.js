import {
  createWorkspace,
  createScratchpadItem,
  listWorkspaces,
  listItems,
  getScratchpadItem,
  updateScratchpadItem,
  copyScratchpadItem,
  deleteScratchpadItem,
  deleteWorkspace,
  ensureDefaultWorkspace,
  buildPreviewText,
  getActiveWorkspaceId,
  setActiveWorkspaceId,
} from './scratchpadStore'
import { getScratchpadBlob } from './scratchpadBlobs'

const WORKSPACES_KEY = 'bookstorage_scratchpad_workspaces'
const ITEMS_KEY = 'bookstorage_scratchpad_items'
const ACTIVE_WORKSPACE_KEY = 'bookstorage_scratchpad_active_workspace'

beforeEach(function() {
  localStorage.removeItem(WORKSPACES_KEY)
  localStorage.removeItem(ITEMS_KEY)
  localStorage.removeItem(ACTIVE_WORKSPACE_KEY)
})

describe('scratchpadStore', function() {
  test('creates default workspace when none exist', function() {
    const ws = ensureDefaultWorkspace()
    expect(ws.id).toBeTruthy()
    expect(ws.name).toBe('Default')
    expect(getActiveWorkspaceId()).toBe(ws.id)
  })

  test('creates and lists text items in workspace', async function() {
    const ws = createWorkspace('Test')
    const item = await createScratchpadItem({
      workspaceId: ws.id,
      type: 'text',
      title: 'Hello',
      textBody: 'Line one\nLine two\nLine three',
    })
    expect(item.id).toBeTruthy()
    expect(item.previewText).toBe('Line one\nLine two\nLine three')
    const items = listItems(ws.id)
    expect(items.length).toBe(1)
    expect(items[0].title).toBe('Hello')
  })

  test('updates item title and text', async function() {
    const ws = createWorkspace('Edit')
    const item = await createScratchpadItem({ workspaceId: ws.id, type: 'text', title: 'A' })
    const updated = updateScratchpadItem(item.id, {
      title: 'B',
      text: { body: 'new text' },
    })
    expect(updated.title).toBe('B')
    expect(updated.text.body).toBe('new text')
    expect(updated.previewText).toBe('new text')
  })

  test('copies image item with blob', async function() {
    const ws = createWorkspace('Images')
    const blob = new Blob(['fake'], { type: 'image/png' })
    const item = await createScratchpadItem({
      workspaceId: ws.id,
      type: 'image',
      title: 'Pic',
      blob: blob,
    })
    const copy = await copyScratchpadItem(item.id)
    expect(copy.id).not.toBe(item.id)
    expect(copy.title).toBe('Pic copy')
    const named = await copyScratchpadItem(item.id, undefined, { title: 'Renamed copy' })
    expect(named.title).toBe('Renamed copy')
    const copyBlob = await getScratchpadBlob(copy.image.blobKey)
    expect(copyBlob).toBeTruthy()
  })

  test('deletes item and workspace', async function() {
    const ws = createWorkspace('Delete me')
    const item = await createScratchpadItem({ workspaceId: ws.id, type: 'text' })
    deleteScratchpadItem(item.id)
    expect(getScratchpadItem(item.id)).toBeNull()
    deleteWorkspace(ws.id)
    expect(listWorkspaces().find(function(w) { return w.id === ws.id })).toBeUndefined()
  })

  test('buildPreviewText limits lines', function() {
    const text = 'a\nb\nc\nd\ne\nf'
    expect(buildPreviewText(text, 3)).toBe('a\nb\nc')
  })

  test('active workspace persists', function() {
    const ws = createWorkspace('Active')
    setActiveWorkspaceId(ws.id)
    expect(getActiveWorkspaceId()).toBe(ws.id)
  })

  test('migrates legacy midi scratchpad items to notation', function() {
    const ws = createWorkspace('Legacy')
    const itemId = 'legacy-midi-item'
    localStorage.setItem(ITEMS_KEY, JSON.stringify({
      [itemId]: {
        type: 'midi',
        workspaceId: ws.id,
        title: 'Imported MIDI',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        midi: {
          tuneSnapshot: {
            id: itemId,
            name: 'Imported MIDI',
            meter: '4/4',
            noteLength: '1/8',
            key: 'C',
            voices: { V: { notes: ['C D E'], meta: {} } },
          },
        },
      },
    }))
    const item = getScratchpadItem(itemId)
    expect(item.type).toBe('notation')
    expect(item.notation.tuneSnapshot.name).toBe('Imported MIDI')
    expect(item.notation.tuneSnapshot.voices.V.notes.join(' ')).toBe('C D E')
    const stored = JSON.parse(localStorage.getItem(ITEMS_KEY))[itemId]
    expect(stored.type).toBe('notation')
    expect(stored.midi).toBeUndefined()
  })
})
