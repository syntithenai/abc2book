/**
 * Prepare bulk text lines into review candidates with optional cautious YouTube preselection.
 */
import { parseBulkLine, formatBulkLine, bulkLinesToCandidates } from './bulkListFormat';
import {
  searchYouTubeVideos,
  fetchYouTubeOembedMetadata,
} from './youtubeSearchClient';
import { parseTitleArtistFromYouTubeLabel } from './youtubeTitleParse';
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

/**
 * Build prepared candidates from bulk text. Optionally search YouTube for lines without a URL.
 * Autoselect only when confidence is high. When a YouTube URL is already present, fill
 * missing title/artist from oEmbed when possible.
 */
export async function prepareBulkTextQueue(text, options) {
  const opts = options || {};
  const lines = String(text || '').split(/\r?\n/).map(function(l) { return l.trim(); }).filter(Boolean);
  const base = bulkLinesToCandidates(lines, opts.tunebook, opts.book);
  const searchYouTube = opts.searchYouTube !== false && typeof searchYouTubeVideos === 'function';
  const prepared = [];

  for (let i = 0; i < base.length; i += 1) {
    const candidate = Object.assign({}, base[i], {
      skipEnrich: true,
      mergeMode: 'suggestOnly',
      mergeStatus: 'new',
    });
    let tune = candidate.tune || {};
    const hasLink = !!firstTuneLink(tune);

    if (!hasLink && searchYouTube && tune.name) {
      try {
        const query = [tune.name, tune.composer].filter(Boolean).join(' ');
        const result = await searchYouTubeVideos({
          query: query,
          maxResults: 5,
          artist: tune.composer || '',
        });
        let list = [];
        if (result && Array.isArray(result.candidates)) list = result.candidates;
        else if (result && result.link) list = [result];

        candidate.youtubeResults = list;
        if (list.length) {
          const conf = youtubeAutoselectConfidence(tune.name, tune.composer, list[0]);
          candidate.youtubeConfidence = conf.confidence;
          if (conf.confidence === 'high') {
            const pick = list[0];
            tune = Object.assign({}, tune, {
              links: [{
                link: pick.link,
                title: pick.title || '',
                startAt: '',
                endAt: '',
                youtubeAutoselected: true,
              }],
            });
            const parsed = parseTitleArtistFromYouTubeLabel(pick.title, '');
            if (!String(tune.name || '').trim() && parsed.title) tune.name = parsed.title;
            if (!String(tune.composer || '').trim() && parsed.artist) tune.composer = parsed.artist;
            candidate.youtubeUrl = pick.link;
            candidate.youtubeAutoselected = true;
            candidate.youtubeMetaEnriched = !!(parsed.title || parsed.artist);
          }
        }
      } catch (e) {
        candidate.youtubeSearchError = e && e.message ? e.message : 'YouTube search failed';
      }
    } else if (hasLink) {
      candidate.youtubeConfidence = 'given';
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
