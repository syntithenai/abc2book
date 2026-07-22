import { mergeIncomingBooksOntoTune } from './importDuplicateBooks';
import { mergeImportedLinks } from './importReviewFieldUtils';
import { mergeBibliographicList } from './tuneBibliographicUtils';
import { getTuneFiles } from './tuneFiles';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Union sheet snapshot metadata (tuneFiles) by file id.
 */
export function unionTuneFileMeta(existingFiles, incomingFiles) {
  const result = Array.isArray(existingFiles) ? existingFiles.slice() : [];
  const seen = {};
  result.forEach(function(file) {
    if (file && file.id) seen[file.id] = true;
  });
  (Array.isArray(incomingFiles) ? incomingFiles : []).forEach(function(file) {
    if (!file || !file.id || seen[file.id]) return;
    seen[file.id] = true;
    result.push(cloneJson(file));
  });
  return result;
}

/**
 * Always union links, books, tags, bibliographic lists, and sheet snapshots from
 * each source tune onto localTune. Mutates and returns localTune.
 */
export function mergeTuneCollectionExtras(localTune) {
  if (!localTune) return localTune;
  const sources = Array.prototype.slice.call(arguments, 1).filter(Boolean);
  const preferredActiveFile = localTune.activeFile || '';

  sources.forEach(function(incomingTune) {
    localTune.links = mergeImportedLinks(localTune.links, incomingTune.links);
    mergeIncomingBooksOntoTune(localTune, incomingTune);
    localTune.artists = mergeBibliographicList(localTune.artists, incomingTune.artists);
    localTune.aliases = mergeBibliographicList(localTune.aliases, incomingTune.aliases);
    localTune.tuneFiles = unionTuneFileMeta(getTuneFiles(localTune), getTuneFiles(incomingTune));
  });

  if (preferredActiveFile) {
    const stillPresent = localTune.tuneFiles.some(function(file) {
      return file && file.id === preferredActiveFile;
    });
    localTune.activeFile = stillPresent ? preferredActiveFile : '';
  }

  if (!localTune.activeFile) {
    sources.some(function(incomingTune) {
      if (!incomingTune.activeFile) return false;
      const hasFile = localTune.tuneFiles.some(function(file) {
        return file && file.id === incomingTune.activeFile;
      });
      if (hasFile) {
        localTune.activeFile = incomingTune.activeFile;
        return true;
      }
      return false;
    });
  }

  return localTune;
}
