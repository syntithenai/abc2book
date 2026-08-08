/**
 * Prepare bulk text lines into review candidates with optional cautious media preselection.
 */
import { parseBulkLine, formatBulkLine, bulkLinesToCandidates } from './bulkListFormat';
import {
  searchYouTubeVideos,
  fetchYouTubeOembedMetadata,
} from './youtubeSearchClient';
import { searchMusicCollection } from './musicCollectionSearchClient';
import { parseTitleArtistFromYouTubeLabel } from './youtubeTitleParse';
import { retidyBulkText } from './bulkTextTidy';
import { applyIntakePolicyToCandidates } from './importIntakePolicy';

function normalizeTitle(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstTuneLink(tune) {
  if (!tune || !Array.isArray(tune.links)) return '';
  for (let i = 0; i < tune.links.length; i += 1) {
    const link = tune.links[i] && tune.links[i].link ? String(tune.links[i].link).trim() : '';
    if (link) return link;
  }
  return '';
}

function mediaCandidateArtist(candidate) {
  return String((candidate && candidate.artist) || '').trim();
}

function mediaCandidateDescription(candidate) {
  return String((candidate && candidate.description) || '').trim();
}

/**
 * Confidence for auto-selecting a music collection hit (tag-backed metadata).
 */
export function collectionAutoselectConfidence(queryTitle, queryArtist, candidate) {
  if (!candidate || !candidate.title) return { confidence: 'low', score: 0 };
  const qTitle = normalizeTitle(queryTitle);
  const cTitle = normalizeTitle(candidate.title);
  if (!qTitle || !cTitle) return { confidence: 'low', score: 0 };

  const qTokens = qTitle.split(' ').filter(Boolean);
  const hits = qTokens.filter(function(t) { return cTitle.indexOf(t) >= 0; }).length;
  const ratio = qTokens.length ? hits / qTokens.length : 0;
  let score = ratio;

  if (queryArtist) {
    const artist = normalizeTitle(queryArtist);
    const candidateArtist = normalizeTitle(mediaCandidateArtist(candidate));
    const description = normalizeTitle(mediaCandidateDescription(candidate));
    if (artist && (candidateArtist.indexOf(artist) >= 0 || description.indexOf(artist) >= 0 || cTitle.indexOf(artist) >= 0)) {
      score += 0.25;
    } else if (artist) {
      score -= 0.15;
    }
  }

  if (cTitle === qTitle || cTitle.indexOf(qTitle) >= 0) score += 0.2;

  if (score >= 0.9) return { confidence: 'high', score: score };
  if (score >= 0.7) return { confidence: 'medium', score: score };
  return { confidence: 'low', score: score };
}

/**
 * Confidence for auto-selecting the first YouTube result.
 * Only high confidence when title tokens overlap strongly and there is a single clear hit
 * or the first result title contains the query title.
 */
export function youtubeAutoselectConfidence(queryTitle, queryArtist, video) {
  if (!video || !video.title) return { confidence: 'low', score: 0 };
  const qTitle = normalizeTitle(queryTitle);
  const vTitle = normalizeTitle(video.title);
  if (!qTitle || !vTitle) return { confidence: 'low', score: 0 };

  const qTokens = qTitle.split(' ').filter(Boolean);
  const hits = qTokens.filter(function(t) { return vTitle.indexOf(t) >= 0; }).length;
  const ratio = qTokens.length ? hits / qTokens.length : 0;
  let score = ratio;

  if (queryArtist) {
    const artist = normalizeTitle(queryArtist);
    if (artist && (vTitle.indexOf(artist) >= 0 || normalizeTitle(video.description || '').indexOf(artist) >= 0)) {
      score += 0.2;
    }
  }

  if (vTitle === qTitle || vTitle.indexOf(qTitle) >= 0) score += 0.25;

  if (score >= 0.85) return { confidence: 'high', score: score };
  if (score >= 0.55) return { confidence: 'medium', score: score };
  return { confidence: 'low', score: score };
}

function applyAutoselectedLink(tune, pick, source) {
  const nextTune = Object.assign({}, tune || {}, {
    links: [{
      link: pick.link,
      title: pick.title || '',
      startAt: '',
      endAt: '',
      source: source || pick.source || '',
      collectionAutoselected: source === 'music-collection',
      youtubeAutoselected: source === 'youtube',
    }],
  });
  if (!String(nextTune.name || '').trim() && pick.title) {
    nextTune.name = pick.title;
  }
  if (!String(nextTune.composer || '').trim() && pick.artist) {
    nextTune.composer = pick.artist;
  }
  return nextTune;
}

async function enrichTuneFromYouTubeLink(tune, link, fetchMeta) {
  if (!link || !/youtu\.?be|youtube\.com/i.test(link)) {
    return { tune: tune, enriched: false };
  }
  const needsTitle = !String((tune && tune.name) || '').trim();
  const needsArtist = !String((tune && tune.composer) || '').trim();
  if (!needsTitle && !needsArtist) {
    return { tune: tune, enriched: false };
  }
  const fetchFn = typeof fetchMeta === 'function' ? fetchMeta : fetchYouTubeOembedMetadata;
  try {
    const meta = await fetchFn(link);
    if (!meta || !meta.ok) return { tune: tune, enriched: false };
    const parsed = parseTitleArtistFromYouTubeLabel(meta.title, meta.authorName);
    const next = Object.assign({}, tune || {});
    let enriched = false;
    if (needsTitle && parsed && parsed.title) {
      next.name = parsed.title;
      enriched = true;
    }
    if (needsArtist && parsed && parsed.artist) {
      next.composer = parsed.artist;
      enriched = true;
    }
    return { tune: next, enriched: enriched };
  } catch (e) {
    return { tune: tune, enriched: false };
  }
}

function emitPrepareProgress(options, payload) {
  if (typeof options.onProgress === 'function') {
    options.onProgress(payload);
  }
}

function buildPrepareProgressMessage(index, total, title, step) {
  const prefix = 'Preparing ' + index + ' of ' + total + ': ' + title;
  if (!step) return prefix + '…';
  return prefix + ' — ' + step + '…';
}

function reportPrepareProgress(options, index, total, title, step) {
  emitPrepareProgress(options, {
    index: index,
    total: total,
    title: title,
    step: step || '',
    message: buildPrepareProgressMessage(index, total, title, step),
  });
}

/**
 * Build prepared candidates from bulk text. Optionally search collection then YouTube for lines without a URL.
 */
export async function prepareBulkTextQueue(text, options) {
  const opts = options || {};
  const tidied = retidyBulkText(text, opts);
  // All non-empty lines (import filtering happens on Import, not Prepare).
  const lines = String(tidied || '').split(/\r?\n/).map(function(l) { return l.trim(); }).filter(Boolean);
  const base = bulkLinesToCandidates(lines, opts.tunebook, opts.book);
  const searchMedia = opts.searchYouTube !== false;
  const prepared = [];
  const total = base.length;

  for (let i = 0; i < base.length; i += 1) {
    const candidate = Object.assign({}, base[i], {
      skipEnrich: true,
      mergeMode: 'suggestOnly',
      mergeStatus: 'new',
    });
    let tune = candidate.tune || {};
    const hasLink = !!firstTuneLink(tune);
    const lineTitle = String(tune.name || '').trim() || 'Untitled';

    reportPrepareProgress(opts, i + 1, total, lineTitle, '');

    if (!hasLink && searchMedia && tune.name) {
      let autoselected = false;
      try {
        reportPrepareProgress(opts, i + 1, total, lineTitle, 'searching collection');
        const collectionResult = await searchMusicCollection({
          query: [tune.name, tune.composer].filter(Boolean).join(' '),
          title: tune.name,
          artist: tune.composer || '',
          maxResults: 5,
          accessToken: opts.accessToken || opts.token,
          signal: opts.signal,
        });
        let collectionList = [];
        if (collectionResult && Array.isArray(collectionResult.candidates)) collectionList = collectionResult.candidates;
        else if (collectionResult && collectionResult.link) collectionList = [collectionResult];
        candidate.collectionResults = collectionList;
        if (collectionList.length) {
          const collectionConf = collectionAutoselectConfidence(tune.name, tune.composer, collectionList[0]);
          candidate.collectionConfidence = collectionConf.confidence;
          if (collectionConf.confidence === 'high') {
            tune = applyAutoselectedLink(tune, collectionList[0], 'music-collection');
            candidate.collectionUrl = collectionList[0].link;
            candidate.collectionAutoselected = true;
            candidate.mediaMetaEnriched = true;
            autoselected = true;
          }
        }
      } catch (e) {
        candidate.collectionSearchError = e && e.message ? e.message : 'Music collection search failed';
      }

      if (!autoselected) {
        try {
          reportPrepareProgress(opts, i + 1, total, lineTitle, 'searching YouTube');
          const query = [tune.name, tune.composer].filter(Boolean).join(' ');
          const result = await searchYouTubeVideos({
            query: query,
            maxResults: 5,
            artist: tune.composer || '',
            signal: opts.signal,
          });
          let list = [];
          if (result && Array.isArray(result.candidates)) list = result.candidates;
          else if (result && result.link) list = [result];

          candidate.youtubeResults = list;
          if (list.length) {
            const conf = youtubeAutoselectConfidence(tune.name, tune.composer, list[0]);
            candidate.youtubeConfidence = conf.confidence;
            if (conf.confidence === 'high') {
              tune = applyAutoselectedLink(tune, list[0], 'youtube');
              const parsed = parseTitleArtistFromYouTubeLabel(list[0].title, '');
              if (!String(tune.name || '').trim() && parsed.title) tune.name = parsed.title;
              if (!String(tune.composer || '').trim() && parsed.artist) tune.composer = parsed.artist;
              candidate.youtubeUrl = list[0].link;
              candidate.youtubeAutoselected = true;
              candidate.mediaMetaEnriched = !!(parsed.title || parsed.artist);
            }
          }
        } catch (e) {
          candidate.youtubeSearchError = e && e.message ? e.message : 'YouTube search failed';
        }
      }
    } else if (hasLink) {
      candidate.youtubeConfidence = 'given';
      reportPrepareProgress(opts, i + 1, total, lineTitle, 'enriching from link');
      const enriched = await enrichTuneFromYouTubeLink(
        tune,
        firstTuneLink(tune),
        opts.fetchYouTubeOembedMetadata
      );
      tune = enriched.tune;
      if (enriched.enriched) candidate.youtubeMetaEnriched = true;
    }

    candidate.tune = tune;
    prepared.push(candidate);
  }

  return applyIntakePolicyToCandidates(prepared);
}

export function bulkTextToPreparedLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(function(line) { return parseBulkLine(line); })
    .filter(function(row) { return row && (row.title || row.link); })
    .map(formatBulkLine);
}
