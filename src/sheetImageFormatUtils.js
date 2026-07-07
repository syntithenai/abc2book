import { formatSheetImageEta } from './sheetImageTranscriptionClient';

export function formatSheetImageWarnings(warnings) {
  if (!Array.isArray(warnings) || !warnings.length) return [];
  const lines = [];
  for (let i = 0; i < warnings.length; i += 1) {
    const item = String(warnings[i] || '').trim();
    if (!item) continue;
    if (item === 'omr_failed') {
      const detail = String(warnings[i + 1] || '').trim();
      lines.push(detail ? ('Melody recognition failed: ' + detail) : 'Melody recognition failed.');
      if (detail) i += 1;
      continue;
    }
    if (item === 'vlm_fallback_applied') {
      lines.push('Chord text was cleaned up with the research LLM.');
      continue;
    }
    if (item === 'paddleocr_unavailable') {
      lines.push('OCR is not available on this resolver.');
      continue;
    }
    lines.push(item);
  }
  return lines;
}

export function formatSheetImageProgressMessage(progressState) {
  if (!progressState || !progressState.message) return '';
  const eta = formatSheetImageEta(progressState);
  return eta ? progressState.message + ' · ' + eta : progressState.message;
}
