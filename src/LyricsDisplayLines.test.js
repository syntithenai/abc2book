/**
 * @jest-environment jsdom
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import LyricsDisplayLines, {
  displaySectionHeader,
  capitalizeSectionHeader,
  lyricBodyWithOptionalBeatMarkers,
  sectionHeaderTone,
  sectionHeaderClassName,
} from './LyricsDisplayLines';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('LyricsDisplayLines helpers', function() {
  test('displaySectionHeader strips brackets and markdown hashes', function() {
    expect(displaySectionHeader('[Verse 1]')).toBe('Verse 1');
    expect(displaySectionHeader('# Chorus')).toBe('Chorus');
    expect(displaySectionHeader('## Bridge')).toBe('Bridge');
    expect(displaySectionHeader('(Outro)')).toBe('Outro');
    expect(displaySectionHeader('(spoken bridge)')).toBe('Spoken Bridge');
    expect(displaySectionHeader('# chorus @1')).toBe('Chorus');
    expect(displaySectionHeader('# instrumental @1 @2')).toBe('Instrumental');
    expect(displaySectionHeader('# instrumental verse and chorus @1 @2')).toBe(
      'Instrumental Verse And Chorus'
    );
  });

  test('displaySectionHeader capitalises section labels', function() {
    expect(displaySectionHeader('[verse 2]')).toBe('Verse 2');
    expect(displaySectionHeader('# chorus')).toBe('Chorus');
    expect(displaySectionHeader('pre-chorus')).toBe('Pre-Chorus');
    expect(displaySectionHeader('PRE-CHORUS 2')).toBe('Pre-Chorus 2');
    expect(displaySectionHeader('# minichorus')).toBe('Mini-Chorus');
    expect(displaySectionHeader('# Mini-Chorus')).toBe('Mini-Chorus');
    expect(displaySectionHeader('# mini chorus')).toBe('Mini-Chorus');
  });

  test('capitalizeSectionHeader title-cases words and hyphenated parts', function() {
    expect(capitalizeSectionHeader('verse 1')).toBe('Verse 1');
    expect(capitalizeSectionHeader('pre-chorus')).toBe('Pre-Chorus');
  });

  test('displaySectionHeader returns null for empty input', function() {
    expect(displaySectionHeader('')).toBe(null);
    expect(displaySectionHeader('[]')).toBe(null);
    expect(displaySectionHeader('# @1')).toBe(null);
    expect(displaySectionHeader('#')).toBe(null);
    expect(displaySectionHeader(null)).toBe(null);
  });

  test('lyricBodyWithOptionalBeatMarkers keeps and highlights slash markers', function() {
    expect(lyricBodyWithOptionalBeatMarkers('a/mazing /grace', false)).toBe('amazing grace');
    expect(lyricBodyWithOptionalBeatMarkers('plain', true)).toBe('plain');
    const marked = lyricBodyWithOptionalBeatMarkers('a/mazing', true);
    expect(Array.isArray(marked)).toBe(true);
    const marker = marked.find(function(part) {
      return part && part.props && part.props.className === 'lyric-beat-marker';
    });
    expect(marker).toBeTruthy();
    expect(marker.props.children).toBe('/');
  });

  test('sectionHeaderTone groups repeated kinds onto the same color token', function() {
    expect(sectionHeaderTone('[Verse 1]')).toBe('verse');
    expect(sectionHeaderTone('# verse 2')).toBe('verse');
    expect(sectionHeaderTone('v3')).toBe('verse');
    expect(sectionHeaderTone('# Chorus')).toBe('chorus');
    expect(sectionHeaderTone('[Refrain]')).toBe('chorus');
    expect(sectionHeaderTone('Hook')).toBe('chorus');
    expect(sectionHeaderTone('Pre-Chorus')).toBe('prechorus');
    expect(sectionHeaderTone('# minichorus')).toBe('chorus');
    expect(sectionHeaderTone('# Mini-Chorus')).toBe('chorus');
    expect(sectionHeaderTone('## Bridge')).toBe('bridge');
    expect(sectionHeaderTone('(Intro)')).toBe('intro');
    expect(sectionHeaderTone('Outro')).toBe('outro');
    expect(sectionHeaderTone('Coda')).toBe('outro');
    expect(sectionHeaderTone('# instrumental')).toBe('instrumental');
    expect(sectionHeaderTone('– solo')).toBe('instrumental');
    expect(sectionHeaderTone(null)).toBe(null);
  });

  test('sectionHeaderClassName adds a stable tone class for repeats', function() {
    expect(sectionHeaderClassName('[Chorus]')).toBe(
      'lyrics-section-header lyrics-section-header--chorus'
    );
    expect(sectionHeaderClassName('Verse 1', 'chord-section-header')).toBe(
      'lyrics-section-header chord-section-header lyrics-section-header--verse'
    );
    expect(sectionHeaderClassName('[Chorus]')).toBe(sectionHeaderClassName('# chorus'));
  });
});

describe('LyricsDisplayLines section heading tones', function() {
  let container;
  let root;

  beforeEach(function() {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(function() {
    act(function() { root.unmount(); });
    container.remove();
  });

  test('applies matching tone classes to repeated lyric section headings', function() {
    act(function() {
      root.render(React.createElement(LyricsDisplayLines, {
        lines: [
          '[Verse 1]',
          'first verse',
          '',
          '[Chorus]',
          'chorus words',
          '',
          '[Verse 2]',
          'second verse',
          '',
          '[Chorus]',
          'chorus words again',
        ],
      }));
    });

    const headers = Array.prototype.map.call(
      container.querySelectorAll('.lyrics-section-header'),
      function(el) {
        return {
          text: String(el.textContent || '').trim(),
          tone: el.getAttribute('data-section-tone'),
        };
      }
    );
    expect(headers).toEqual([
      { text: 'Verse 1', tone: 'verse' },
      { text: 'Chorus', tone: 'chorus' },
      { text: 'Verse 2', tone: 'verse' },
      { text: 'Chorus', tone: 'chorus' },
    ]);
  });

  test('infers missing verse headings when only chorus markers are present', function() {
    act(function() {
      root.render(React.createElement(LyricsDisplayLines, {
        lines: [
          'Take me back in time again',
          'Stay with me like you did then',
          'Take me as you find me here',
          'Take me now Feel me near',
          '',
          '#chorus @2',
          'Love like I never knew before',
          'Someday will fade and be ignored',
          'Nothing is forever anymore',
          '',
          'Wrap me up in quiet sins',
          'Take me lost make me found',
          'Hold me silent in the night',
          'Say I\'m wrong make me right',
        ],
      }));
    });

    const headers = Array.prototype.map.call(
      container.querySelectorAll('.lyrics-section-header'),
      function(el) { return String(el.textContent || '').trim(); }
    );
    expect(headers).toEqual(['Verse', 'Chorus', 'Verse 2']);
  });
});
