/** Stops the previously playing collection preview when a new one starts. */
let activeStop = null

export function registerActiveCollectionPlayer(stopFn) {
  if (activeStop && activeStop !== stopFn) {
    try { activeStop() } catch (e) { /* ignore */ }
  }
  activeStop = stopFn
}

export function clearActiveCollectionPlayer(stopFn) {
  if (activeStop === stopFn) activeStop = null
}
