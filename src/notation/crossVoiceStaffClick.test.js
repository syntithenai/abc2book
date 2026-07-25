import { buildAbcPreviewFromBodies } from './notationDisplayAbc';
import { eventsFromVoiceBody } from './voiceEventTiming';
import {
  resolveStaffClickForVoice,
  voiceKeyFromStaffAnalysis,
  voiceStaffIndexFromDom,
} from './staffClickResolve';

const tuneMeta = { meter: '4/4', noteLength: '1/4', key: 'C' };

const tune = {
  voices: {
    '1': { meta: 'clef=treble', notes: ['C E G |'] },
    '2': { meta: 'clef=bass', notes: ['G, B, D |'] },
  },
};

const tunebook = { abcTools: { buildAbc: function(t) { return t; } } };

function mockWrapWithVoiceNotes(voiceStaffIndex, noteSpecs) {
  const wrap = document.createElement('div');
  wrap.getBoundingClientRect = function() {
    return { left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200 };
  };
  noteSpecs.forEach(function(spec, i) {
    const note = document.createElement('g');
    note.className = 'abcjs-note abcjs-v' + voiceStaffIndex + ' abcjs-l0 abcjs-n' + i;
    note.getBoundingClientRect = function() {
      return {
        left: spec.x,
        top: spec.y,
        right: spec.x + 16,
        bottom: spec.y + 32,
        width: 16,
        height: 32,
      };
    };
    wrap.appendChild(note);
  });
  document.body.appendChild(wrap);
  return wrap;
}

describe('cross-voice staff click', function() {
  test('voiceKeyFromStaffAnalysis uses analysis.voice', function() {
    expect(voiceKeyFromStaffAnalysis(['1', '2'], { voice: 1 }, null, '1')).toBe('2');
  });

  test('voiceStaffIndexFromDom reads abcjs-vN from clicked note', function() {
    const note = document.createElement('g');
    note.className = 'abcjs-note abcjs-v1 abcjs-l0';
    const evt = { target: note };
    expect(voiceStaffIndexFromDom(evt)).toBe(1);
  });

  test('voiceKeyFromStaffAnalysis falls back to DOM voice class', function() {
    const note = document.createElement('g');
    note.className = 'abcjs-note abcjs-v1';
    expect(voiceKeyFromStaffAnalysis(['1', '2'], null, { target: note }, '1')).toBe('2');
  });

  test('resolveStaffClickForVoice resolves voice 2 note index, not voice 1', function() {
    const voice1Events = eventsFromVoiceBody('C E G |', tuneMeta);
    const voice2Events = eventsFromVoiceBody('G, B, D |', tuneMeta);
    const fullAbc = buildAbcPreviewFromBodies(
      tune,
      tunebook,
      ['1', '2'],
      { '1': 'C E G |', '2': 'G, B, D |' }
    );
    const wrap = mockWrapWithVoiceNotes(1, [
      { x: 40, y: 120 },
      { x: 90, y: 120 },
      { x: 140, y: 120 },
    ]);
    const secondNote = wrap.querySelector('.abcjs-n1');

    const result = resolveStaffClickForVoice({
      targetVoiceKey: '2',
      targetEvents: voice2Events,
      displayedVoiceKeys: ['1', '2'],
      wrapEl: wrap,
      mouseEvent: { clientX: 98, clientY: 130 },
      abcelem: null,
      analysis: { voice: 1, selectableElement: secondNote },
      tuneMeta: tuneMeta,
      fullAbc: fullAbc,
    });

    expect(result.eventIndex).toBe(1);
    expect(voice2Events[result.eventIndex].pitch.step).toBe('B');
    expect(voice1Events[1].pitch.step).toBe('E');

    document.body.removeChild(wrap);
  });
});
