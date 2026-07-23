import { nextVoiceKey, reorderVoicesObject, moveVoiceKeyInOrder, orderedVoiceKeys } from './voiceKeyOrder';

describe('voiceKeyOrder', function() {
  test('nextVoiceKey skips existing keys', function() {
    expect(nextVoiceKey({ 1: {}, V: {} })).toBe('2');
    expect(nextVoiceKey({ 1: {}, 2: {} })).toBe('3');
  });

  test('orderedVoiceKeys prefers stored voiceOrder', function() {
    const tune = {
      voices: { 1: {}, 2: {}, V: {} },
      voiceOrder: ['V', '2', '1'],
    };
    expect(orderedVoiceKeys(tune)).toEqual(['V', '2', '1']);
  });

  test('reorderVoicesObject follows explicit order array', function() {
    const voices = { V: { meta: 'a' }, 2: { meta: 'b' }, 1: { meta: 'c' } };
    const ordered = reorderVoicesObject(voices, ['V', '2', '1']);
    expect(orderedVoiceKeys({ voices: ordered, voiceOrder: ['V', '2', '1'] })).toEqual(['V', '2', '1']);
  });

  test('moveVoiceKeyInOrder swaps adjacent keys', function() {
    expect(moveVoiceKeyInOrder(['V', '2', '1'], 1, -1)).toEqual(['2', 'V', '1']);
    expect(moveVoiceKeyInOrder(['V', '2', '1'], 0, -1)).toBeNull();
  });
});
