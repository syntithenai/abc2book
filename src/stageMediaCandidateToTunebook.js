import { Capacitor } from '@capacitor/core';
import { requestImportReview, showImportReviewUi } from './importReviewSessionStore';
import { asIndependentReviewCandidate, freshTuneId } from './importReviewCandidateUtils';
import { isDeviceFileResult, isMusicCollectionResult } from './mediaLinkSearchDisplay';
import { openAndroidAudioFileForImport } from './androidLocalMediaSearchClient';
import { buildMediaFileImportCandidate } from './mediaImportCandidates';

function buildCollectionTuneStub(candidate, options) {
  const opts = options || {};
  const title = String(candidate.title || 'Untitled').trim() || 'Untitled';
  const artist = String(candidate.artist || '').trim();
  const link = {
    link: candidate.link || '',
    title: title,
    source: 'music-collection',
  };
  if (candidate.image) link.image = candidate.image;
  return {
    tune: {
      id: freshTuneId(),
      name: title,
      composer: artist,
      books: opts.book ? [opts.book] : [],
      tags: Array.isArray(opts.tags) ? opts.tags.slice() : [],
      links: [link],
    },
    sourceKind: 'media-link',
    // Library audio is already present; skip lyrics/chords/notation auto-enrich.
    skipEnrich: true,
  };
}

async function buildDeviceFileCandidate(candidate, options) {
  const opts = options || {};
  const imported = await openAndroidAudioFileForImport(candidate.uri);
  const filePath = imported && imported.filePath ? imported.filePath : '';
  if (!filePath) throw new Error('Could not read device audio file');
  const fileName = imported.name || candidate.title || 'audio';
  const fileUrl = Capacitor.convertFileSrc(filePath);
  const response = await fetch(fileUrl);
  const blob = await response.blob();
  const file = new File([blob], fileName, { type: imported.mime || blob.type || 'audio/*' });
  const draft = {
    tune: {
      name: candidate.title || fileName,
      composer: candidate.artist || '',
      books: opts.book ? [opts.book] : [],
      tags: Array.isArray(opts.tags) ? opts.tags.slice() : [],
    },
  };
  return buildMediaFileImportCandidate(file, {
    draft: draft,
    uploadToDrive: false,
    sourceUrl: candidate.uri,
  });
}

export async function stageMediaCandidateToTunebook(candidate, options) {
  const opts = options || {};
  if (!candidate) throw new Error('Missing media candidate');

  if (isMusicCollectionResult(candidate)) {
    const reviewCandidate = asIndependentReviewCandidate(
      buildCollectionTuneStub(candidate, opts),
      { tune: { books: opts.book ? [opts.book] : [], tags: opts.tags || [] } }
    );
    requestImportReview([reviewCandidate], {
      entryMode: 'add',
      book: opts.book || '',
      tags: Array.isArray(opts.tags) ? opts.tags : [],
      addPanelMode: 'form',
    });
    showImportReviewUi();
    return reviewCandidate;
  }

  if (isDeviceFileResult(candidate) && candidate.uri) {
    const mediaCandidate = await buildDeviceFileCandidate(candidate, opts);
    const reviewCandidate = asIndependentReviewCandidate(mediaCandidate, {
      tune: {
        books: opts.book ? [opts.book] : [],
        tags: opts.tags || [],
      },
    });
    requestImportReview([reviewCandidate], {
      entryMode: 'add',
      book: opts.book || '',
      tags: Array.isArray(opts.tags) ? opts.tags : [],
      addPanelMode: 'form',
    });
    showImportReviewUi();
    return reviewCandidate;
  }

  throw new Error('Unsupported media source');
}

export function stageMediaCandidatesToTunebook(candidates, options) {
  const opts = options || {};
  const list = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  if (!list.length) return [];

  const reviewCandidates = list.map(function(candidate) {
    if (!isMusicCollectionResult(candidate)) {
      throw new Error('Unsupported media source');
    }
    return asIndependentReviewCandidate(
      buildCollectionTuneStub(candidate, opts),
      { tune: { books: opts.book ? [opts.book] : [], tags: opts.tags || [] } }
    );
  });

  requestImportReview(reviewCandidates, {
    entryMode: 'add',
    book: opts.book || '',
    tags: Array.isArray(opts.tags) ? opts.tags : [],
    addPanelMode: 'form',
  });
  showImportReviewUi();
  return reviewCandidates;
}
