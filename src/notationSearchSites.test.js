/** @jest-environment node */
import { buildExternalNotationArchiveChoices, notationSourceBadgeLabel } from './notationSearchSites'

describe('notationSearchSites', () => {
  test('buildExternalNotationArchiveChoices includes major archives', () => {
    const choices = buildExternalNotationArchiveChoices('Ave Verum', 'Mozart')
    const ids = choices.map(function(item) { return item.id })
    expect(ids).toEqual(expect.arrayContaining(['imslp', 'cpdl', 'josquin', 'openscore', 'musicalion', 'w3c']))
  })

  test('notationSourceBadgeLabel', () => {
    expect(notationSourceBadgeLabel('cpdl.org')).toBe('CPDL')
    expect(notationSourceBadgeLabel('josquin.stanford.edu')).toBe('Josquin')
    expect(notationSourceBadgeLabel('midi-resources')).toBe('Local MIDI')
    expect(notationSourceBadgeLabel('musescore.com')).toBe('MuseScore')
  })
})
