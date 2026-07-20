import React from 'react';
import { toast } from 'react-toastify';
import { findTuneByImportHash } from './tuneCollectionMatch';
import { importTitlesMatchForDeduping, tuneImportTitle } from './importTitleMatch';

let duplicateToastId = null;

export function dismissContentHashDuplicateToast() {
  if (duplicateToastId != null) {
    try { toast.dismiss(duplicateToastId); } catch (e) {}
    duplicateToastId = null;
  }
}

/**
 * @param {Array} candidates
 * @param {object} tunebook
 * @param {object} tunesHash
 * @param {object} [tunes] library map — when provided, hash hits also require matching titles
 */
export function detectContentHashDuplicates(candidates, tunebook, tunesHash, tunes) {
  const duplicates = [];
  const nonDuplicates = [];
  if (!candidates || !tunebook || !tunesHash) {
    return { duplicates: [], nonDuplicates: candidates || [] };
  }

  candidates.forEach(function(candidate) {
    const tune = candidate.tune;
    if (!tune) {
      nonDuplicates.push(candidate);
      return;
    }
    const hash = tunebook.abcTools.getTuneImportHash(tune);
    const existingId = findTuneByImportHash(tunesHash, hash);
    if (existingId) {
      const existing = tunes && tunes[existingId] ? tunes[existingId] : null;
      if (existing && !importTitlesMatchForDeduping(tuneImportTitle(tune), tuneImportTitle(existing))) {
        nonDuplicates.push(candidate);
        return;
      }
      // No library tune available to compare titles: still treat as hash duplicate
      // (legacy call sites); prefer passing tunes when possible.
      duplicates.push(Object.assign({}, candidate, {
        contentHashDuplicate: true,
        mergeTargetId: existingId,
      }));
    } else {
      nonDuplicates.push(candidate);
    }
  });

  return { duplicates: duplicates, nonDuplicates: nonDuplicates };
}

export function showContentHashDuplicateToast(options) {
  const opts = options || {};
  dismissContentHashDuplicateToast();
  const count = opts.count || 0;
  if (count <= 0) return null;

  duplicateToastId = toast.info(
    function(renderProps) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75em', flexWrap: 'wrap' }}>
          <span>{count} imported item{count === 1 ? '' : 's'} look like tunes already in your collection.</span>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={function() {
              dismissContentHashDuplicateToast();
              if (typeof opts.onReview === 'function') opts.onReview();
              if (typeof renderProps.closeToast === 'function') renderProps.closeToast();
            }}
          >
            Review merges
          </button>
        </div>
      );
    },
    {
      autoClose: false,
      closeOnClick: false,
      onClose: function() {
        duplicateToastId = null;
      },
    }
  );
  return duplicateToastId;
}
