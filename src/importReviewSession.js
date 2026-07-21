import { primaryArtist } from './tuneBibliographicUtils';
import { coalesceImportCandidates, fieldLookupJobIdsForCandidate, fieldLookupKindsForCandidate } from './importReviewCandidateUtils';

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
  const skipEnrich = options.skipEnrich !== undefined
    ? !!options.skipEnrich
    : true;
  return {
    id: options.id || 'candidate-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    tune: Object.assign({}, tune),
    sourceKind: sourceKind,
    rawText: options.rawText || null,
    mergeTargetId: options.mergeTargetId || null,
    mergeStatus: options.mergeStatus || 'new',
    mergeMode: options.mergeMode || 'suggestOnly',
    attachmentPolicy: options.attachmentPolicy || null,
    warningReason: options.warningReason || null,
    youtubeUrl: options.youtubeUrl || '',
    skipEnrich: sourceKind === 'sheetimage' ? true : skipEnrich,
    contentHashDuplicate: !!options.contentHashDuplicate,
    imported: false,
  };
}

export function createBlankAddCandidate(options) {
  const opts = options || {};
  const book = opts.book ? String(opts.book).trim().toLowerCase() : '';
  const tags = Array.isArray(opts.tags) ? opts.tags.slice() : [];
  const tune = {
    id: opts.id || null,
    name: '',
    composer: '',
    books: book ? [book] : [],
    tags: tags,
    voices: { '1': { meta: '', notes: [] } },
    words: [],
    links: [],
  };
  const candidate = createImportCandidate({
    id: opts.candidateId,
    tune: tune,
    sourceKind: 'manual',
    mergeTargetId: null,
    skipEnrich: false,
  });
  // Marks the live Add-form draft so Review can park/enrich other items beside it.
  candidate.addDraft = true;
  return candidate;
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
  const opts = options || {};
  const addPanelMode = opts.addPanelMode === 'curated' || opts.addPanelMode === 'bulk'
    ? opts.addPanelMode
    : 'form';
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
    skipEnrichment: !!opts.skipEnrichment,
    entryMode: opts.entryMode === 'add' ? 'add' : 'import',
    addPanelMode: opts.entryMode === 'add' ? addPanelMode : 'form',
    sessionSummary: emptySessionSummary(),
  };
}

/** True when chrome should say "Add tunes" / primary "Add". */
export function isAddTunesChrome(session) {
  return !!(session && session.entryMode === 'add');
}

export function isAddDraftCandidate(candidate) {
  return !!(candidate && candidate.addDraft);
}

function tuneHasMeaningfulAddContent(tune) {
  if (!tune) return false;
  if (String(tune.name || '').trim()) return true;
  if (String(tune.composer || '').trim()) return true;
  if (Array.isArray(tune.words) && tune.words.some(function(line) { return String(line || '').trim(); })) {
    return true;
  }
  if (Array.isArray(tune.wLines) && tune.wLines.some(function(line) { return String(line || '').trim(); })) {
    return true;
  }
  if (Array.isArray(tune.tuneFiles) && tune.tuneFiles.length > 0) return true;
  if (Array.isArray(tune.links) && tune.links.length > 0) return true;
  const voices = tune.voices || {};
  return Object.keys(voices).some(function(voiceKey) {
    const voice = voices[voiceKey] || {};
    const notes = Array.isArray(voice.notes) ? voice.notes.join('\n') : String(voice.notes || '');
    return !!String(notes || '').trim() || !!String(voice.meta || '').trim();
  });
}

/** Blank Add-form draft with no title, notation, lyrics, or local attachments. */
export function isIdleAddDraftCandidate(candidate) {
  if (!isAddDraftCandidate(candidate)) return false;
  return !tuneHasMeaningfulAddContent(candidate.tune);
}

/**
 * Drop the live blank Add draft when notation imports should replace it,
 * not sit beside it in the review queue.
 */
export function sessionWithoutIdleAddDraft(session) {
  if (!session || !Array.isArray(session.candidates)) return session;
  const hasIdleDraft = session.candidates.some(isIdleAddDraftCandidate);
  if (!hasIdleDraft) return session;
  const kept = session.candidates.filter(function(candidate) {
    return !isIdleAddDraftCandidate(candidate);
  });
  if (kept.length === 0) return null;
  const removedBeforeIndex = session.candidates
    .slice(0, Math.max(0, session.index || 0))
    .filter(isIdleAddDraftCandidate).length;
  const nextIndex = Math.max(0, Math.min(
    (session.index || 0) - removedBeforeIndex,
    kept.length - 1
  ));
  return Object.assign({}, session, {
    candidates: kept,
    index: nextIndex,
    mergeIndex: null,
    entryMode: kept.length && session.entryMode === 'add' && !kept.some(isAddDraftCandidate)
      ? 'import'
      : session.entryMode,
    phase: session.phase === 'enrichment' ? 'enrichment' : 'identify',
    step: 'review',
  });
}

/**
 * Open a blank Add draft without wiping an in-progress Review queue.
 * Resumes an existing Add draft when present; otherwise prepends a new blank.
 */
export function ensureBlankAddSession(session, options) {
  const opts = options || {};
  const blank = createBlankAddCandidate({
    book: opts.book,
    tags: opts.tags,
    candidateId: opts.candidateId,
  });
  if (!session || !isReviewSessionActive(session)) {
    return createImportReviewSession([blank], {
      entryMode: 'add',
      skipEnrichment: !!opts.skipEnrichment,
      addPanelMode: opts.addPanelMode,
    });
  }
  if (isAddTunesChrome(session)) {
    const current = currentCandidate(session);
    if (isAddDraftCandidate(current)) {
      // Only apply curated/bulk from deep links; do not clobber an in-dialog
      // panel choice when Add page re-opens with the default form mode.
      if (opts.addPanelMode === 'curated' || opts.addPanelMode === 'bulk') {
        if (opts.addPanelMode !== session.addPanelMode) {
          return Object.assign({}, session, { addPanelMode: opts.addPanelMode });
        }
      }
      return session;
    }
    const draftIndex = (session.candidates || []).findIndex(isAddDraftCandidate);
    if (draftIndex >= 0) {
      return Object.assign({}, session, {
        index: draftIndex,
        mergeIndex: null,
        phase: 'identify',
        step: 'review',
      });
    }
  }
  const draftIndex = (session.candidates || []).findIndex(isAddDraftCandidate);
  if (draftIndex >= 0) {
    return Object.assign({}, session, {
      index: draftIndex,
      mergeIndex: null,
      entryMode: 'add',
      phase: 'identify',
      step: 'review',
    });
  }
  return Object.assign({}, session, {
    candidates: [blank].concat(session.candidates || []),
    index: 0,
    mergeIndex: null,
    entryMode: 'add',
    addPanelMode: opts.addPanelMode === 'curated' || opts.addPanelMode === 'bulk' ? opts.addPanelMode : 'form',
    phase: 'identify',
    step: 'review',
  });
}

/**
 * Drop the live Add draft (e.g. Cancel) while keeping parked Review items.
 * Returns null when nothing remains.
 */
export function removeAddDraftFromSession(session) {
  if (!session || !Array.isArray(session.candidates)) return null;
  const kept = session.candidates.filter(function(candidate) {
    return !isAddDraftCandidate(candidate);
  });
  if (kept.length === 0) return null;
  const nextIndex = Math.min(session.index || 0, kept.length - 1);
  return Object.assign({}, session, {
    candidates: kept,
    index: nextIndex,
    mergeIndex: null,
    entryMode: 'import',
    phase: session.phase === 'enrichment' ? 'enrichment' : 'identify',
    step: 'review',
  });
}

/**
 * Toast / Review-page opens should show Import review, not the blank Add tunes draft.
 * Keeps the same candidates; only switches chrome and focuses a review item.
 */
export function asImportReviewChrome(session) {
  if (!session) return session;
  let next = session.entryMode === 'add'
    ? Object.assign({}, session, { entryMode: 'import' })
    : session;
  const candidates = next.candidates || [];
  const focus = candidates.findIndex(function(candidate) {
    return candidate && !isAddDraftCandidate(candidate)
      && !candidate.imported
      && !(next.importedCandidateIds && next.importedCandidateIds[candidate.id]);
  });
  if (focus >= 0 && focus !== next.index) {
    next = Object.assign({}, next, { index: focus, mergeIndex: null });
  }
  return next;
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

export function markAllCandidatesImported(session) {
  if (!session) {
    return { candidates: [], index: 0, step: 'done', phase: 'identify', mergeIndex: null, enrichmentJobs: [], importedCandidateIds: {}, sessionSummary: emptySessionSummary() };
  }
  const summary = Object.assign({}, session.sessionSummary || emptySessionSummary());
  const importedCandidateIds = Object.assign({}, session.importedCandidateIds || {});
  const candidates = (session.candidates || []).map(function(item) {
    if (!item || item.imported || importedCandidateIds[item.id]) return item;
    summary.reviewed += 1;
    if (item.mergeTargetId) summary.merged += 1;
    else summary.created += 1;
    importedCandidateIds[item.id] = true;
    return Object.assign({}, item, { imported: true });
  });
  return Object.assign({}, session, {
    candidates: candidates,
    importedCandidateIds: importedCandidateIds,
    step: 'done',
    mergeIndex: null,
    phase: 'identify',
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
    // Last/only candidate: keep it in the review queue with enrichment attached
    // (UI may close for Add → Review handoff).
    const candidates = (session.candidates || []).slice();
    const current = candidates[currentIndex];
    if (current && current.addDraft) {
      candidates[currentIndex] = Object.assign({}, current, { addDraft: false });
    }
    return Object.assign({}, session, {
      candidates: candidates,
      enrichmentJobs: enrichmentJobs || session.enrichmentJobs || [],
      index: currentIndex,
      mergeIndex: null,
      phase: 'enrichment',
      step: 'review',
      entryMode: 'import',
    });
  }
  const candidates = (session.candidates || []).slice();
  const current = candidates[currentIndex];
  if (current && current.addDraft) {
    candidates[currentIndex] = Object.assign({}, current, { addDraft: false });
  }
  return Object.assign({}, session, {
    candidates: candidates,
    enrichmentJobs: enrichmentJobs || session.enrichmentJobs || [],
    index: nextIndex,
    mergeIndex: null,
    phase: 'identify',
    step: 'review',
    entryMode: session.entryMode === 'add' ? 'import' : session.entryMode,
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
  let next = session;
  list.forEach(function(candidate) {
    next = foldIncomingCandidate(next, candidate);
  });
  return next;
}

/**
 * Fold an incoming candidate into an existing pending candidate with the same
 * mergeTargetId, or append when none matches.
 */
export function foldIncomingCandidate(session, candidate) {
  if (!candidate) return session;
  const normalized = normalizeCandidate(candidate, 0);
  if (!session) {
    return createImportReviewSession([normalized]);
  }
  const mergeTargetId = normalized.mergeTargetId ? String(normalized.mergeTargetId) : '';
  if (!mergeTargetId) {
    return Object.assign({}, session, {
      candidates: (session.candidates || []).concat([normalized]),
      step: session.step === 'done' ? 'review' : session.step,
      phase: session.step === 'done' ? 'identify' : session.phase,
      mergeIndex: null,
    });
  }

  const candidates = Array.isArray(session.candidates) ? session.candidates.slice() : [];
  const matchIndex = candidates.findIndex(function(item) {
    return item
      && !item.imported
      && item.mergeTargetId
      && String(item.mergeTargetId) === mergeTargetId
      && item.id !== normalized.id;
  });
  if (matchIndex < 0) {
    return Object.assign({}, session, {
      candidates: candidates.concat([normalized]),
      step: session.step === 'done' ? 'review' : session.step,
      phase: session.step === 'done' ? 'identify' : session.phase,
      mergeIndex: null,
    });
  }

  candidates[matchIndex] = coalesceImportCandidates(candidates[matchIndex], [normalized]);
  return Object.assign({}, session, {
    candidates: candidates,
    step: session.step === 'done' ? 'review' : session.step,
    phase: session.step === 'done' ? 'identify' : session.phase,
  });
}

/**
 * Collapse all pending candidates sharing mergeTargetId into one survivor.
 * Prefer preferCandidateId when provided, else the current session index.
 * Returns { session, survivorId, absorbedIds }.
 */
export function coalesceSessionCandidatesByMergeTarget(session, mergeTargetId, preferCandidateId) {
  if (!session || !mergeTargetId || !Array.isArray(session.candidates)) {
    return { session: session, survivorId: null, absorbedIds: [] };
  }
  const target = String(mergeTargetId);
  const indexes = [];
  session.candidates.forEach(function(candidate, index) {
    if (!candidate || candidate.imported) return;
    if (!candidate.mergeTargetId || String(candidate.mergeTargetId) !== target) return;
    indexes.push(index);
  });
  if (indexes.length <= 1) {
    return {
      session: session,
      survivorId: indexes.length === 1 ? session.candidates[indexes[0]].id : null,
      absorbedIds: [],
    };
  }

  let survivorIndex = indexes[0];
  if (preferCandidateId) {
    const preferred = indexes.find(function(index) {
      return session.candidates[index] && session.candidates[index].id === preferCandidateId;
    });
    if (preferred != null) survivorIndex = preferred;
  } else {
    const activeIndex = session.mergeIndex != null ? session.mergeIndex : session.index;
    if (indexes.indexOf(activeIndex) >= 0) survivorIndex = activeIndex;
  }

  const survivor = session.candidates[survivorIndex];
  const others = indexes
    .filter(function(index) { return index !== survivorIndex; })
    .map(function(index) { return session.candidates[index]; });
  const absorbedIds = others.map(function(item) { return item && item.id; }).filter(Boolean);
  const coalesced = coalesceImportCandidates(survivor, others);
  const remove = {};
  indexes.forEach(function(index) {
    if (index !== survivorIndex) remove[index] = true;
  });
  const nextCandidates = [];
  let newSurvivorIndex = 0;
  session.candidates.forEach(function(candidate, index) {
    if (remove[index]) return;
    if (index === survivorIndex) {
      newSurvivorIndex = nextCandidates.length;
      nextCandidates.push(coalesced);
      return;
    }
    nextCandidates.push(candidate);
  });

  return {
    session: Object.assign({}, session, {
      candidates: nextCandidates,
      index: newSurvivorIndex,
      mergeIndex: session.mergeIndex != null ? newSurvivorIndex : null,
      step: nextCandidates.length ? (session.step === 'done' ? 'review' : session.step) : 'done',
      phase: session.step === 'done' && nextCandidates.length ? 'identify' : session.phase,
    }),
    survivorId: coalesced.id,
    absorbedIds: absorbedIds,
  };
}

/**
 * Drop or trim review candidates linked to a field-lookup job.
 * Multi-job coalesced candidates lose only that job link until none remain.
 */
export function removeImportReviewCandidatesByFieldLookupJobId(session, jobId) {
  if (!session || !jobId || !Array.isArray(session.candidates)) return session;
  const target = String(jobId);
  let changed = false;
  const remaining = [];
  session.candidates.forEach(function(candidate) {
    const ids = fieldLookupJobIdsForCandidate(candidate);
    if (ids.indexOf(target) < 0) {
      remaining.push(candidate);
      return;
    }
    changed = true;
    const nextIds = ids.filter(function(id) { return id !== target; });
    if (nextIds.length === 0) return;
    const kinds = fieldLookupKindsForCandidate(candidate).slice();
    remaining.push(Object.assign({}, candidate, {
      fieldLookupJobIds: nextIds,
      fieldLookupJobId: nextIds[0] || null,
      fieldLookupKinds: kinds,
      fieldLookupKind: kinds[0] || null,
    }));
  });
  if (!changed) return session;
  if (remaining.length === 0) {
    return Object.assign({}, session, {
      candidates: [],
      index: 0,
      mergeIndex: null,
      phase: 'identify',
      step: 'done',
    });
  }
  const nextIndex = Math.min(session.index || 0, remaining.length - 1);
  return Object.assign({}, session, {
    candidates: remaining,
    index: nextIndex,
    mergeIndex: null,
    step: session.step === 'done' ? 'review' : session.step,
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
    artist: candidate.tune ? primaryArtist(candidate.tune) : '',
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
