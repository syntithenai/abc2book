const { createProxyMiddleware } = require('http-proxy-middleware');

function shouldProxyResolver(pathname) {
  return pathname === '/health'
    || pathname.startsWith('/youtube/')
    || pathname === '/proxy-audio'
    || pathname === '/transcribe'
    || pathname === '/detect-chords'
    || pathname === '/analyze-media';
}

module.exports = function(app) {
  app.use(
    createProxyMiddleware(shouldProxyResolver, {
      target: 'http://localhost:8787',
      changeOrigin: true,
    })
  );
};
