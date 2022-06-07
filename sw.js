const RESOURCES_LIST = ['static/js/787.1b9724ac.chunk.js', 'static/js/787.1b9724ac.chunk.js.map', 'static/js/main.2a66b090.js', 'static/js/main.2a66b090.js.LICENSE.txt', 'static/js/main.2a66b090.js.map', 'static/css/main.a6bae3b3.css', 'static/css/main.a6bae3b3.css.map', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/A0.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/A1.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/A2.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/A3.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/A4.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/A5.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/A6.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/A7.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Ab1.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Ab2.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Ab3.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Ab4.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Ab5.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Ab6.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Ab7.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/B0.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/B1.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/B2.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/B3.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/B4.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/B5.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/B6.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/B7.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Bb0.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Bb1.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Bb2.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Bb3.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Bb4.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Bb5.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Bb6.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Bb7.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/C1.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/C2.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/C3.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/C4.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/C5.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/C6.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/C7.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/C8.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/D1.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/D2.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/D3.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/D4.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/D5.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/D6.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/D7.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Db1.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Db2.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Db3.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Db4.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Db5.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Db6.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Db7.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/E1.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/E2.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/E3.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/E4.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/E5.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/E6.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/E7.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Eb1.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Eb2.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Eb3.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Eb4.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Eb5.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Eb6.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Eb7.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/F1.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/F2.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/F3.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/F4.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/F5.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/F6.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/F7.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/G1.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/G2.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/G3.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/G4.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/G5.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/G6.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/G7.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Gb1.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Gb2.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Gb3.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Gb4.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Gb5.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Gb6.mp3', 'midi-js-soundfonts/abcjs/acoustic_grand_piano-mp3/Gb7.mp3', 'favicon.ico', 'home-appicon.png', 'home-small.png', 'index.html', 'logo192.png', 'logo512.png', 'robots.txt', 'speakClient.js', 'speakGenerator.js', 'speakWorker.js', 'textsearch_index.json', 'close.png', 'arrow-up.png']//// RESOURCES_LIST_MARKER
const addResourcesToCache = async (resources) => {
  const cache = await caches.open('v1');
  //console.log('add to cache',resources,cache)
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
    addResourcesToCache(RESOURCES_LIST)
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
//348.29 kB  build/static/js/main.bd147af4.js
  //25.61 kB   build/static/css/main.9a0860f6.css
  //1.78 kB    build/static/js/787.1b9724ac.chunk.js
