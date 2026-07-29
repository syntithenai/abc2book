const { createProxyMiddleware } = require('http-proxy-middleware');

const RESOLVER_PATHS = new Set([
  '/health',
  '/proxy-audio',
  '/transcribe',
  '/detect-playback-region',
  '/voice-command',
  '/detect-chords',
  '/analyze-media',
  '/search-lyrics',
  '/lyrics-dictionary',
  '/lyrics-thesaurus',
  '/lyrics-rhyme',
  '/lyrics-reverse-dictionary',
  '/lyrics-phrases',
  '/lyrics-alliteration',
  '/search-chords',
  '/search-notation',
  '/research-tune-background',
  '/generate-feed-articles',
  '/generate-feed-quizzes',
  '/enrich-feed-sources',
  '/help-query',
  '/discover-composer',
  '/discover-genre',
  '/separate-stems',
  '/generate-practice-track',
  '/midi2xml',
  '/midi2analyze',
  '/midi2abc',
  '/abc2xml',
  '/transcribe-sheet-image',
  '/extract-sheet-metadata',
  '/search-images',
  '/search-bandcamp',
  '/search-internet-archive',
  '/search-europeana',
  '/search-loc-audio',
  '/textsearch_index.json',
]);

const STATIC_RESOURCE_PREFIXES = [
  '/scrape/',
  '/abcresources/',
  '/midi-js-soundfonts/',
];

function isMusicCollectionApiPath(pathname) {
  if (pathname.startsWith('/music-collection/')) return true;
  if (pathname.startsWith('/music-collection-art/')) return true;
  if (pathname.startsWith('/music-collection-')) return true;
  if (pathname.startsWith('/browse-music-collection')) return true;
  if (pathname === '/search-music-collection') return true;
  if (pathname === '/rebuild-music-collection-index') return true;
  return false;
}

function shouldProxyResolver(pathname) {
  if (RESOLVER_PATHS.has(pathname)) return true;
  if (pathname.startsWith('/youtube/')) return true;
  if (pathname.startsWith('/bandcamp/')) return true;
  if (pathname.startsWith('/internet-archive/')) return true;
  if (pathname.startsWith('/loc/')) return true;
  if (isMusicCollectionApiPath(pathname)) return true;
  if (pathname.startsWith('/generate-practice-track')) return true;
  if (pathname.startsWith('/stems/')) return true;
  if (pathname.startsWith('/snapcast-playback/')) return true;
  if (pathname.startsWith('/cast-playback/')) return true;
  if (pathname.startsWith('/auth/google/')) return true;
  for (let i = 0; i < STATIC_RESOURCE_PREFIXES.length; i++) {
    if (pathname.startsWith(STATIC_RESOURCE_PREFIXES[i])) return true;
  }
  return false;
}

module.exports = function(app) {
  app.use(
    createProxyMiddleware(shouldProxyResolver, {
      target: 'http://localhost:8787',
      changeOrigin: true,
    })
  );
};
