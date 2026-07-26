import {
  findAutosuggestOptionMatch,
  isAutosuggestOptionPick,
  isAutosuggestReplacementEvent,
} from './autosuggestInputUtils'

describe('autosuggestInputUtils', function() {
  test('isAutosuggestReplacementEvent detects datalist selection', function() {
    expect(isAutosuggestReplacementEvent({
      nativeEvent: { inputType: 'insertReplacementText' },
    })).toBe(true)
    expect(isAutosuggestReplacementEvent({
      nativeEvent: { inputType: 'insertText' },
    })).toBe(false)
  })

  test('isAutosuggestOptionPick detects datalist jump but not final keystroke', function() {
    const options = ['Traditional', 'Trad Jazz Band']
    expect(isAutosuggestOptionPick('Traditional', 'trad', options)).toBe(true)
    expect(isAutosuggestOptionPick('Traditional', 'Traditiona', options)).toBe(false)
    expect(isAutosuggestOptionPick('Traditional', 'Traditional', options)).toBe(false)
  })

  test('findAutosuggestOptionMatch is case-insensitive', function() {
    expect(findAutosuggestOptionMatch('traditional', ['Traditional'])).toBe('Traditional')
  })
})
