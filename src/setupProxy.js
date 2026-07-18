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
  '/midi2xml',
  '/abc2xml',
  '/transcribe-sheet-image',
  '/search-images',
  '/textsearch_index.json',
]);

const STATIC_RESOURCE_PREFIXES = [
  '/scrape/',
  '/abcresources/',
  '/midi-js-soundfonts/',
];

function shouldProxyResolver(pathname) {
  if (RESOLVER_PATHS.has(pathname)) return true;
  if (pathname.startsWith('/youtube/')) return true;
  if (pathname.startsWith('/stems/')) return true;
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
