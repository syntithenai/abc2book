(function () {
  const el = document.getElementById('ver')
  if (!el) return

  function showUnavailable() {
    el.textContent = 'unavailable'
  }

  try {
    if (!chrome || !chrome.runtime || !chrome.runtime.id) {
      showUnavailable()
      return
    }
    const connect = chrome.runtime.connect
    if (typeof connect !== 'function') {
      showUnavailable()
      return
    }
    const port = connect.call(chrome.runtime, { name: 'tunebook-ping' })
    let done = false
    const timer = setTimeout(function () {
      if (done) return
      done = true
      try {
        port.disconnect()
      } catch (e) {
        // ignore
      }
      showUnavailable()
    }, 3000)
    port.onMessage.addListener(function (response) {
      if (done) return
      done = true
      clearTimeout(timer)
      el.textContent = (response && response.version) || 'unknown'
      try {
        port.disconnect()
      } catch (e) {
        // ignore
      }
    })
    port.onDisconnect.addListener(function () {
      if (!done) {
        done = true
        clearTimeout(timer)
        showUnavailable()
      }
    })
    port.postMessage({ type: 'tunebook.ping' })
  } catch (e) {
    showUnavailable()
  }
})()
