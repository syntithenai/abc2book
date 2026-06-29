export function resolvePrimaryVoiceKey(voices) {
  if (!voices || typeof voices !== 'object') return '1';
  const keys = Object.keys(voices).sort(function(a, b) {
    const aNum = parseInt(a, 10);
    const bNum = parseInt(b, 10);
    if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum - bNum;
    return String(a).localeCompare(String(b));
  });
  return keys.length > 0 ? keys[0] : '1';
}
