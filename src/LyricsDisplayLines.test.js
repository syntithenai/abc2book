import { displaySectionHeader, capitalizeSectionHeader } from './LyricsDisplayLines';

describe('LyricsDisplayLines helpers', function() {
  test('displaySectionHeader strips brackets and markdown hashes', function() {
    expect(displaySectionHeader('[Verse 1]')).toBe('Verse 1');
    expect(displaySectionHeader('# Chorus')).toBe('Chorus');
    expect(displaySectionHeader('## Bridge')).toBe('Bridge');
    expect(displaySectionHeader('(Outro)')).toBe('Outro');
    expect(displaySectionHeader('(spoken bridge)')).toBe('Spoken Bridge');
  });

  test('displaySectionHeader capitalises section labels', function() {
    expect(displaySectionHeader('[verse 2]')).toBe('Verse 2');
    expect(displaySectionHeader('# chorus')).toBe('Chorus');
    expect(displaySectionHeader('pre-chorus')).toBe('Pre-Chorus');
    expect(displaySectionHeader('PRE-CHORUS 2')).toBe('Pre-Chorus 2');
  });

  test('capitalizeSectionHeader title-cases words and hyphenated parts', function() {
    expect(capitalizeSectionHeader('verse 1')).toBe('Verse 1');
    expect(capitalizeSectionHeader('pre-chorus')).toBe('Pre-Chorus');
  });

  test('displaySectionHeader returns null for empty input', function() {
    expect(displaySectionHeader('')).toBe(null);
    expect(displaySectionHeader('[]')).toBe(null);
    expect(displaySectionHeader(null)).toBe(null);
  });
});
