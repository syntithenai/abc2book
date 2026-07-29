import {
  readScratchpadAudioEditorSession,
  writeScratchpadAudioEditorSession,
  clearScratchpadAudioEditorSession,
} from './scratchpadAudioEditorSession'
import { createDefaultAudioProject } from './scratchpadAudioProject'

describe('scratchpadAudioEditorSession', function() {
  beforeEach(function() {
    sessionStorage.clear()
  })

  test('preserves cached tracks across remount reads', function() {
    const item = { id: 'item-session', type: 'audio', audio: createDefaultAudioProject('item-session') }
    const first = readScratchpadAudioEditorSession(item)
    const withExtra = Object.assign({}, first, {
      tracks: first.tracks.concat([Object.assign({}, first.tracks[0], { id: 'trk-2', name: 'Track 2' })]),
    })
    writeScratchpadAudioEditorSession(item.id, withExtra)
    const second = readScratchpadAudioEditorSession(item)
    expect(second.tracks.length).toBe(2)
  })

  test('restores tracks from sessionStorage after memory cache is cleared', function() {
    const item = { id: 'item-hmr', type: 'audio', audio: createDefaultAudioProject('item-hmr') }
    const first = readScratchpadAudioEditorSession(item)
    const withExtra = Object.assign({}, first, {
      tracks: first.tracks.concat([Object.assign({}, first.tracks[0], { id: 'trk-2', name: 'Track 2' })]),
    })
    writeScratchpadAudioEditorSession(item.id, withExtra)
    clearScratchpadAudioEditorSession(item.id)
    sessionStorage.setItem(
      'scratchpad-audio-editor:item-hmr',
      JSON.stringify(withExtra)
    )
    const restored = readScratchpadAudioEditorSession(item)
    expect(restored.tracks.length).toBe(2)
    expect(restored.tracks[1].name).toBe('Track 2')
  })
})
