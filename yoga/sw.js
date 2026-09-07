/* Legacy SynthYoga embed removed — unregister and drop caches. */
self.addEventListener('install', (e) => {
  self.skipWaiting()
})
self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
      await self.registration.unregister()
      const clientsList = await self.clients.matchAll({ type: 'window' })
      for (const c of clientsList) {
        const u = new URL(c.url)
        c.navigate('https://yoga.synthfit.online/' + (u.hash || ''))
      }
    })(),
  )
})
