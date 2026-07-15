import { enrichImportCandidate } from './importReviewEnrichment';
import { primaryArtist } from './tuneBibliographicUtils';

function makeJobId() {
  return 'import-enrich-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}

export function createEnrichmentJob(candidate) {
  return {
    id: makeJobId(),
    candidateId: candidate.id,
    title: candidate.tune && candidate.tune.name ? candidate.tune.name : '',
    artist: candidate.tune ? primaryArtist(candidate.tune) : '',
    status: 'awaiting',
    progress: 0,
    message: '',
    error: null,
    skipReason: null,
    enrichedTune: null,
    cancelled: false,
  };
}

export function findEnrichmentJob(jobs, candidateId) {
  if (!Array.isArray(jobs)) return null;
  return jobs.find(function(job) { return job.candidateId === candidateId; }) || null;
}

export function enrichmentJobsForSession(candidates) {
  return (Array.isArray(candidates) ? candidates : []).map(function(candidate) {
    return createEnrichmentJob(candidate);
  });
}

export function patchEnrichmentJob(jobs, jobId, patch) {
  return jobs.map(function(job) {
    if (job.id !== jobId) return job;
    return Object.assign({}, job, patch);
  });
}

export function startEnrichmentJob(jobs, jobId) {
  return patchEnrichmentJob(jobs, jobId, {
    status: 'pending',
    message: 'Queued for enrichment…',
    skipReason: null,
  });
}

export function skipEnrichmentJob(jobs, jobId, reason) {
  return jobs.map(function(job) {
    if (job.id !== jobId) return job;
    if (job.status === 'done' || job.status === 'skipped') return job;
    return Object.assign({}, job, {
      status: 'skipped',
      skipReason: reason || 'skipped-by-user',
      message: '',
      cancelled: job.status === 'running',
    });
  });
}

export function skipAllPendingEnrichmentJobs(jobs, reason) {
  return jobs.map(function(job) {
    if (job.status !== 'pending' && job.status !== 'awaiting') return job;
    return Object.assign({}, job, {
      status: 'skipped',
      skipReason: reason || 'skipped-all',
      message: '',
    });
  });
}

export function clearEnrichmentQueue(jobs) {
  return jobs.map(function(job) {
    if (job.status === 'running') return job;
    if (job.status === 'done') return job;
    return Object.assign({}, job, {
      status: 'skipped',
      skipReason: 'queue-cleared',
      message: '',
      cancelled: false,
    });
  });
}

export function enrichmentSummary(jobs) {
  const list = Array.isArray(jobs) ? jobs : [];
  return {
    awaiting: list.filter(function(job) { return job.status === 'awaiting'; }).length,
    pending: list.filter(function(job) { return job.status === 'pending'; }).length,
    running: list.filter(function(job) { return job.status === 'running'; }).length,
    done: list.filter(function(job) { return job.status === 'done'; }).length,
    skipped: list.filter(function(job) { return job.status === 'skipped'; }).length,
    error: list.filter(function(job) { return job.status === 'error'; }).length,
    ready: list.filter(function(job) {
      return job.status === 'done' && job.enrichedTune;
    }).length,
  };
}

export function candidateForJob(session, job) {
  if (!session || !job) return null;
  return session.candidates.find(function(candidate) {
    return candidate.id === job.candidateId;
  }) || null;
}

export function mergeCandidateWithEnrichment(candidate, job) {
  if (!candidate) return null;
  const base = Object.assign({}, candidate.tune);
  if (job && job.enrichedTune) {
    return Object.assign({}, base, job.enrichedTune, {
      id: base.id || (job.enrichedTune && job.enrichedTune.id),
      name: candidate.tune.name || job.enrichedTune.name,
      composer: candidate.tune.composer || job.enrichedTune.composer,
    });
  }
  return base;
}

export async function runEnrichmentJob(job, session, context) {
  const candidate = candidateForJob(session, job);
  if (!candidate) {
    throw new Error('Import candidate not found for enrichment job');
  }

  const abortController = new AbortController();
  const enrichmentResult = await enrichImportCandidate(candidate, {
    tunebook: context.tunebook,
    abcjsParser: context.abcjsParser,
    accessToken: context.accessToken,
    driveApi: context.driveApi,
    canAnalyzeMedia: context.canAnalyzeMedia,
    signal: abortController.signal,
    onProgress: function(message, progress) {
      if (typeof context.onProgress === 'function') {
        context.onProgress(job.id, message, progress);
      }
    },
  });

  return {
    enrichedTune: enrichmentResult.tune,
    composerCandidates: enrichmentResult.composerCandidates || [],
    abortController: abortController,
  };
}

export function isEnrichmentPhaseComplete(jobs) {
  const summary = enrichmentSummary(jobs);
  return summary.pending === 0 && summary.running === 0 && summary.awaiting === 0;
}

export function nextReadyJob(jobs, importedCandidateIds) {
  const imported = importedCandidateIds || {};
  return (Array.isArray(jobs) ? jobs : []).find(function(job) {
    return job.status === 'done'
      && job.enrichedTune
      && !imported[job.candidateId];
  }) || null;
}
