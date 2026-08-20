import {
  isSupportedGroupingMeter,
  applyNoteGroupingToVoiceBody,
  applyNoteGroupingToTune,
  serializeVoiceEventsForEditor,
} from './abcNoteGrouping';
import { serializeVoiceEventsWithBeatGroups, serializeVoiceEvents } from './notation/abcVoiceSerializer';
import { parseVoiceEvents } from './notation/voiceEventModel';

function mockAbcTools() {
  return {
    justNotesNoMeta: function(abc) {
      return String(abc || '')
        .split('\n')
        .filter(function(line) { return !/^[A-Z]:/.test(String(line || '').trim()); })
        .join('\n');
    },
  };
}

function group(body, meter, noteLength) {
  const meta = { meter: meter, noteLength: noteLength || '1/8', key: 'C' };
  const events = parseVoiceEvents(body, meta);
  return serializeVoiceEventsWithBeatGroups(events, meta);
}

describe('isSupportedGroupingMeter', function() {
  test('accepts common simple and compound meters', function() {
    expect(isSupportedGroupingMeter('4/4')).toBe(true);
    expect(isSupportedGroupingMeter('C')).toBe(true);
    expect(isSupportedGroupingMeter('6/8')).toBe(true);
    expect(isSupportedGroupingMeter('12/8')).toBe(true);
  });

  test('rejects unsupported meters', function() {
    expect(isSupportedGroupingMeter('5/4')).toBe(false);
    expect(isSupportedGroupingMeter('7/8')).toBe(false);
  });
});

describe('serializeVoiceEventsWithBeatGroups', function() {
  test('groups 4/4 melody by quarter-note beats', function() {
    expect(group('CDEFGABc |', '4/4')).toBe('CD EF GA Bc |');
  });

  test('groups 3/4 melody by quarter-note beats', function() {
    expect(group('CDEFGA |', '3/4')).toBe('CD EF GA |');
  });

  test('groups 2/4 melody by quarter-note beats', function() {
    expect(group('CDEF |', '2/4')).toBe('CD EF |');
  });

  test('groups 6/8 by dotted-quarter beats', function() {
    expect(group('CDEFGA |', '6/8')).toBe('CDE FGA |');
  });

  test('groups 9/8 by dotted-quarter beats', function() {
    expect(group('CDEFGABcdef |', '9/8')).toBe('CDE FGA Bcd ef |');
  });

  test('groups 12/8 by dotted-quarter beats', function() {
    expect(group('CDEFGABcdefgab |', '12/8')).toBe('CDE FGA Bcd efg ab |');
  });

  test('preserves system breaks', function() {
    expect(group('CDEF\nGABc |', '4/4')).toBe('CD EF\nGA Bc |');
  });

  test('keeps space after barline', function() {
    expect(group('CD EF|GA Bc |', '4/4')).toBe('CD EF | GA Bc |');
  });
});

describe('serializeVoiceEventsForEditor', function() {
  test('preserves existing ABC spaces and does not auto-heal beat groups', function() {
    const meta = { meter: '6/8', noteLength: '1/8', key: 'C' };
    expect(serializeVoiceEventsForEditor(parseVoiceEvents('CDEFGA |', meta), meta)).toBe('CDEFGA |');
    expect(serializeVoiceEventsForEditor(parseVoiceEvents('CDE FGA |', meta), meta)).toBe('CDE FGA |');
  });

  test('falls back to beam-friendly serialization for unsupported meters', function() {
    const meta = { meter: '5/4', noteLength: '1/8', key: 'C' };
    const events = parseVoiceEvents('CDEF |', meta);
    expect(serializeVoiceEventsForEditor(events, meta)).toBe('CDEF |');
  });
});

describe('applyNoteGroupingToVoiceBody', function() {
  const abcTools = mockAbcTools();

  test('returns grouped body for valid 4/4 melody', function() {
    const result = applyNoteGroupingToVoiceBody('CDEFGABc |', { meter: '4/4', noteLength: '1/8', key: 'C' }, abcTools);
    expect(result.ok).toBe(true);
    expect(result.body).toBe('CD EF GA Bc |');
    expect(result.unchanged).toBe(false);
  });

  test('marks unchanged when already grouped', function() {
    const body = 'CD EF GA Bc |';
    const result = applyNoteGroupingToVoiceBody(body, { meter: '4/4', noteLength: '1/8', key: 'C' }, abcTools);
    expect(result.ok).toBe(true);
    expect(result.body).toBe(body);
    expect(result.unchanged).toBe(true);
  });

  test('preserves note content only', function() {
    const before = 'CDEFGABc |';
    const meta = { meter: '4/4', noteLength: '1/8', key: 'C' };
    const result = applyNoteGroupingToVoiceBody(before, meta, abcTools);
    const events = parseVoiceEvents(before, meta);
    const canonical = serializeVoiceEvents(events, meta).replace(/\s+/g, '');
    expect(result.body.replace(/\s+/g, '')).toBe(canonical);
  });

  test('succeeds when chord note order in source differs from canonical', function() {
    const result = applyNoteGroupingToVoiceBody('[GEC] [FAc] |', { meter: '4/4', noteLength: '1/8', key: 'C' }, abcTools);
    expect(result.ok).toBe(true);
    expect(result.body).toMatch(/\[CEG\]/);
  });

  test('refuses unsupported meter', function() {
    const result = applyNoteGroupingToVoiceBody('CDEF |', { meter: '5/4', noteLength: '1/8', key: 'C' }, abcTools);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not supported/i);
  });

  test('refuses inline meter changes', function() {
    const result = applyNoteGroupingToVoiceBody('CD EF|[M:3/4]GA Bc |', { meter: '4/4', noteLength: '1/8', key: 'C' }, abcTools);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/inline time signature/i);
  });

  test('allows tuplets and still groups beat boundaries', function() {
    const result = applyNoteGroupingToVoiceBody('(3cde fga |', { meter: '6/8', noteLength: '1/8', key: 'C' }, abcTools);
    expect(result.ok).toBe(true);
    expect(result.body).toMatch(/\(3cde f ga/i);
  });

  test('allows pickup bars with underfull first measure', function() {
    const result = applyNoteGroupingToVoiceBody('EF | GABcde |', { meter: '6/8', noteLength: '1/8', key: 'C' }, abcTools);
    expect(result.ok).toBe(true);
    expect(result.body).toMatch(/EF/);
    expect(result.body).toMatch(/GAB cde/);
  });

  test('refuses overfull bar', function() {
    const result = applyNoteGroupingToVoiceBody('CDEFGABcdef |', { meter: '4/4', noteLength: '1/8', key: 'C' }, abcTools);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/too many notes/i);
  });

  test('includes voice label in refusal message', function() {
    const tune = {
      meter: '4/4',
      noteLength: '1/8',
      key: 'C',
      voices: { V1: { name: 'Melody', notes: ['(3CDEF GA |'] } },
    };
    const result = applyNoteGroupingToTune(tune, { V1: 'CDEFGABcdef |' }, abcTools);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/skipped/i);
    expect(result.reason).toMatch(/Melody|V1/);
    expect(result.reason).toMatch(/too many notes/i);
  });
});

describe('applyNoteGroupingToTune', function() {
  const abcTools = mockAbcTools();

  test('groups every voice or refuses all', function() {
    const tune = {
      meter: '4/4',
      noteLength: '1/8',
      key: 'C',
      voices: {
        V1: { notes: ['CDEFGABc |'] },
        V2: { notes: ['GABc cBAG |'] },
      },
    };
    const result = applyNoteGroupingToTune(tune, {}, abcTools);
    expect(result.ok).toBe(true);
    expect(result.tune.voices.V1.notes.join('\n')).toBe('CD EF GA Bc |');
    expect(result.tune.voices.V2.notes.join('\n')).toBe('GA Bc cB AG |');
  });

  test('uses live editor drafts when provided', function() {
    const tune = {
      meter: '4/4',
      noteLength: '1/8',
      key: 'C',
      voices: { V1: { notes: ['CDEF |'] } },
    };
    const result = applyNoteGroupingToTune(tune, { V1: 'CDEFGABc |' }, abcTools);
    expect(result.ok).toBe(true);
    expect(result.tune.voices.V1.notes.join('\n')).toBe('CD EF GA Bc |');
  });

  test('refuses entire tune when one voice fails', function() {
    const tune = {
      meter: '4/4',
      noteLength: '1/8',
      key: 'C',
      voices: {
        V1: { notes: ['CDEFGABc |'] },
        V2: { notes: ['CDEFGABcdef |'] },
      },
    };
    const result = applyNoteGroupingToTune(tune, {}, abcTools);
    expect(result.ok).toBe(false);
    expect(result.voiceKey).toBe('V2');
    expect(result.reason).toMatch(/too many notes/i);
  });
});
