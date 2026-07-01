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
  '/search-chords',
  '/search-notation',
  '/research-tune-background',
  '/separate-stems',
  '/midi2xml',
]);

function shouldProxyResolver(pathname) {
  if (RESOLVER_PATHS.has(pathname)) return true;
  if (pathname.startsWith('/youtube/')) return true;
  if (pathname.startsWith('/stems/')) return true;
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
