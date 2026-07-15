import {
  clearFilePickerIntent,
  consumeFilePickerIntent,
  writeFilePickerIntent,
} from './filePickerIntent'

describe('filePickerIntent', function() {
  beforeEach(function() {
    clearFilePickerIntent()
  })

  afterEach(function() {
    clearFilePickerIntent()
  })

  test('consumes fresh matching intent once', function() {
    writeFilePickerIntent('photos', 'tune-1')
    expect(consumeFilePickerIntent('tune-1')).toBe('photos')
    expect(consumeFilePickerIntent('tune-1')).toBe(null)
  })

  test('ignores intent for a different tune', function() {
    writeFilePickerIntent('drive', 'tune-1')
    expect(consumeFilePickerIntent('tune-2')).toBe(null)
    expect(consumeFilePickerIntent('tune-1')).toBe('drive')
  })
})
