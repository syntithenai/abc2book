export function normalizePracticeListTuneIds(tuneIds) {
  if (!Array.isArray(tuneIds)) return [];
  const seen = {};
  const normalized = [];
  tuneIds.forEach(function(id) {
    const tuneId = id != null ? String(id).trim() : '';
    if (!tuneId || seen[tuneId]) return;
    seen[tuneId] = true;
    normalized.push(tuneId);
  });
  return normalized;
}

function normalizePracticeListBody(listRecord) {
  if (!listRecord) return null;
  return {
    name: listRecord.name || '',
    tuneIds: normalizePracticeListTuneIds(listRecord.tuneIds),
    updatedAt: parseInt(listRecord.updatedAt, 10) || 0,
  };
}

export function practiceListPairHasDifferingFields(localList, incomingList) {
  return JSON.stringify(normalizePracticeListBody(localList))
    !== JSON.stringify(normalizePracticeListBody(incomingList));
}
