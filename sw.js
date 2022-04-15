const addResourcesToCache = async (resources) => {
  const cache = await caches.open('v1');
  await cache.addAll(resources);
};

const putInCache = async (request, response) => {
  const cache = await caches.open('v1');
  await cache.put(request, response);
};

const cacheFirst = async ({ request, preloadResponsePromise, fallbackUrl }) => {
  // First try to get the resource from the cache
  const responseFromCache = await caches.match(request);
  if (responseFromCache) {
    return responseFromCache;
  }

  // Next try to use the preloaded response, if it's there
  const preloadResponse = await preloadResponsePromise;
  if (preloadResponse) {
    console.info('using preload response', preloadResponse);
    putInCache(request, preloadResponse.clone());
    return preloadResponse;
  }

  // Next try to get the resource from the network
  try {
    const responseFromNetwork = await fetch(request);
    // response may be used only once
    // we need to save clone to put one copy in cache
    // and serve second one
    putInCache(request, responseFromNetwork.clone());
    return responseFromNetwork;
  } catch (error) {
    const fallbackResponse = await caches.match(fallbackUrl);
    if (fallbackResponse) {
      return fallbackResponse;
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
    // Enable navigation preloads!
    await self.registration.navigationPreload.enable();
  }
};

self.addEventListener('activate', (event) => {
  event.waitUntil(enableNavigationPreload());
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    addResourcesToCache([
      'abc2book2.js',
      'abc2book.audio.js',
      'abc2book.converters.js',
      'abc2book.indexes.js',
      'abc2book.js',
      'abc2book.persist.js',
      'abc2book.review.js',
      'abc2book.tunelists.js',
      'abc2book.utils.js',
      'abc2svg.js',
      'abcjs-audio.css',
      'bootstrap.min.css',
      'home.png',
      'home-small.png',
      'index.html',
      'jquery-3.6.0.min.js',
      'manifest.json',
      'NoSleep.min.js',
      'package.json',
      'package-lock.json',
      'qrcode.min.js',
      'qrcode.png',
      'speakClient.js',
      'speakGenerator.js',
      'speakWorker.js',
      'textsearch_index.json',
      'three-dots-svgrepo-com.svg',
      'waiting.gif'
    ])
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    cacheFirst({
      request: event.request,
      preloadResponsePromise: event.preloadResponse,
      fallbackUrl: '/home.png',
    })
  );
});
