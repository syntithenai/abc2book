// Preload for Jest when optional native `canvas` is installed but broken.
// jsdom resolves canvas if present; a throwing native bind aborts the suite.
const Module = require('module')
const originalLoad = Module._load
Module._load = function(request, parent, isMain) {
  if (request === 'canvas') {
    return {}
  }
  return originalLoad.apply(this, arguments)
}
