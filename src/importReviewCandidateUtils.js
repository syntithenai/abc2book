export function mergeDraftTune(importedTune, draftTune) {
  return Object.assign({}, importedTune || {}, draftTune || {});
}

export function freshTuneId() {
  return 'tune-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
}

export function applyDraftIdentityHints(tune, draftTune) {
  const next = Object.assign({}, tune || {});
  if (!String(next.name || '').trim() && draftTune && draftTune.name) {
    next.name = draftTune.name;
  }
  if (!String(next.composer || '').trim() && draftTune && draftTune.composer) {
    next.composer = draftTune.composer;
  }
  return next;
}

export function asIndependentReviewCandidate(candidate, draft) {
  const source = candidate || {};
  const tuneIn = source.tune || {};
  const hinted = applyDraftIdentityHints(tuneIn, draft && draft.tune);
  const links = Array.isArray(tuneIn.links) ? tuneIn.links.slice() : [];
  const existingId = String(tuneIn.id || '').trim();
  return Object.assign({}, source, {
    tune: Object.assign({}, hinted, {
      id: existingId || freshTuneId(),
      links: links,
    }),
    mergeTargetId: source.mergeTargetId != null ? source.mergeTargetId : null,
  });
}
