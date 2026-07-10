export const IMPORT_REVIEW_STEPS = ['review', 'enrichmentQueue'];

const SCORE_SOURCE_KINDS = ['musicxml', 'mxl', 'midi'];

export function emptySessionSummary() {
  return { reviewed: 0, created: 0, merged: 0, skipped: 0 };
}

export function candidateNeedsEnrichmentOptIn(candidate) {
  if (!candidate) return false;
  if (candidate.skipEnrich) return false;
  return SCORE_SOURCE_KINDS.indexOf(candidate.sourceKind) >= 0;
}

export function youtubeUrlFromCandidate(candidate) {
  if (!candidate) return '';
  const direct = String(candidate.youtubeUrl || '').trim();
  if (direct) return direct;
  const links = candidate.tune && Array.isArray(candidate.tune.links) ? candidate.tune.links : [];
  for (let i = 0; i < links.length; i += 1) {
    const link = links[i] && links[i].link ? String(links[i].link) : '';
    if (link && /youtube|youtu\.be/i.test(link)) return link;
  }
  return '';
}

export function createImportCandidate(options) {
  const tune = options.tune || {};
  const sourceKind = options.sourceKind || 'manual';
  return {
    id: options.id || 'candidate-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    tune: Object.assign({}, tune),
    sourceKind: sourceKind,
    rawText: options.rawText || null,
    mergeTargetId: options.mergeTargetId || null,
    youtubeUrl: options.youtubeUrl || '',
    skipEnrich: !!options.skipEnrich || sourceKind === 'sheetimage',
    contentHashDuplicate: !!options.contentHashDuplicate,
    imported: false,
  };
}

function normalizeCandidate(item, index) {
  const candidate = item && item.id
    ? item
    : Object.assign({}, item || {}, {
      id: 'candidate-' + Date.now() + '-' + index + '-' + Math.random().toString(36).slice(2, 7),
    });
  if (candidate.sourceKind === 'sheetimage') {
    candidate.skipEnrich = true;
  }
  return candidate;
}

export function createImportReviewSession(candidates, options) {
  const list = (Array.isArray(candidates) ? candidates : []).map(normalizeCandidate);
  return {
    candidates: list,
    index: 0,
    step: list.length ? 'review' : 'done',
    phase: 'identify',
    mergeIndex: null,
    enrichmentJobs: [],
    importedCandidateIds: {},
    skipEnrichForRemaining: false,
    skipYoutubeForRemaining: false,
    skipEnrichment: !!(options && options.skipEnrichment),
    sessionSummary: emptySessionSummary(),
  };
}

export function currentCandidate(session) {
  if (!session || !session.candidates.length) return null;
  return session.candidates[session.index] || null;
}

export function mergeCandidate(session) {
  if (!session || session.mergeIndex == null) return null;
  return session.candidates[session.mergeIndex] || null;
}

export function advanceStep(session) {
  const idx = IMPORT_REVIEW_STEPS.indexOf(session.step);
  if (idx < 0 || idx >= IMPORT_REVIEW_STEPS.length - 1) {
    return Object.assign({}, session, { step: 'done' });
  }
  return Object.assign({}, session, { step: IMPORT_REVIEW_STEPS[idx + 1] });
}

export function retreatStep(session) {
  const idx = IMPORT_REVIEW_STEPS.indexOf(session.step);
  if (idx <= 0) {
    return Object.assign({}, session, { step: IMPORT_REVIEW_STEPS[0] });
  }
  return Object.assign({}, session, { step: IMPORT_REVIEW_STEPS[idx - 1] });
}

export function advanceReviewStep(session) {
  if (!currentCandidate(session)) return Object.assign({}, session, { step: 'done' });
  if (session.step === 'review') return session;
  return advanceStep(session);
}

export function retreatReviewStep(session) {
  if (session.step === 'enrichmentQueue') {
    return Object.assign({}, session, {
      phase: 'identify',
      step: 'review',
      mergeIndex: null,
    });
  }
  return session;
}

export function beginEnrichmentPhase(session) {
  return Object.assign({}, session, {
    phase: 'enrichment',
    step: 'enrichmentQueue',
    mergeIndex: null,
  });
}

export function initialStepForCandidate(candidate, session) {
  if (session && session.skipYoutubeForRemaining) {
    return 'review';
  }
  if (shouldSkipYoutubeStep(candidate)) {
    return 'review';
  }
  return 'review';
}

export function completeIdentificationForCurrent(session, updatedSession) {
  const base = updatedSession || session;
  const nextIndex = base.index + 1;
  if (nextIndex >= base.candidates.length) {
    return beginEnrichmentPhase(base);
  }
  return Object.assign({}, base, {
    index: nextIndex,
    step: 'review',
    phase: 'identify',
    mergeIndex: null,
  });
}

export function beginMergeForCandidateIndex(session, index) {
  if (!session || index == null || index < 0) return session;
  return Object.assign({}, session, {
    phase: 'merge',
    step: 'review',
    mergeIndex: index,
    index: index,
  });
}

export function beginMergeForJob(session, job) {
  if (!session || !job) return session;
  const mergeIndex = session.candidates.findIndex(function(candidate) {
    return candidate.id === job.candidateId;
  });
  if (mergeIndex < 0) return session;
  return Object.assign({}, session, {
    phase: 'merge',
    step: 'review',
    mergeIndex: mergeIndex,
    index: mergeIndex,
  });
}

export function markCandidateImported(session) {
  const candidate = mergeCandidate(session) || currentCandidate(session);
  const summary = Object.assign({}, session.sessionSummary || emptySessionSummary());
  if (candidate) {
    summary.reviewed += 1;
    if (candidate.mergeTargetId) summary.merged += 1;
    else summary.created += 1;
  }

  const importedCandidateIds = candidate
    ? Object.assign({}, session.importedCandidateIds || {}, { [candidate.id]: true })
    : (session.importedCandidateIds || {});

  const candidates = candidate
    ? session.candidates.map(function(item) {
      if (item.id !== candidate.id) return item;
      return Object.assign({}, item, { imported: true });
    })
    : session.candidates.slice();

  const mergedIndex = session.mergeIndex != null ? session.mergeIndex : session.index;
  const nextIndex = mergedIndex + 1;
  if (nextIndex >= candidates.length) {
    return Object.assign({}, session, {
      candidates: candidates,
      importedCandidateIds: importedCandidateIds,
      step: 'done',
      mergeIndex: null,
      phase: 'identify',
      sessionSummary: summary,
    });
  }

  return Object.assign({}, session, {
    candidates: candidates,
    importedCandidateIds: importedCandidateIds,
    index: nextIndex,
    mergeIndex: null,
    phase: 'identify',
    step: 'review',
    sessionSummary: summary,
  });
}

export function skipYoutubeAllRemaining(session) {
  return Object.assign({}, session, { skipYoutubeForRemaining: true });
}

export function skipEnrichAllRemaining(session) {
  return Object.assign({}, session, { skipEnrichForRemaining: true });
}

export function advanceCandidate(session) {
  const nextIndex = session.index + 1;
  if (nextIndex >= session.candidates.length) {
    return Object.assign({}, session, {
      step: 'done',
      mergeIndex: null,
      phase: 'identify',
    });
  }
  return Object.assign({}, session, {
    index: nextIndex,
    step: 'review',
    phase: 'identify',
    mergeIndex: null,
  });
}

function findNextReviewCandidateIndex(session, afterIndex) {
  const candidates = session.candidates || [];
  const imported = session.importedCandidateIds || {};
  for (let i = afterIndex + 1; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    if (!candidate || imported[candidate.id] || candidate.imported) continue;
    return i;
  }
  return -1;
}

export function deferCandidateForEnhancement(session, enrichmentJobs) {
  const currentIndex = session.mergeIndex != null ? session.mergeIndex : session.index;
  const nextIndex = findNextReviewCandidateIndex(session, currentIndex);
  if (nextIndex < 0) {
    return Object.assign({}, session, {
      enrichmentJobs: enrichmentJobs || session.enrichmentJobs || [],
      step: 'done',
      mergeIndex: null,
      phase: 'identify',
    });
  }
  return Object.assign({}, session, {
    enrichmentJobs: enrichmentJobs || session.enrichmentJobs || [],
    index: nextIndex,
    mergeIndex: null,
    phase: 'identify',
    step: 'review',
  });
}

export function updateCurrentCandidate(session, patch) {
  const candidates = session.candidates.slice();
  const index = session.mergeIndex != null ? session.mergeIndex : session.index;
  const current = candidates[index];
  if (!current) return session;
  candidates[index] = Object.assign({}, current, patch, {
    tune: Object.assign({}, current.tune, patch.tune || {}),
  });
  return Object.assign({}, session, { candidates: candidates });
}

export function navigateReviewCandidate(session, direction) {
  if (!session || !Array.isArray(session.candidates) || session.candidates.length === 0) return session;
  const total = session.candidates.length;
  const currentIndex = session.mergeIndex != null ? session.mergeIndex : session.index;
  const delta = direction < 0 ? -1 : 1;
  const nextIndex = (currentIndex + delta + total) % total;
  return Object.assign({}, session, {
    index: nextIndex,
    mergeIndex: null,
    phase: 'identify',
    step: 'review',
  });
}

export function appendImportReviewCandidates(session, candidates) {
  const list = Array.isArray(candidates) ? candidates.filter(Boolean).map(normalizeCandidate) : [];
  if (!session) {
    return createImportReviewSession(list);
  }
  if (list.length === 0) return session;
  return Object.assign({}, session, {
    candidates: (session.candidates || []).concat(list),
    step: session.step === 'done' ? 'review' : session.step,
    phase: session.step === 'done' ? 'identify' : session.phase,
    mergeIndex: null,
  });
}

export function cancelCurrentCandidate(session) {
  if (!session || !Array.isArray(session.candidates) || session.candidates.length === 0) {
    return Object.assign({}, session || {}, { step: 'done' });
  }
  const currentIndex = session.mergeIndex != null ? session.mergeIndex : session.index;
  const candidate = session.candidates[currentIndex];
  const remaining = session.candidates.filter(function(_, idx) {
    return idx !== currentIndex;
  });
  const importedCandidateIds = Object.assign({}, session.importedCandidateIds || {});
  if (candidate && candidate.id && importedCandidateIds[candidate.id]) {
    delete importedCandidateIds[candidate.id];
  }

  const summary = Object.assign({}, session.sessionSummary || emptySessionSummary());
  summary.skipped += 1;

  if (remaining.length === 0) {
    return Object.assign({}, session, {
      candidates: [],
      importedCandidateIds: importedCandidateIds,
      enrichmentJobs: [],
      index: 0,
      mergeIndex: null,
      phase: 'identify',
      step: 'done',
      sessionSummary: summary,
    });
  }

  const nextIndex = currentIndex >= remaining.length ? 0 : currentIndex;
  return Object.assign({}, session, {
    candidates: remaining,
    enrichmentJobs: (session.enrichmentJobs || []).filter(function(job) {
      return !candidate || job.candidateId !== candidate.id;
    }),
    importedCandidateIds: importedCandidateIds,
    index: nextIndex,
    mergeIndex: null,
    phase: 'identify',
    step: 'review',
    sessionSummary: summary,
  });
}

export function sessionProgressLabel(session) {
  if (!session || !session.candidates.length) return '';
  if (session.step === 'done') {
    const summary = session.sessionSummary || emptySessionSummary();
    return summary.reviewed + ' reviewed · ' + session.candidates.length + ' total';
  }
  return (session.index + 1) + ' of ' + session.candidates.length;
}

export function candidateIdentityLabel(candidate) {
  if (!candidate || !candidate.tune) return { title: '', artist: '' };
  return {
    title: candidate.tune.name ? String(candidate.tune.name) : '',
    artist: candidate.tune.composer ? String(candidate.tune.composer) : '',
  };
}

export function shouldSkipYoutubeStep(candidate) {
  if (!candidate) return true;
  const url = String(candidate.youtubeUrl || '').trim();
  if (url) return true;
  const links = candidate.tune && Array.isArray(candidate.tune.links) ? candidate.tune.links : [];
  return links.some(function(link) {
    return link && link.link && /youtube|youtu\.be/i.test(String(link.link));
  });
}

export function shouldSkipFieldMergeStep(candidate) {
  return !(candidate && candidate.mergeTargetId);
}

export function isReviewSessionActive(session) {
  return !!(session && session.step !== 'done' && session.candidates.length > 0);
}

export function isReviewComplete(session) {
  if (!session || !session.candidates.length) return true;
  const total = session.candidates.length;
  const imported = Object.keys(session.importedCandidateIds || {}).length;
  return imported >= total;
}
