const path = require('path');
const fs = require('fs');
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const CLOUD_RESOLVER_TARGET =
  process.env.REACT_APP_BILLING_PROXY_TARGET ||
  process.env.REACT_APP_CLOUD_RESOLVER_URL ||
  'https://tunebook-resolver-light-ytrp5enyda-ts.a.run.app';

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
  '/search-similar-melodies',
  '/research-tune-background',
  '/generate-feed-articles',
  '/generate-feed-quizzes',
  '/enrich-feed-sources',
  '/help-query',
  '/discover-composer',
  '/discover-genre',
  '/separate-stems',
  '/generate-practice-track',
  '/generate-audio',
  '/render-midi',
  '/midi2xml',
  '/midi2analyze',
  '/midi2abc',
  '/abc2xml',
  '/transcribe-sheet-image',
  '/extract-sheet-metadata',
  '/split-sheet-page',
  '/search-images',
  '/search-bandcamp',
  '/search-internet-archive',
  '/search-europeana',
  '/search-loc-audio',
  '/textsearch_index.json',
]);

// Prefer the local checkout over the resolver — MIDI samples must not hang when
// localhost:8787 is down (failed loads are cached forever by abcjs).
const LOCAL_STATIC_MOUNTS = [
  {
    urlPath: '/midi-js-soundfonts',
    dir: path.join(__dirname, '..', 'midi-js-soundfonts'),
  },
  {
    urlPath: '/scrape',
    dir: path.join(__dirname, '..', 'scrape'),
  },
  {
    urlPath: '/abcresources',
    dir: path.join(__dirname, '..', 'abcresources'),
  },
];

const STATIC_RESOURCE_PREFIXES = [
  '/scrape/',
  '/abcresources/',
  '/midi-js-soundfonts/',
];

function isMusicCollectionApiPath(pathname) {
  if (pathname.startsWith('/music-collection-by-entry/')) return true;
  if (pathname.startsWith('/music-collection/')) return true;
  if (pathname.startsWith('/music-collection-art/')) return true;
  if (pathname.startsWith('/music-collection-')) return true;
  if (pathname.startsWith('/browse-music-collection')) return true;
  if (pathname === '/search-music-collection') return true;
  if (pathname === '/rebuild-music-collection-index') return true;
  return false;
}

function isLocallyServedStaticPath(pathname) {
  for (let i = 0; i < LOCAL_STATIC_MOUNTS.length; i += 1) {
    const mount = LOCAL_STATIC_MOUNTS[i];
    if (!fs.existsSync(mount.dir)) continue;
    if (pathname === mount.urlPath || pathname.startsWith(mount.urlPath + '/')) {
      return true;
    }
  }
  return false;
}

function shouldProxyResolver(pathname) {
  if (isLocallyServedStaticPath(pathname)) return false;
  if (RESOLVER_PATHS.has(pathname)) return true;
  if (pathname.startsWith('/youtube/')) return true;
  if (pathname.startsWith('/bandcamp/')) return true;
  if (pathname.startsWith('/internet-archive/')) return true;
  if (pathname.startsWith('/loc/')) return true;
  if (isMusicCollectionApiPath(pathname)) return true;
  if (pathname.startsWith('/generate-practice-track')) return true;
  if (pathname.startsWith('/generate-audio')) return true;
  if (pathname.startsWith('/render-midi')) return true;
  if (pathname.startsWith('/midi-resources/')) return true;
  if (pathname.startsWith('/stems/')) return true;
  if (pathname.startsWith('/snapcast-playback/')) return true;
  if (pathname.startsWith('/cast-playback/')) return true;
  if (pathname.startsWith('/auth/google/')) return true;
  if (pathname.startsWith('/billing/')) return true;
  for (let i = 0; i < STATIC_RESOURCE_PREFIXES.length; i++) {
    if (pathname.startsWith(STATIC_RESOURCE_PREFIXES[i])) return true;
  }
  return false;
}

module.exports = function(app) {
  LOCAL_STATIC_MOUNTS.forEach(function(mount) {
    if (!fs.existsSync(mount.dir)) return;
    app.use(mount.urlPath, express.static(mount.dir, {
      // Missing files (e.g. full MusyngKite) fall through to the resolver proxy.
      maxAge: '1d',
    }));
  });

  // Central billing ledger lives on Cloud Run; local resolver has BILLING_ENABLED=false.
  app.use(
    '/billing',
    createProxyMiddleware({
      target: CLOUD_RESOLVER_TARGET,
      changeOrigin: true,
      secure: true,
    })
  );

  app.use(
    createProxyMiddleware(function(pathname) {
      if (pathname.startsWith('/billing/')) return false;
      return shouldProxyResolver(pathname);
    }, {
      target: 'http://localhost:8787',
      changeOrigin: true,
    })
  );
};
