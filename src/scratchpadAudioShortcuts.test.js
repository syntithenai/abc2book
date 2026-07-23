import { SCRATCHPAD_SHORTCUT_BINDINGS, shortcutLabel } from './scratchpadAudioShortcuts'

describe('scratchpadAudioShortcuts', function() {
  test('bindings include clipboard shortcuts', function() {
    const ids = SCRATCHPAD_SHORTCUT_BINDINGS.map(function(b) { return b.id })
    expect(ids).toContain('cut')
    expect(ids).toContain('copy')
    expect(ids).toContain('paste')
    expect(ids).toContain('delete')
  })

  test('shortcutLabel formats ctrl shortcuts', function() {
    const label = shortcutLabel({ key: 'z', ctrl: true })
    expect(label).toMatch(/Ctrl\+Z|⌘\+Z/)
  })
})
