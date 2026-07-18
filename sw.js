const RESOURCES_LIST = ['static/js/198.87bce665.chunk.js', 'static/js/198.87bce665.chunk.js.map', 'static/js/199.3ebd3c2b.chunk.js', 'static/js/199.3ebd3c2b.chunk.js.map', 'static/js/310.78f19e5c.chunk.js', 'static/js/310.78f19e5c.chunk.js.map', 'static/js/404.9179a3fa.chunk.js', 'static/js/404.9179a3fa.chunk.js.LICENSE.txt', 'static/js/404.9179a3fa.chunk.js.map', 'static/js/787.1198a924.chunk.js', 'static/js/787.1198a924.chunk.js.map', 'static/js/808.c3c23036.chunk.js', 'static/js/808.c3c23036.chunk.js.map', 'static/js/96.a6aed848.chunk.js', 'static/js/96.a6aed848.chunk.js.map', 'static/js/main.9f05bcbf.js', 'static/js/main.9f05bcbf.js.LICENSE.txt', 'static/js/main.9f05bcbf.js.map', 'static/css/main.74115c3d.css', 'static/css/main.74115c3d.css.map', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/A0.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/A1.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/A2.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/A3.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/A4.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/A5.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/A6.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/A7.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Ab1.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Ab2.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Ab3.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Ab4.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Ab5.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Ab6.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Ab7.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/B0.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/B1.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/B2.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/B3.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/B4.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/B5.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/B6.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/B7.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Bb0.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Bb1.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Bb2.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Bb3.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Bb4.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Bb5.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Bb6.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Bb7.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/C1.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/C2.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/C3.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/C4.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/C5.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/C6.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/C7.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/C8.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/D1.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/D2.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/D3.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/D4.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/D5.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/D6.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/D7.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Db1.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Db2.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Db3.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Db4.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Db5.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Db6.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Db7.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/E1.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/E2.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/E3.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/E4.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/E5.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/E6.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/E7.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Eb1.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Eb2.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Eb3.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Eb4.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Eb5.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Eb6.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Eb7.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/F1.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/F2.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/F3.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/F4.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/F5.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/F6.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/F7.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/G1.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/G2.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/G3.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/G4.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/G5.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/G6.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/G7.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Gb1.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Gb2.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Gb3.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Gb4.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Gb5.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Gb6.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Gb7.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/A0.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/A1.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/A2.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/A3.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/A4.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/A5.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/A6.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/A7.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Ab1.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Ab2.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Ab3.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Ab4.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Ab5.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Ab6.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Ab7.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/B0.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/B1.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/B2.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/B3.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/B4.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/B5.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/B6.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/B7.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Bb0.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Bb1.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Bb2.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Bb3.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Bb4.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Bb5.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Bb6.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Bb7.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/C1.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/C2.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/C3.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/C4.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/C5.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/C6.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/C7.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/C8.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/D1.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/D2.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/D3.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/D4.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/D5.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/D6.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/D7.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Db1.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Db2.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Db3.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Db4.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Db5.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Db6.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Db7.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/E1.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/E2.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/E3.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/E4.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/E5.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/E6.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/E7.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Eb1.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Eb2.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Eb3.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Eb4.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Eb5.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Eb6.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Eb7.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/F1.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/F2.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/F3.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/F4.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/F5.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/F6.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/F7.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/G1.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/G2.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/G3.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/G4.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/G5.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/G6.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/G7.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Gb1.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Gb2.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Gb3.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Gb4.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Gb5.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Gb6.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3/Gb7.mp3', 'midi-js-soundfonts/selection/MusyngKite/acoustic_grand_piano-mp3.js', 'favicon.ico', 'favicon.png', 'apple-touch-icon.png', 'tunebook-icon.svg', 'manifest.json', 'home-appicon.png', 'home-small.png', 'index.html', 'logo192.png', 'logo512.png', 'robots.txt', 'speakClient.js', 'speakGenerator.js', 'speakWorker.js', 'textsearch_index.json', 'close.png', 'arrow-up.png', 'aubio.js', 'lame.min.js', 'qrcode.js']//// RESOURCES_LIST_MARKER
// Bump this whenever the offline strategy changes so stale/poisoned caches
// from previous versions are dropped on activate.
const CACHE_NAME = 'v19-pitch-roll-range';

// The app is a single page app served from index.html. Every navigation must be
// able to fall back to this cached shell so the app boots with no network.
const APP_SHELL_URL = 'index.html';

const addResourcesToCache = async (resources) => {
  const cache = await caches.open(CACHE_NAME);
  // Add each resource individually. cache.addAll() is atomic: a single missing
  // file would reject the whole batch and leave the app with NO offline cache.
  await Promise.all(resources.map(async (resource) => {
    try {
      await cache.add(resource);
    } catch (e) {
      // Ignore an individual precache miss so the rest still install.
    }
  }));
};

const putInCache = async (request, response) => {
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response);
};

const cacheFirst = async ({ request, preloadResponsePromise }) => {
  // First try to get the resource from the cache
  const responseFromCache = await caches.match(request);
  if (responseFromCache) {
    return responseFromCache;
  }

  // Next try to use the preloaded response, if it's there. Offline, the
  // navigation-preload promise rejects, so this must be guarded - otherwise the
  // error escapes cacheFirst and the browser shows its native "no internet"
  // page instead of our cached app shell.
  try {
    const preloadResponse = await preloadResponsePromise;
    if (preloadResponse) {
      if (preloadResponse.ok) {
        putInCache(request, preloadResponse.clone());
      }
      return preloadResponse;
    }
  } catch (preloadError) {
    // Navigation preload failed (most likely offline). Fall through.
  }

  // Next try to get the resource from the network
  try {
    const responseFromNetwork = await fetch(request);
    // Only cache genuinely good, same-origin responses. Caching error pages
    // (404/500), redirects or opaque responses would poison the cache and serve
    // a broken resource forever once offline.
    if (responseFromNetwork && responseFromNetwork.ok && responseFromNetwork.type === 'basic') {
      putInCache(request, responseFromNetwork.clone());
    }
    return responseFromNetwork;
  } catch (error) {
    // Offline: for page navigations, serve the cached app shell so the SPA can
    // still boot (and then route client-side) regardless of which URL was opened.
    if (request.mode === 'navigate') {
      const shell = await caches.match(APP_SHELL_URL);
      if (shell) {
        return shell;
      }
    }
    // when even the fallback response is not available,
    // there is nothing we can do, but we must always
    // return a Response object
    return new Response('Network error happened', {
      status: 408,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
};

const enableNavigationPreload = async () => {
  if (self.registration.navigationPreload) {
    await self.registration.navigationPreload.enable();
  }
};

function isResolverApiPath(pathname) {
  return pathname === '/health'
    || pathname.indexOf('/youtube/') === 0
    || pathname.indexOf('/proxy-audio') === 0;
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    addResourcesToCache(RESOURCES_LIST)
  );
});

const deleteOldCaches = async () => {
  const keys = await caches.keys();
  await Promise.all(
    keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
  );
};

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    enableNavigationPreload(),
    deleteOldCaches(),
    self.clients.claim(),
  ]));
});

self.addEventListener('fetch', (event) => {
  // Only GET requests are cacheable; let the browser handle POST/PUT/etc.
  if (event.request.method !== 'GET') {
    return;
  }
  const url = new URL(event.request.url);
  // Let the browser handle cross-origin requests (Google login, analytics, ...)
  // so we never try to serve them from our app cache.
  if (url.origin !== self.location.origin) {
    return;
  }
  // The local media resolver API must always hit the network.
  if (isResolverApiPath(url.pathname)) {
    return;
  }
  event.respondWith(
    cacheFirst({
      request: event.request,
      preloadResponsePromise: event.preloadResponse,
    })
  );
});
//348.29 kB  build/static/js/main.bd147af4.js
  //25.61 kB   build/static/css/main.9a0860f6.css
  //1.78 kB    build/static/js/787.1b9724ac.chunk.js
